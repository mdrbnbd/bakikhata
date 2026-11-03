/* বাকি খাতা — phone-number login (OTP) + per-user cloud sync, offline-first.
   INACTIVE until firebase-config.js sets BK_FIREBASE.enabled AND the native Firebase plugins are in the APK.
   Screens only call this module's API; the backend is a swappable adapter:
     adapter.sendOtp(phoneE164) → {verificationId} | {user} (Android may auto-verify)
     adapter.confirmOtp(verificationId, code) → {uid, phone}
     adapter.currentUser() → {uid, phone} | null
     adapter.signOut()
     adapter.pull(uid, store, sinceMs) → rows[]       (Firestore: users/{uid}/{store}/{id}, where updatedAt > since)
     adapter.push(uid, store, rows)                   (batched set/merge)
     adapter.putProfile(uid, profile) / getProfile(uid)
   Sync = push local dirty rows, pull rows newer than the last pull; conflicts resolve last-writer-wins on updatedAt
   (rows are never hard-deleted: deleted=1 tombstones propagate). Local IndexedDB stays the source the UI reads. */
(() => {
'use strict';
const OVERLAP = 5 * 60 * 1000;   // re-pull a 5-minute window to tolerate clock skew between phones (merge is idempotent)

/* ---------- Firebase adapter (Capacitor Firebase plugins; compiled in only after Robin provides google-services.json) ---------- */
function firebaseAdapter() {
  const Auth = U.plugin('FirebaseAuthentication'), Fs = U.plugin('FirebaseFirestore');
  if (!Auth || !Fs) return null;
  const col = (uid, store) => `users/${uid}/${store}`;
  return {
    name: 'firebase',
    sendOtp: phone => new Promise(async (resolve, reject) => {
      const hs = [];
      const done = (f, v) => { hs.forEach(h => h.remove && h.remove()); f(v); };
      hs.push(await Auth.addListener('phoneCodeSent', e => done(resolve, {verificationId: e.verificationId})));
      hs.push(await Auth.addListener('phoneVerificationCompleted', e => done(resolve, {user: e.user && {uid: e.user.uid, phone: e.user.phoneNumber}})));
      hs.push(await Auth.addListener('phoneVerificationFailed', e => done(reject, new Error(e.message || 'OTP পাঠানো যায়নি'))));
      Auth.signInWithPhoneNumber({phoneNumber: phone}).catch(err => done(reject, err));
    }),
    async confirmOtp(verificationId, code) {
      const r = await Auth.confirmVerificationCode({verificationId, verificationCode: code});
      return {uid: r.user.uid, phone: r.user.phoneNumber};
    },
    async currentUser() { const r = await Auth.getCurrentUser(); return r.user ? {uid: r.user.uid, phone: r.user.phoneNumber} : null; },
    signOut: () => Auth.signOut(),
    async pull(uid, store, since) {
      const r = await Fs.getCollection({reference: col(uid, store),
        compositeFilter: {type: 'and', queryConstraints: [{type: 'where', fieldPath: 'updatedAt', opStr: '>', value: since}]}});
      return (r.snapshots || []).map(s => s.data).filter(Boolean);
    },
    async push(uid, store, rows) {
      for (let i = 0; i < rows.length; i += 400) {
        await Fs.writeBatch({operations: rows.slice(i, i + 400).map(({dirty, ...d}) => ({type: 'set', reference: `${col(uid, store)}/${d.id}`, data: d, options: {merge: true}}))});
      }
    },
    putProfile: (uid, profile) => Fs.setDocument({reference: `users/${uid}`, data: {profile, updatedAt: Date.now()}, merge: true}),
    async getProfile(uid) { const r = await Fs.getDocument({reference: `users/${uid}`}); return r.snapshot && r.snapshot.data ? r.snapshot.data.profile : null; }
  };
}

let adapter = null, syncing = null;
const cfg = () => window.BK_FIREBASE || null;
function enabled() {
  if (adapter) return true;
  if (!cfg() || !cfg().enabled) return false;
  adapter = firebaseAdapter();
  return !!adapter;
}
const user = () => DB.meta.get('cloudUser');
function status() {
  if (!enabled()) return {on: false, text: 'ক্লাউড ব্যাকআপ এখনও চালু হয়নি — সব তথ্য এই ফোনেই আছে। নিয়মিত "ব্যাকআপ ফাইল" রাখুন।'};
  const u = user(), last = DB.meta.get('lastSync');
  if (!u) return {on: true, signedIn: false, text: 'লগইন করা নেই'};
  return {on: true, signedIn: true, text: `লগইন: ${U.bn(U.normPhone(u.phone))}` + (last ? ` · শেষ সিঙ্ক ${U.timeBn(last)}` : '')};
}
async function sendOtp(phone) { if (!enabled()) throw new Error('ক্লাউড চালু নেই'); return adapter.sendOtp(U.e164(phone)); }
async function confirmOtp(verificationId, code) {
  const u = await adapter.confirmOtp(verificationId, U.toAscii(code));
  await signedIn(u); return u;
}
async function signedIn(u) {
  await DB.meta.set('cloudUser', u);
  // phone change / reinstall: bring back the profile, then everything else
  const remote = await adapter.getProfile(u.uid).catch(() => null);
  const local = DB.meta.get('profile');
  if (remote && (!local || !local.verified)) await DB.meta.set('profile', {...(local || {}), ...remote});   // account's saved shop info wins over a fresh form
  await sync(true);
}
async function signOut() { if (adapter) await adapter.signOut(); await DB.meta.set('cloudUser', null); }
async function sync(full = false) {
  if (!enabled() || !user()) return {skipped: true};
  if (syncing) return syncing;
  syncing = (async () => {
    const uid = user().uid, marks = DB.meta.get('pullMarks') || {};
    let pulled = 0, pushed = 0;
    for (const s of DB.SYNCED) {
      const since = full ? 0 : Math.max(0, (marks[s] || 0) - OVERLAP);
      const rows = await adapter.pull(uid, s, since);
      let max = marks[s] || 0;
      for (const r of rows) { if (await DB.mergeRemote(s, r)) pulled++; max = Math.max(max, r.updatedAt || 0); }
      marks[s] = max;
      const d = DB.dirty(s);
      if (d.length) { await adapter.push(uid, s, d); await DB.markClean(s, d.map(r => r.id)); pushed += d.length; }
    }
    if (DB.meta.get('profile')) await adapter.putProfile(uid, DB.meta.get('profile'));
    await DB.meta.set('pullMarks', marks);
    await DB.meta.set('lastSync', Date.now());
    return {pulled, pushed};
  })();
  try { return await syncing; } finally { syncing = null; }
}
let timer;
function schedule() { if (!enabled() || !user()) return; clearTimeout(timer); timer = setTimeout(() => sync().catch(e => console.warn('sync', e)), 4000); }
window.Cloud = {enabled, status, sendOtp, confirmOtp, signOut, sync, schedule, user, completeSignIn: signedIn,
  _setAdapter(a) { adapter = a; }   // tests / future backends
};
})();
