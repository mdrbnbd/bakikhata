/* বাকি খাতা — on-device storage (IndexedDB, write-through in-memory cache).
   Every synced record carries: id (uuid), createdAt, updatedAt (ms), deleted (0/1 tombstone), dirty (1 = not yet pushed to cloud).
   That makes the store "offline-first": the app always reads/writes locally; cloud.js can later push dirty rows
   and pull newer rows (last-writer-wins on updatedAt) without changing any screen code. */
(() => {
'use strict';
const NAME = 'bakikhata', VERSION = 1;
const SYNCED = ['parties', 'entries', 'txns', 'cash', 'products'];
const STORES = [...SYNCED, 'meta'];
let idb = null;
const mem = {};
STORES.forEach(s => mem[s] = new Map());
const listeners = new Set();

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of SYNCED) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, {keyPath: 'id'}).createIndex('updatedAt', 'updatedAt');
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', {keyPath: 'key'});
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('IndexedDB blocked'));
  });
}
const tx = (store, mode, fn) => new Promise((res, rej) => {
  const t = idb.transaction(store, mode); const os = t.objectStore(store);
  const out = fn(os);
  t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
  t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted'));
});
const getAll = store => new Promise((res, rej) => {
  const r = idb.transaction(store).objectStore(store).getAll();
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});

async function init() {
  idb = await open();
  for (const s of STORES) {
    const rows = await getAll(s);
    mem[s].clear();
    for (const r of rows) mem[s].set(s === 'meta' ? r.key : r.id, s === 'meta' ? r.value : r);
  }
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch {}
}
const notify = (store, rec) => listeners.forEach(f => { try { f(store, rec); } catch (e) { console.error(e); } });

const list = store => [...mem[store].values()].filter(r => !r.deleted);
const get = (store, id) => { const r = mem[store].get(id); return r && !r.deleted ? r : null; };
async function put(store, obj, {fromSync = false} = {}) {
  const now = Date.now();
  const rec = {...obj};
  if (!rec.id) rec.id = U.uid();
  if (!rec.createdAt) rec.createdAt = now;
  if (!fromSync) { rec.updatedAt = Math.max(now, ((mem[store].get(rec.id) || {}).updatedAt || 0) + 1); rec.dirty = 1; }
  rec.deleted = rec.deleted ? 1 : 0;
  await tx(store, 'readwrite', os => os.put(rec));
  mem[store].set(rec.id, rec);
  notify(store, rec);
  return rec;
}
async function remove(store, id) {
  const r = mem[store].get(id); if (!r) return;
  return put(store, {...r, deleted: 1});
}
// many writes in one IDB transaction (sale + ledger entry + cash row stay consistent)
async function putMany(items) {
  const now = Date.now(); const byStore = {};
  const recs = items.map(([store, obj]) => {
    const rec = {...obj};
    if (!rec.id) rec.id = U.uid();
    if (!rec.createdAt) rec.createdAt = now;
    rec.updatedAt = Math.max(now, ((mem[store].get(rec.id) || {}).updatedAt || 0) + 1); rec.dirty = 1;
    rec.deleted = rec.deleted ? 1 : 0;
    (byStore[store] = byStore[store] || []).push(rec);
    return [store, rec];
  });
  await new Promise((res, rej) => {
    const t = idb.transaction(Object.keys(byStore), 'readwrite');
    for (const s in byStore) { const os = t.objectStore(s); byStore[s].forEach(r => os.put(r)); }
    t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted'));
  });
  recs.forEach(([s, r]) => { mem[s].set(r.id, r); notify(s, r); });
  return recs.map(x => x[1]);
}
const meta = {
  get: (k, d = null) => mem.meta.has(k) ? mem.meta.get(k) : d,
  async set(k, v) { await tx('meta', 'readwrite', os => os.put({key: k, value: v})); mem.meta.set(k, v); notify('meta', {key: k, value: v}); }
};
// ---- sync helpers (used by cloud.js) ----
const dirty = store => [...mem[store].values()].filter(r => r.dirty);
async function markClean(store, ids) {
  const recs = ids.map(id => mem[store].get(id)).filter(Boolean).map(r => ({...r, dirty: 0}));
  if (!recs.length) return;
  await new Promise((res, rej) => { const t = idb.transaction(store, 'readwrite'); const os = t.objectStore(store);
    recs.forEach(r => os.put(r)); t.oncomplete = res; t.onerror = () => rej(t.error); });
  recs.forEach(r => mem[store].set(r.id, r));
}
// merge a remote/imported row: last-writer-wins on updatedAt; returns true if applied
async function mergeRemote(store, row, markDirty = false) {
  if (!SYNCED.includes(store) || !row || !row.id) return false;
  const cur = mem[store].get(row.id);
  if (cur && (cur.updatedAt || 0) >= (row.updatedAt || 0)) return false;
  await put(store, {...row, updatedAt: row.updatedAt || Date.now(), dirty: markDirty ? 1 : 0}, {fromSync: true});
  return true;
}
function exportAll() {
  const data = {};
  for (const s of SYNCED) data[s] = [...mem[s].values()].map(({dirty, ...r}) => r);
  return {app: 'bakikhata', format: 1, exportedAt: new Date().toISOString(),
    profile: meta.get('profile'), settings: publicSettings(), data};
}
function publicSettings() { const s = {...(meta.get('settings') || {})}; return s; }
async function importMerge(obj) {
  if (!obj || obj.app !== 'bakikhata' || !obj.data) throw new Error('এটি বাকি খাতার ব্যাকআপ ফাইল নয়');
  let n = 0;
  for (const s of SYNCED) for (const row of (obj.data[s] || [])) { if (await mergeRemote(s, {...row}, true)) n++; }
  if (obj.profile && !meta.get('profile')) await meta.set('profile', obj.profile);
  return n;
}
async function wipe() {
  for (const s of STORES) { await tx(s, 'readwrite', os => os.clear()); mem[s].clear(); }
}
window.DB = {init, list, get, put, putMany, remove, meta, dirty, markClean, mergeRemote, exportAll, importMerge, wipe,
  SYNCED, on: f => listeners.add(f), _mem: mem};
})();
