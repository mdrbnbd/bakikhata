/* dFaster Note — screens, router, sheets, lock, onboarding */
(() => {
'use strict';
const {$, $$, esc, money, moneyAbs, bn, ymd} = U;
const view = $('#view');
const S = () => DB.meta.get('settings') || {};
const setS = async patch => DB.meta.set('settings', {...S(), ...patch});
const VERSION = '1.1.0';

/* ================= router ================= */
let route = {name: 'home', args: []};
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function parse() { const [name, ...args] = (location.hash.replace(/^#\/?/, '') || 'home').split('/'); return {name, args: args.map(decodeURIComponent)}; }
const NAVMAP = {home: 'home', parties: 'parties', party: 'parties', trade: 'trade', cash: 'cash', reports: 'reports', settings: '', products: ''};
function render() {
  route = parse();
  const fn = VIEWS[route.name] || VIEWS.home;
  $$('#bottomNav button').forEach(b => b.classList.toggle('on', b.dataset.nav === NAVMAP[route.name]));
  view.innerHTML = '';
  fn(...route.args);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
// back: close sheet → previous screen → (Android) leave app. MainActivity asks bkBack() first.
window.bkBack = () => {
  if (!$('#sheet').classList.contains('hidden')) { closeSheet(); return true; }
  if (!$('#lock').classList.contains('hidden') || !$('#onboard').classList.contains('hidden')) return 'exit';
  return false;
};
$('#bottomNav').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const n = b.dataset.nav;
  if (n === 'back') { if (!bkBack()) { if (history.length > 1 && parse().name !== 'home') history.back(); else go('#/home'); } return; }
  closeSheet(); go('#/' + n);
});
$('#setBtn').onclick = () => go('#/settings');
$('#brand').onclick = () => go('#/home');
$('#themeBtn').onclick = async () => { const dark = document.documentElement.dataset.theme !== 'dark'; await setS({theme: dark ? 'dark' : 'light'}); applyTheme(); };
function applyTheme() {
  const t = S().theme || 'auto';
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#themeBtn').textContent = dark ? '☀️' : '🌙';
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#11251d' : '#0b6e4f';
}
function applyProfile() {
  const p = DB.meta.get('profile') || {};
  $('#shopTitle').textContent = p.shopName || 'dFaster Note';
  $('#subTitle').textContent = p.shopName ? 'dFaster Note' + (p.ownerName ? ' · ' + p.ownerName : '') : 'ডিজিটাল দোকানের হিসাব';
}

/* ================= sheet ================= */
let sheetClose = null;
function openSheet(html, onMount, onClose) {
  $('#sheetCard').innerHTML = '<div class="grab"></div>' + html;
  $('#sheet').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  sheetClose = onClose || null;
  if (onMount) onMount($('#sheetCard'));
  const f = $('#sheetCard [autofocus]'); if (f) setTimeout(() => f.focus(), 120);
}
function closeSheet() {
  if ($('#sheet').classList.contains('hidden')) return;
  $('#sheet').classList.add('hidden'); $('#sheetCard').innerHTML = ''; document.body.style.overflow = '';
  const f = sheetClose; sheetClose = null; if (f) f();
}
$('#sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
function confirmSheet(title, msg, okLabel = 'হ্যাঁ', danger = true) {
  return new Promise(res => {
    let ok = false;
    openSheet(`<h2>${esc(title)}</h2><p class="muted">${msg}</p><div class="btns"><button class="btn" data-close>না</button><button class="btn ${danger ? 'gave' : 'primary'}" id="cfOk">${esc(okLabel)}</button></div>`,
      c => { $('#cfOk', c).onclick = () => { ok = true; closeSheet(); }; }, () => res(ok));
  });
}

/* ================= small renderers ================= */
const initials = n => esc((n || '?').trim().charAt(0).toUpperCase());
const avatar = (p, big) => `<div class="avatar${big ? ' big' : ''}">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : initials(p.name)}</div>`;
function balHtml(b, small) {
  if (b > 0) return `<span class="get">${money(b)}</span>${small ? '<small class="get">পাবো</small>' : ''}`;
  if (b < 0) return `<span class="give">${moneyAbs(b)}</span>${small ? '<small class="give">দেবো</small>' : ''}`;
  return `<span class="muted">${money(0)}</span>${small ? '<small class="muted">হিসাব সমান</small>' : ''}`;
}
const typeBn = t => t === 'supplier' ? 'সাপ্লায়ার' : 'কাস্টমার';
function partyRow(p, bal) {
  return `<button class="row" data-party="${p.id}">${avatar(p)}<div class="main"><div class="t">${esc(p.name)}</div><div class="s">${p.phone ? '📞 ' + bn(p.phone) : typeBn(p.type)}</div></div><div class="amt">${balHtml(bal, true)}</div></button>`;
}
function txnRow(t) {
  const p = t.partyId ? DB.get('parties', t.partyId) : null;
  const items = (t.items || []).map(i => i.name).join(', ');
  return `<button class="row" data-txn="${t.id}"><div class="avatar">${t.type === 'sale' ? '🧾' : '📦'}</div><div class="main"><div class="t">${t.type === 'sale' ? 'বিক্রয়' : 'ক্রয়'}${p ? ' · ' + esc(p.name) : ''} <span class="badge ${t.due > 0 ? 'due' : ''}">${t.due > 0 ? (t.paid > 0 ? 'আংশিক বাকি' : 'বাকি') : 'নগদ'}</span></div><div class="s">${U.dateShort(t.date)}${items ? ' · ' + esc(items) : t.note ? ' · ' + esc(t.note) : ''}</div></div><div class="amt ${t.type === 'sale' ? 'get' : 'give'}">${money(t.total)}${t.due > 0 ? `<small class="give">বাকি ${money(t.due)}</small>` : ''}</div></button>`;
}
function cashRow(c) {
  const sign = c.kind === 'in' ? '+' : '−';
  const lbl = c.kind === 'expense' ? 'খরচ' : c.kind === 'in' ? 'ক্যাশ ইন' : 'ক্যাশ আউট';
  return `<button class="row" data-cash="${c.id}"><div class="avatar">${c.kind === 'expense' ? '🧾' : c.kind === 'in' ? '⬇️' : '⬆️'}</div><div class="main"><div class="t">${esc(c.category || lbl)}</div><div class="s">${lbl} · ${U.dateShort(c.date)}${c.note ? ' · ' + esc(c.note) : ''}</div></div><div class="amt ${c.kind === 'in' ? 'get' : 'give'}">${sign}${money(c.amount)}</div></button>`;
}
function entryRow(e) {
  const p = DB.get('parties', e.partyId) || {name: '?'};
  return `<button class="row" data-entry="${e.id}">${avatar(p)}<div class="main"><div class="t">${esc(p.name)} · ${e.kind === 'gave' ? 'দিলাম' : 'পেলাম'}</div><div class="s">${U.dateShort(e.date)}${e.note ? ' · ' + esc(e.note) : ''}</div></div><div class="amt ${e.kind === 'gave' ? 'give' : 'get'}">${money(e.amount)}</div></button>`;
}
function bindRows(root) {
  root.addEventListener('click', e => {
    const r = e.target.closest('[data-party],[data-txn],[data-cash],[data-entry]'); if (!r) return;
    if (r.dataset.party) go('#/party/' + r.dataset.party);
    else if (r.dataset.txn) txnForm({id: r.dataset.txn});
    else if (r.dataset.cash) cashForm({id: r.dataset.cash});
    else if (r.dataset.entry) entryForm({id: r.dataset.entry});
  });
}

/* ================= HOME ================= */
function home() {
  const t = Book.totals(), today = ymd(), mStart = today.slice(0, 8) + '01';
  const s = Book.txnSummary(today, today, 'sale'), pu = Book.txnSummary(today, today, 'purchase'), c = Book.cashSummary(today, today);
  const ms = Book.txnSummary(mStart, today, 'sale');
  const recent = [...DB.list('txns').map(x => ({k: 't', x})), ...DB.list('entries').filter(e => !e.src).map(x => ({k: 'e', x})), ...DB.list('cash').filter(c => !c.src).map(x => ({k: 'c', x}))]
    .sort((a, b) => b.x.createdAt - a.x.createdAt).slice(0, 8);
  const lb = S().lastBackup;
  view.innerHTML = `
  <div class="grid2">
    <button class="stat get" data-go="#/parties/customer"><div class="lbl">মোট পাবো (${bn(t.nRec)} জন)</div><div class="val" id="totRec">${money(t.receivable)}</div></button>
    <button class="stat give" data-go="#/parties/supplier"><div class="lbl">মোট দেবো (${bn(t.nPay)} জন)</div><div class="val" id="totPay">${money(t.payable)}</div></button>
  </div>
  <h2>আজ · ${U.dateBn(today)}</h2>
  <div class="grid2">
    <button class="stat mini" data-go="#/trade/sale"><div class="lbl">আজকের বিক্রয়</div><div class="val" id="todaySale">${money(s.total)}</div></button>
    <button class="stat mini" data-go="#/trade/purchase"><div class="lbl">আজকের ক্রয়</div><div class="val">${money(pu.total)}</div></button>
    <button class="stat mini" data-go="#/cash"><div class="lbl">ক্যাশে আছে</div><div class="val" id="cashHand">${money(Book.cashInHand())}</div></button>
    <button class="stat mini" data-go="#/cash"><div class="lbl">আজ ক্যাশ ইন / আউট</div><div class="val"><span class="get">${money(c.inn)}</span> <span class="muted small">/</span> <span class="give">${money(c.out + c.exp)}</span></div></button>
  </div>
  <p class="small muted" style="margin:6px 2px 0">এই মাসের বিক্রয়: <b>${money(ms.total)}</b> (${bn(ms.n)}টি)</p>
  <h2>দ্রুত যোগ করুন</h2>
  <div class="quick" id="quick">
    <button data-q="sale-cash"><b>💵</b>নগদ বিক্রয়</button>
    <button data-q="sale-due"><b>📝</b>বাকিতে বিক্রয়</button>
    <button data-q="gave"><b>📤</b>দিলাম</button>
    <button data-q="got"><b>📥</b>পেলাম</button>
    <button data-q="purchase"><b>📦</b>ক্রয়</button>
    <button data-q="expense"><b>🧾</b>খরচ</button>
    <button data-q="customer"><b>➕</b>নতুন কাস্টমার</button>
    <button data-q="remind"><b>🔔</b>তাগাদা</button>
  </div>
  ${Cloud.enabled() && !Cloud.user() ? `<div class="note warn">☁️ হিসাব এখন শুধু এই ফোনে। <a href="#" id="hLogin">লগইন / রেজিস্ট্রেশন</a> করলে সব হিসাব নিরাপদে ক্লাউডে থাকবে, নতুন ফোনেও ফিরে পাবেন।</div>` : ''}
  ${!S().pinHash ? `<div class="note">🔒 অন্য কেউ যেন আপনার হিসাব দেখতে না পারে — <a href="#/settings">সেটিংসে PIN লক</a> চালু করুন।</div>` : ''}
  ${!Cloud.user() && (!lb || Date.now() - lb > 7 * 864e5) ? `<div class="note warn">💾 ${lb ? 'শেষ ব্যাকআপ ' + bn(Math.floor((Date.now() - lb) / 864e5)) + ' দিন আগে।' : 'এখনও কোনো ব্যাকআপ নেওয়া হয়নি।'} ফোন হারালে হিসাব ফেরত পেতে <a href="#/settings">ব্যাকআপ ফাইল</a> রাখুন।</div>` : ''}
  <h2>সাম্প্রতিক লেনদেন</h2>
  <div class="list" id="recent">${recent.length ? recent.map(r => r.k === 't' ? txnRow(r.x) : r.k === 'c' ? cashRow(r.x) : entryRow(r.x)).join('') : '<div class="empty">এখনও কোনো লেনদেন নেই।<br>উপরের বোতাম থেকে শুরু করুন।</div>'}</div>`;
  $$('[data-go]', view).forEach(b => b.onclick = () => go(b.dataset.go));
  $('#quick').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    ({ 'sale-cash': () => txnForm({type: 'sale', mode: 'cash'}), 'sale-due': () => txnForm({type: 'sale', mode: 'due'}),
       gave: () => pickParty('customer', p => entryForm({partyId: p.id, kind: 'gave'})), got: () => pickParty('customer', p => entryForm({partyId: p.id, kind: 'got'})),
       purchase: () => txnForm({type: 'purchase', mode: 'cash'}), expense: () => cashForm({kind: 'expense'}),
       customer: () => partyForm({type: 'customer'}), remind: () => pickParty('customer', p => remind(p), true) })[b.dataset.q]();
  };
  if ($('#hLogin', view)) $('#hLogin', view).onclick = e => { e.preventDefault(); authScreen(); };
  bindRows(view);
}

/* ================= PARTIES ================= */
let partyQ = '';
function parties(type = 'customer') {
  const bals = Book.balances();
  const all = Book.parties(type).map(p => ({p, b: Math.round((bals.get(p.id) || 0) * 100) / 100}));
  const cnt = t => Book.parties(t).length;
  const sum = all.reduce((a, x) => { if (x.b > 0) a.r += x.b; else a.d -= x.b; return a; }, {r: 0, d: 0});
  view.innerHTML = `
  <div class="tabs"><button data-t="customer" class="${type === 'customer' ? 'on' : ''}">কাস্টমার (${bn(cnt('customer'))})</button><button data-t="supplier" class="${type === 'supplier' ? 'on' : ''}">সাপ্লায়ার (${bn(cnt('supplier'))})</button></div>
  <div class="grid2" style="margin-bottom:10px"><div class="stat get mini"><div class="lbl">পাবো</div><div class="val">${money(sum.r)}</div></div><div class="stat give mini"><div class="lbl">দেবো</div><div class="val">${money(sum.d)}</div></div></div>
  <input class="input search" id="pq" type="search" placeholder="🔍 নাম বা ফোন নম্বর দিয়ে খুঁজুন" value="${esc(partyQ)}">
  <div class="list" id="plist"></div>
  <button class="fab" id="addParty">＋ নতুন ${typeBn(type)}</button>`;
  const draw = () => {
    const q = partyQ.trim().toLowerCase(), qd = U.toAscii(q);
    const rows = all.filter(x => !q || x.p.name.toLowerCase().includes(q) || (qd && (x.p.phone || '').includes(qd)))
      .sort((a, b) => (type === 'supplier' ? a.b - b.b : b.b - a.b) || a.p.name.localeCompare(b.p.name, 'bn'));
    $('#plist').innerHTML = rows.length ? rows.map(x => partyRow(x.p, x.b)).join('') : `<div class="empty">${all.length ? 'কিছু পাওয়া যায়নি' : `এখনও কোনো ${typeBn(type)} নেই`}</div>`;
  };
  draw();
  $('#pq').oninput = e => { partyQ = e.target.value; draw(); };
  $$('.tabs button', view).forEach(b => b.onclick = () => go('#/parties/' + b.dataset.t));
  $('#addParty').onclick = () => partyForm({type});
  bindRows(view);
}
function partyForm(p = {}) {
  const edit = !!p.id; if (edit) p = DB.get('parties', p.id);
  let photo = p.photo || '';
  openSheet(`<h2>${edit ? 'তথ্য বদলান' : 'নতুন ' + typeBn(p.type)}</h2>
    <div class="seg" id="ptype"><button data-v="customer" class="${p.type !== 'supplier' ? 'on' : ''}">কাস্টমার</button><button data-v="supplier" class="${p.type === 'supplier' ? 'on' : ''}">সাপ্লায়ার</button></div>
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px"><div id="pphoto">${avatar({name: p.name || '?', photo}, true)}</div>
      <label class="btn" style="flex:1">📷 ছবি (ঐচ্ছিক)<input type="file" accept="image/*" id="pfile" hidden></label>${photo ? '<button class="btn danger" id="prm">✕</button>' : ''}</div>
    <label class="field"><span>নাম *</span><input class="input" id="pname" value="${esc(p.name || '')}" autofocus autocomplete="off"></label>
    <label class="field"><span>মোবাইল নম্বর</span><input class="input" id="pphone" type="tel" inputmode="tel" placeholder="01XXXXXXXXX" value="${esc(p.phone || '')}"></label>
    <label class="field"><span>ঠিকানা</span><input class="input" id="paddr" value="${esc(p.address || '')}"></label>
    ${!edit ? `<label class="field"><span>আগের বাকি (থাকলে)</span><input class="input" id="popen" inputmode="decimal" placeholder="০"></label>` : ''}
    <div class="btns">${edit ? '<button class="btn danger" id="pdel">🗑 মুছুন</button>' : ''}<button class="btn primary" id="psave">সংরক্ষণ</button></div>`, c => {
    let type = p.type || 'customer';
    $('#ptype', c).onclick = e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.v; $$('#ptype button', c).forEach(x => x.classList.toggle('on', x === b)); };
    $('#pfile', c).onchange = async e => { const f = e.target.files[0]; if (!f) return; photo = await resizeImage(f, 160); $('#pphoto', c).innerHTML = avatar({name: 'x', photo}, true); };
    if ($('#prm', c)) $('#prm', c).onclick = () => { photo = ''; $('#pphoto', c).innerHTML = avatar({name: $('#pname', c).value || '?'}, true); };
    $('#psave', c).onclick = async () => {
      const phone = $('#pphone', c).value.trim();
      if (phone && !U.validBdPhone(phone)) return U.toast('সঠিক মোবাইল নম্বর লিখুন (01XXXXXXXXX)');
      try {
        const saved = await Book.saveParty({...p, type, name: $('#pname', c).value, phone, address: $('#paddr', c).value.trim(), photo});
        const open = !edit ? U.num($('#popen', c).value) : 0;
        if (open > 0) await Book.saveEntry({partyId: saved.id, kind: type === 'supplier' ? 'got' : 'gave', amount: open, date: ymd(), note: 'আগের বাকি'});
        closeSheet(); U.toast('সংরক্ষণ হয়েছে'); Cloud.schedule(); edit ? render() : go('#/party/' + saved.id);
      } catch (err) { U.toast(err.message); }
    };
    if ($('#pdel', c)) $('#pdel', c).onclick = async () => {
      closeSheet();
      if (await confirmSheet('মুছে ফেলবেন?', `${esc(p.name)}-এর সব হিসাব মুছে যাবে। এটি ফেরত আনা যাবে না (ব্যাকআপ থাকলে ছাড়া)।`, 'মুছে ফেলুন')) {
        await Book.deleteParty(p.id); U.toast('মুছে ফেলা হয়েছে'); Cloud.schedule(); go('#/parties/' + p.type);
      }
    };
  });
}
function resizeImage(file, max) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(img.src); res(cv.toDataURL('image/jpeg', .8));
    }; img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}
function pickParty(type, cb, withDueOnly) {
  const bals = Book.balances();
  let list = Book.parties().map(p => ({p, b: Math.round((bals.get(p.id) || 0) * 100) / 100}));
  if (withDueOnly) list = list.filter(x => x.b > 0 && x.p.phone);
  list.sort((a, b) => (a.p.type === type ? -1 : 1) - (b.p.type === type ? -1 : 1) || b.b - a.b);
  openSheet(`<h2>${withDueOnly ? 'কাকে তাগাদা দেবেন?' : 'কার খাতায়?'}</h2>
    <input class="input search" id="ppq" type="search" placeholder="🔍 খুঁজুন">
    <div class="list" id="ppl" style="max-height:52vh;overflow:auto"></div>
    ${withDueOnly ? '' : `<button class="btn block" id="ppnew" style="margin-top:10px">＋ নতুন ${typeBn(type)}</button>`}`, c => {
    const draw = q => { const r = list.filter(x => !q || x.p.name.toLowerCase().includes(q.toLowerCase()) || (x.p.phone || '').includes(U.toAscii(q)));
      $('#ppl', c).innerHTML = r.length ? r.map(x => partyRow(x.p, x.b)).join('') : `<div class="empty">${withDueOnly ? 'ফোন নম্বরসহ বাকি থাকা কোনো কাস্টমার নেই' : 'কেউ নেই'}</div>`; };
    draw(''); $('#ppq', c).oninput = e => draw(e.target.value);
    $('#ppl', c).onclick = e => { const r = e.target.closest('[data-party]'); if (!r) return; const p = DB.get('parties', r.dataset.party); closeSheet(); cb(p); };
    if ($('#ppnew', c)) $('#ppnew', c).onclick = () => { closeSheet(); partyFormThen(type, p => cb(p)); };
  });
}
function partyFormThen(type, cb) {
  openSheet(`<h2>নতুন ${typeBn(type)}</h2>
    <label class="field"><span>নাম *</span><input class="input" id="qn" autofocus></label>
    <label class="field"><span>মোবাইল নম্বর</span><input class="input" id="qp" type="tel" inputmode="tel" placeholder="01XXXXXXXXX"></label>
    <button class="btn primary block" id="qs">সংরক্ষণ</button>`, c => {
    $('#qs', c).onclick = async () => {
      const ph = $('#qp', c).value.trim(); if (ph && !U.validBdPhone(ph)) return U.toast('সঠিক মোবাইল নম্বর লিখুন');
      try { const p = await Book.saveParty({type, name: $('#qn', c).value, phone: ph}); closeSheet(); cb(p); } catch (e) { U.toast(e.message); }
    };
  });
}

/* ================= PARTY LEDGER ================= */
function party(id) {
  const p = DB.get('parties', id);
  if (!p) return go('#/parties');
  const led = Book.ledger(id), bal = led.length ? led[led.length - 1].run : 0;
  const sup = p.type === 'supplier';
  const gaveTot = led.filter(e => e.kind === 'gave').reduce((s, e) => s + e.amount, 0), gotTot = led.filter(e => e.kind === 'got').reduce((s, e) => s + e.amount, 0);
  view.innerHTML = `
  <div class="card">
    <div class="partyhead">${avatar(p, true)}<div class="main"><h2>${esc(p.name)}</h2><div class="small muted">${typeBn(p.type)}${p.phone ? ' · 📞 ' + bn(p.phone) : ''}${p.address ? ' · ' + esc(p.address) : ''}</div></div></div>
    <div style="margin-top:10px" class="small muted">${bal > 0 ? (sup ? 'সাপ্লায়ারের কাছে পাবো' : 'মোট বাকি (পাবো)') : bal < 0 ? (sup ? 'সাপ্লায়ারকে দেবো' : 'কাস্টমারকে দেবো (অগ্রিম)') : 'হিসাব সমান'}</div>
    <div class="bigbal" id="pbal">${balHtml(bal)}</div>
    <div class="acts">
      <button id="aCall" ${p.phone ? '' : 'disabled'}><b>📞</b>কল</button>
      <button id="aRemind"><b>🔔</b>তাগাদা</button>
      <button id="aPdf"><b>📄</b>PDF</button>
      <button id="aEdit"><b>✏️</b>এডিট</button>
    </div>
  </div>
  <div class="card" style="padding:6px 8px">
    <table class="ledger"><thead><tr><th>তারিখ / বিবরণ</th><th>দিলাম</th><th>পেলাম</th><th>ব্যালেন্স</th></tr></thead>
    <tbody id="ledBody">${led.length ? [...led].reverse().map(e => `<tr data-entry="${e.id}"><td>${U.dateShort(e.date)}<span class="s">${esc(e.note || (e.kind === 'gave' ? 'দিলাম' : 'পেলাম'))}${e.cashId ? ' · 💰' : ''}</span></td><td class="give">${e.kind === 'gave' ? money(e.amount) : ''}</td><td class="get">${e.kind === 'got' ? money(e.amount) : ''}</td><td>${balHtml(e.run)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="empty">এখনও কোনো হিসাব নেই</td></tr>'}</tbody>
    ${led.length ? `<tfoot><tr><td><b>মোট</b></td><td class="give"><b>${money(gaveTot)}</b></td><td class="get"><b>${money(gotTot)}</b></td><td><b>${balHtml(bal)}</b></td></tr></tfoot>` : ''}</table>
  </div>
  <div class="actionbar"><button class="btn gave" id="bGave">দিলাম ${sup ? '(টাকা)' : '(বাকি)'}</button><button class="btn got" id="bGot">পেলাম ${sup ? '(মাল)' : '(টাকা)'}</button></div>`;
  $('#bGave').onclick = () => entryForm({partyId: id, kind: 'gave'});
  $('#bGot').onclick = () => entryForm({partyId: id, kind: 'got'});
  $('#aCall').onclick = () => p.phone && Native.call(p.phone);
  $('#aRemind').onclick = () => remind(p);
  $('#aEdit').onclick = () => partyForm({id});
  $('#aPdf').onclick = () => partyPdf(p);
  $('#ledBody').addEventListener('click', e => { const r = e.target.closest('[data-entry]'); if (r) entryForm({id: r.dataset.entry}); });
}
function entryForm(o) {
  const old = o.id ? DB.get('entries', o.id) : null;
  if (old && old.src && old.src.type === 'txn') return txnForm({id: old.src.id});
  const e = old || {kind: o.kind || 'gave', partyId: o.partyId, date: ymd()};
  const p = DB.get('parties', e.partyId); if (!p) return;
  const sup = p.type === 'supplier';
  const defCash = k => sup ? k === 'gave' : k === 'got';
  openSheet(`<h2>${esc(p.name)}</h2>
    <div class="seg" id="ek"><button data-v="gave" class="gave ${e.kind === 'gave' ? 'on' : ''}">দিলাম</button><button data-v="got" class="got ${e.kind === 'got' ? 'on' : ''}">পেলাম</button></div>
    <p class="small muted" id="ehelp"></p>
    <label class="field"><span>টাকার পরিমাণ (৳)</span><input class="input amount" id="eamt" inputmode="decimal" placeholder="০" value="${old ? old.amount : ''}" autofocus></label>
    <div class="grid2"><label class="field"><span>তারিখ</span><input class="input" id="edate" type="date" value="${e.date}"></label>
    <label class="field"><span>বিবরণ (ঐচ্ছিক)</span><input class="input" id="enote" value="${esc(e.note || '')}" placeholder="যেমন: চাল ১০ কেজি"></label></div>
    <label class="check"><input type="checkbox" id="ecash"><span id="ecashLbl"></span></label>
    <div class="btns">${old ? '<button class="btn danger" id="edel">🗑 মুছুন</button>' : ''}<button class="btn primary" id="esave">সংরক্ষণ</button></div>`, c => {
    let kind = e.kind;
    const upd = keepCash => {
      $$('#ek button', c).forEach(b => b.classList.toggle('on', b.dataset.v === kind));
      $('#ehelp', c).textContent = kind === 'gave' ? (sup ? 'সাপ্লায়ারকে টাকা দিলাম — দেনা কমবে' : 'কাস্টমারকে বাকিতে মাল/টাকা দিলাম — পাওনা বাড়বে')
        : (sup ? 'সাপ্লায়ার থেকে বাকিতে মাল পেলাম — দেনা বাড়বে' : 'কাস্টমার থেকে টাকা পেলাম — পাওনা কমবে');
      $('#ecashLbl', c).textContent = kind === 'got' ? 'নগদ টাকা পেলাম — ক্যাশবক্সে যোগ হবে' : 'নগদ টাকা দিলাম — ক্যাশবক্স থেকে বাদ যাবে';
      if (!keepCash) $('#ecash', c).checked = defCash(kind);
    };
    upd(!!old); if (old) $('#ecash', c).checked = !!old.cashId;
    $('#ek', c).onclick = ev => { const b = ev.target.closest('button'); if (b) { kind = b.dataset.v; upd(false); } };
    $('#esave', c).onclick = async () => {
      try {
        const saved = await Book.saveEntry({id: old && old.id, partyId: p.id, kind, amount: $('#eamt', c).value, date: $('#edate', c).value, note: $('#enote', c).value, cash: $('#ecash', c).checked});
        closeSheet(); U.toast('সংরক্ষণ হয়েছে'); render(); Cloud.schedule();
        if (!old) offerSms(p, Native.entryText(saved, p));
      } catch (err) { U.toast(err.message); }
    };
    if ($('#edel', c)) $('#edel', c).onclick = async () => { closeSheet(); if (await confirmSheet('এই হিসাবটি মুছবেন?', `${money(old.amount)} · ${U.dateShort(old.date)}`, 'মুছুন')) { await Book.deleteEntry(old.id); U.toast('মুছে ফেলা হয়েছে'); render(); Cloud.schedule(); } };
  });
}

/* ================= SMS ================= */
async function offerSms(p, text) {
  if (!p || !p.phone || S().smsPrompt === false) return;
  if (S().autoSms && U.isNative()) {
    try { await Native.sendSmsAuto(p.phone, text); U.toast(`✅ ${p.name}-কে SMS পাঠানো হয়েছে`); return; }
    catch (err) { U.toast('অটো SMS যায়নি: ' + err.message); }
  }
  smsSheet(p, text, 'কাস্টমারকে SMS-এ জানাবেন?');
}
function smsSheet(p, text, title) {
  openSheet(`<h2>${esc(title)}</h2>
    <p class="small muted">প্রাপক: ${esc(p.name)} · ${bn(p.phone)}</p>
    <textarea class="input" id="smsT" rows="5">${esc(text)}</textarea>
    <p class="small muted" id="smsN"></p>
    <div class="btns"><button class="btn primary" id="smsGo">📩 SMS পাঠান</button><button class="btn" id="waGo">🟢 WhatsApp</button></div>
    <button class="btn block" data-close style="margin-top:8px">এখন না</button>`, c => {
    const n = () => { const t = $('#smsT', c).value; $('#smsN', c).textContent = `${bn(t.length)} অক্ষর · আনুমানিক ${bn(Native.smsParts(t))}টি SMS (বাংলায় ৭০ অক্ষরে ১টি SMS)`; };
    n(); $('#smsT', c).oninput = n;
    $('#smsGo', c).onclick = async () => {
      const t = $('#smsT', c).value;
      try {
        if (S().autoSms && U.isNative()) { await Native.sendSmsAuto(p.phone, t); U.toast('✅ SMS পাঠানো হয়েছে'); }
        else await Native.composeSms(p.phone, t);
        closeSheet();
      } catch (err) { U.toast(err.message); }
    };
    $('#waGo', c).onclick = () => { Native.whatsapp(p.phone, $('#smsT', c).value); closeSheet(); };
  });
}
function remind(p) {
  if (!p.phone) return U.toast('এই কাস্টমারের মোবাইল নম্বর নেই — এডিট করে যোগ করুন');
  if (Book.balance(p.id) <= 0) return U.toast('এই কাস্টমারের কোনো বাকি নেই');
  smsSheet(p, Native.reminderText(p), '🔔 বাকির তাগাদা');
}

/* ================= TRADE (বিক্রয় / ক্রয়) ================= */
let tradeRange = 'month';
function trade(type = 'sale') {
  const today = ymd(), rng = {today: [today, today], month: [today.slice(0, 8) + '01', today], all: ['0000-00-00', '9999-99-99']}[tradeRange];
  const rows = DB.list('txns').filter(t => t.type === type && t.date >= rng[0] && t.date <= rng[1]).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const s = Book.txnSummary(rng[0], rng[1], type), w = type === 'sale' ? 'বিক্রয়' : 'ক্রয়';
  view.innerHTML = `
  <div class="tabs"><button data-t="sale" class="${type === 'sale' ? 'on' : ''}">বিক্রয়</button><button data-t="purchase" class="${type === 'purchase' ? 'on' : ''}">ক্রয়</button></div>
  <div class="chips">${[['today', 'আজ'], ['month', 'এই মাস'], ['all', 'সব']].map(([k, l]) => `<button data-r="${k}" class="${tradeRange === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div class="grid3" style="margin-bottom:10px">
    <div class="stat mini"><div class="lbl">মোট</div><div class="val">${money(s.total)}</div></div>
    <div class="stat mini"><div class="lbl">নগদ</div><div class="val get">${money(s.paid)}</div></div>
    <div class="stat mini"><div class="lbl">বাকি</div><div class="val give">${money(s.due)}</div></div></div>
  <div class="btns" style="margin-bottom:10px"><button class="btn primary" id="tCash">＋ নগদ ${w}</button><button class="btn gave" id="tDue">＋ বাকিতে ${w}</button></div>
  <div class="list">${rows.length ? rows.map(txnRow).join('') : '<div class="empty">কোনো লেনদেন নেই</div>'}</div>`;
  $$('.tabs button', view).forEach(b => b.onclick = () => go('#/trade/' + b.dataset.t));
  $$('.chips button', view).forEach(b => b.onclick = () => { tradeRange = b.dataset.r; render(); });
  $('#tCash').onclick = () => txnForm({type, mode: 'cash'});
  $('#tDue').onclick = () => txnForm({type, mode: 'due'});
  bindRows(view);
}
function txnForm(o) {
  const old = o.id ? DB.get('txns', o.id) : null;
  const t = old ? {...old} : {type: o.type || 'sale', mode: o.mode || 'cash', partyId: o.partyId || null, items: o.items || [], date: o.date || ymd(), total: o.total, paid: o.paid, note: o.note};
  if (old && o.partyId) t.partyId = o.partyId;
  const sale = t.type === 'sale', ptype = sale ? 'customer' : 'supplier';
  const plist = Book.parties().sort((a, b) => (a.type === ptype ? -1 : 1) - (b.type === ptype ? -1 : 1) || a.name.localeCompare(b.name, 'bn'));
  const prods = DB.list('products');
  openSheet(`<h2>${old ? 'লেনদেন বদলান' : sale ? 'নতুন বিক্রয়' : 'নতুন ক্রয়'}</h2>
    <div class="seg" id="tm"><button data-v="cash" class="${t.mode === 'cash' ? 'on' : ''}">💵 নগদ</button><button data-v="due" class="gave ${t.mode === 'due' ? 'on' : ''}">📝 বাকি</button></div>
    <label class="field"><span>${sale ? 'কাস্টমার' : 'সাপ্লায়ার'}</span>
      <select class="input" id="tparty"><option value="">${sale ? '— নগদ কাস্টমার (নাম ছাড়া) —' : '— সাপ্লায়ার ছাড়া —'}</option>${plist.map(p => `<option value="${p.id}" ${p.id === t.partyId ? 'selected' : ''}>${esc(p.name)}${p.type !== ptype ? ' (' + typeBn(p.type) + ')' : ''}${p.phone ? ' · ' + bn(p.phone) : ''}</option>`).join('')}<option value="__new">＋ নতুন ${typeBn(ptype)} যোগ করুন</option></select></label>
    <details id="titems" ${(t.items || []).length ? 'open' : ''}><summary class="small" style="cursor:pointer;margin-bottom:8px">🧺 পণ্যের তালিকা (ঐচ্ছিক)</summary>
      <div class="items" id="irows"></div><button class="btn block" id="iadd" type="button">＋ পণ্য যোগ</button>
      <datalist id="plistd">${prods.map(p => `<option value="${esc(p.name)}">`).join('')}</datalist></details>
    <label class="field" style="margin-top:10px"><span>মোট টাকা (৳)</span><input class="input amount" id="ttotal" inputmode="decimal" placeholder="০" value="${t.total || ''}" ${(t.items || []).length ? '' : 'autofocus'}></label>
    <label class="field" id="tpaidW"><span>এখন নগদ ${sale ? 'পেলাম' : 'দিলাম'} (৳) — বাকি অংশ খাতায় যাবে</span><input class="input" id="tpaid" inputmode="decimal" placeholder="০" value="${t.mode === 'due' && t.paid ? t.paid : ''}"></label>
    <div class="sumline" id="tdueL"></div>
    <div class="grid2"><label class="field"><span>তারিখ</span><input class="input" id="tdate" type="date" value="${t.date}"></label>
    <label class="field"><span>নোট</span><input class="input" id="tnote" value="${esc(t.note || '')}"></label></div>
    <div class="btns">${old ? '<button class="btn danger" id="tdel">🗑 মুছুন</button>' : ''}<button class="btn primary" id="tsave">সংরক্ষণ</button></div>`, c => {
    let mode = t.mode;
    const items = (t.items || []).map(i => ({...i}));
    const irow = (i, k) => `<div class="it" data-k="${k}"><input class="input" list="plistd" data-f="name" placeholder="পণ্য" value="${esc(i.name || '')}"><input class="input" data-f="qty" inputmode="decimal" placeholder="পরিমাণ" value="${i.qty || ''}"><input class="input" data-f="price" inputmode="decimal" placeholder="দর ৳" value="${i.price || ''}"><button class="x" type="button" data-x>✕</button></div>`;
    const drawItems = () => { $('#irows', c).innerHTML = items.map(irow).join(''); };
    const recalc = (fromItems) => {
      if (fromItems && items.some(i => U.num(i.price))) $('#ttotal', c).value = Math.round(items.reduce((s, i) => s + (U.num(i.qty) || 1) * U.num(i.price), 0) * 100) / 100 || '';
      const total = U.num($('#ttotal', c).value), paid = mode === 'cash' ? total : Math.min(U.num($('#tpaid', c).value), total);
      $('#tpaidW', c).classList.toggle('hidden', mode === 'cash');
      $('#tdueL', c).innerHTML = mode === 'due' ? `<span>খাতায় বাকি যাবে</span><b class="give">${money(Math.max(0, total - paid))}</b>` : `<span>নগদ — ক্যাশবক্সে ${sale ? 'যোগ' : 'বাদ'} হবে</span><b>${money(total)}</b>`;
    };
    drawItems(); recalc(false);
    $('#tm', c).onclick = ev => { const b = ev.target.closest('button'); if (!b) return; mode = b.dataset.v; $$('#tm button', c).forEach(x => x.classList.toggle('on', x === b)); recalc(false); };
    $('#iadd', c).onclick = () => { items.push({name: '', qty: 1, price: ''}); drawItems(); $$('#irows .it', c).pop().querySelector('input').focus(); };
    $('#irows', c).addEventListener('input', ev => {
      const r = ev.target.closest('.it'); const i = items[+r.dataset.k]; i[ev.target.dataset.f] = ev.target.value;
      if (ev.target.dataset.f === 'name') { const pr = prods.find(p => p.name === ev.target.value); if (pr && !i.price) { i.price = pr.price; r.querySelector('[data-f=price]').value = pr.price; } }
      recalc(true);
    });
    $('#irows', c).addEventListener('click', ev => { if (ev.target.closest('[data-x]')) { items.splice(+ev.target.closest('.it').dataset.k, 1); drawItems(); recalc(true); } });
    $('#ttotal', c).oninput = () => recalc(false);
    $('#tpaid', c).oninput = () => recalc(false);
    $('#tparty', c).onchange = e => {
      if (e.target.value !== '__new') return;
      const keep = {id: old && old.id, type: t.type, mode, items, total: $('#ttotal', c).value, paid: $('#tpaid', c).value, date: $('#tdate', c).value, note: $('#tnote', c).value};
      closeSheet(); partyFormThen(ptype, np => txnForm({...keep, partyId: np.id}));
    };
    $('#tsave', c).onclick = async () => {
      try {
        const partyId = $('#tparty', c).value.replace('__new', '') || null;
        const saved = await Book.saveTxn({id: old && old.id, type: t.type, mode, partyId, items, total: $('#ttotal', c).value, paid: $('#tpaid', c).value, date: $('#tdate', c).value, note: $('#tnote', c).value});
        closeSheet(); U.toast(`${sale ? 'বিক্রয়' : 'ক্রয়'} সংরক্ষণ হয়েছে`); render(); Cloud.schedule();
        const p = partyId && DB.get('parties', partyId);
        if (!old && p) offerSms(p, Native.saleText(saved, p));
      } catch (err) { U.toast(err.message); }
    };
    if ($('#tdel', c)) $('#tdel', c).onclick = async () => { closeSheet(); if (await confirmSheet('লেনদেনটি মুছবেন?', `${money(old.total)} · ${U.dateShort(old.date)} — খাতার বাকি ও ক্যাশবক্সের হিসাবও মুছবে।`, 'মুছুন')) { await Book.deleteTxn(old.id); U.toast('মুছে ফেলা হয়েছে'); render(); Cloud.schedule(); } };
  });
}

/* ================= CASHBOX ================= */
let cashDay = null;
function cash() {
  const day = cashDay || ymd(), mStart = day.slice(0, 8) + '01', mEnd = day.slice(0, 8) + '31';
  const d = Book.cashSummary(day, day), m = Book.cashSummary(mStart, mEnd);
  const rows = DB.list('cash').filter(c => c.date === day).sort((a, b) => b.createdAt - a.createdAt);
  const cats = {}; DB.list('cash').filter(c => c.kind === 'expense' && c.date >= mStart && c.date <= mEnd).forEach(c => cats[c.category] = (cats[c.category] || 0) + c.amount);
  view.innerHTML = `
  <div class="datebar"><button id="cPrev" aria-label="আগের দিন">◀</button><input class="input" type="date" id="cDay" value="${day}"><button id="cNext" aria-label="পরের দিন">▶</button></div>
  <div class="card" style="text-align:center"><div class="small muted">${U.dateBn(day)} — দিন শেষে ক্যাশে আছে</div><div class="bigbal" id="cHand">${money(Book.cashInHand(day))}</div></div>
  <div class="grid3"><div class="stat mini"><div class="lbl">ক্যাশ ইন</div><div class="val get" id="cIn">${money(d.inn)}</div></div><div class="stat mini"><div class="lbl">ক্যাশ আউট</div><div class="val give">${money(d.out)}</div></div><div class="stat mini"><div class="lbl">খরচ</div><div class="val give" id="cExp">${money(d.exp)}</div></div></div>
  <div class="btns" style="margin:10px 0"><button class="btn got" id="cAddIn">＋ ক্যাশ ইন</button><button class="btn gave" id="cAddOut">－ ক্যাশ আউট</button><button class="btn primary" id="cAddExp">🧾 খরচ</button></div>
  <h2>এই দিনের হিসাব</h2>
  <div class="list">${rows.length ? rows.map(cashRow).join('') : '<div class="empty">এই দিনে কোনো ক্যাশ লেনদেন নেই</div>'}</div>
  <h2>${U.monthBn(day)}</h2>
  <div class="card rep"><table>
    <tr><td>মোট ক্যাশ ইন</td><td class="get">${money(m.inn)}</td></tr><tr><td>মোট ক্যাশ আউট</td><td class="give">${money(m.out)}</td></tr><tr><td>মোট খরচ</td><td class="give">${money(m.exp)}</td></tr>
    ${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td class="small muted">　• ${esc(k)}</td><td class="small">${money(v)}</td></tr>`).join('')}
    <tr class="tot"><td>নিট</td><td>${balHtml(m.net)}</td></tr></table></div>`;
  const shift = n => { const x = U.parseYmd(day); x.setDate(x.getDate() + n); cashDay = ymd(x); render(); };
  $('#cPrev').onclick = () => shift(-1); $('#cNext').onclick = () => shift(1);
  $('#cDay').onchange = e => { cashDay = e.target.value || null; render(); };
  $('#cAddIn').onclick = () => cashForm({kind: 'in', date: day});
  $('#cAddOut').onclick = () => cashForm({kind: 'out', date: day});
  $('#cAddExp').onclick = () => cashForm({kind: 'expense', date: day});
  bindRows(view);
}
function cashForm(o) {
  const old = o.id ? DB.get('cash', o.id) : null;
  if (old && old.src) { if (old.src.type === 'txn') return txnForm({id: old.src.id}); if (old.src.type === 'entry') return entryForm({id: old.src.id}); }
  const c0 = old || {kind: o.kind || 'expense', date: o.date || ymd()};
  const cats = k => k === 'expense' ? Book.EXPENSE_CATS : k === 'in' ? Book.CASH_IN_CATS : Book.CASH_OUT_CATS;
  openSheet(`<h2>${old ? 'হিসাব বদলান' : 'ক্যাশবক্স'}</h2>
    <div class="seg" id="ck"><button data-v="in" class="got ${c0.kind === 'in' ? 'on' : ''}">ক্যাশ ইন</button><button data-v="out" class="gave ${c0.kind === 'out' ? 'on' : ''}">ক্যাশ আউট</button><button data-v="expense" class="gave ${c0.kind === 'expense' ? 'on' : ''}">খরচ</button></div>
    <label class="field"><span>টাকার পরিমাণ (৳)</span><input class="input amount" id="camt" inputmode="decimal" placeholder="০" value="${old ? old.amount : ''}" autofocus></label>
    <label class="field"><span>খাত</span><select class="input" id="ccat"></select></label>
    <div class="grid2"><label class="field"><span>তারিখ</span><input class="input" type="date" id="cdate" value="${c0.date}"></label><label class="field"><span>নোট</span><input class="input" id="cnote" value="${esc(c0.note || '')}"></label></div>
    <div class="btns">${old ? '<button class="btn danger" id="cdel">🗑 মুছুন</button>' : ''}<button class="btn primary" id="csave">সংরক্ষণ</button></div>`, c => {
    let kind = c0.kind;
    const fill = () => { const l = cats(kind); $('#ccat', c).innerHTML = l.map(x => `<option ${x === c0.category ? 'selected' : ''}>${esc(x)}</option>`).join('') + (c0.category && !l.includes(c0.category) && kind === c0.kind ? `<option selected>${esc(c0.category)}</option>` : ''); };
    fill();
    $('#ck', c).onclick = ev => { const b = ev.target.closest('button'); if (!b) return; kind = b.dataset.v; $$('#ck button', c).forEach(x => x.classList.toggle('on', x === b)); fill(); };
    $('#csave', c).onclick = async () => { try { await Book.saveCash({id: old && old.id, kind, category: $('#ccat', c).value, amount: $('#camt', c).value, date: $('#cdate', c).value, note: $('#cnote', c).value}); closeSheet(); U.toast('সংরক্ষণ হয়েছে'); render(); Cloud.schedule(); } catch (e) { U.toast(e.message); } };
    if ($('#cdel', c)) $('#cdel', c).onclick = async () => { closeSheet(); if (await confirmSheet('মুছবেন?', money(old.amount), 'মুছুন')) { await Book.deleteCash(old.id); render(); Cloud.schedule(); } };
  });
}

/* ================= REPORTS ================= */
let repRange = 'month', repFrom = null, repTo = null;
function rangeOf(k) {
  const t = new Date(), today = ymd(t);
  if (k === 'today') return [today, today];
  if (k === 'week') { const d = new Date(t); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return [ymd(d), today]; }   // week starts Saturday
  if (k === 'month') return [today.slice(0, 8) + '01', today];
  if (k === 'last') { const a = new Date(t.getFullYear(), t.getMonth() - 1, 1), b = new Date(t.getFullYear(), t.getMonth(), 0); return [ymd(a), ymd(b)]; }
  if (k === 'year') return [today.slice(0, 4) + '-01-01', today];
  return [repFrom || today.slice(0, 8) + '01', repTo || today];
}
function reportHtml(r, forPdf) {
  const p = DB.meta.get('profile') || {};
  const row = (l, v, cls = '') => `<tr><td>${l}</td><td class="r ${cls}">${v}</td></tr>`;
  const head = forPdf ? `<div class="pdf-block"><h1>${esc(p.shopName || 'dFaster Note')}</h1><div class="sub">${esc([p.ownerName, p.phone && bn(p.phone), p.address].filter(Boolean).join(' · '))}</div><div class="sub"><b>রিপোর্ট:</b> ${U.dateBn(r.from)} — ${U.dateBn(r.to)}</div></div>` : '';
  return `${head}
  <h2>বিক্রয়</h2><table>${row('মোট বিক্রয় (' + bn(r.sale.n) + 'টি)', money(r.sale.total))}${row('নগদে', money(r.sale.paid), 'get')}${row('বাকিতে', money(r.sale.due), 'give')}</table>
  <h2>ক্রয়</h2><table>${row('মোট ক্রয় (' + bn(r.purchase.n) + 'টি)', money(r.purchase.total))}${row('নগদে', money(r.purchase.paid))}${row('বাকিতে', money(r.purchase.due), 'give')}</table>
  <h2>বাকির হিসাব (এই সময়ে)</h2><table>${row('কাস্টমারকে বাকি দিলাম', money(r.led.custGave), 'give')}${row('কাস্টমার থেকে আদায় (পেলাম)', money(r.led.custGot), 'get')}${row('সাপ্লায়ার থেকে বাকিতে পেলাম', money(r.led.supGot), 'give')}${row('সাপ্লায়ারকে পরিশোধ (দিলাম)', money(r.led.supGave))}</table>
  <h2>ক্যাশবক্স</h2><table>${row('শুরুর ক্যাশ', money(r.cashOpen))}${row('ক্যাশ ইন', money(r.cash.inn), 'get')}${row('ক্যাশ আউট', money(r.cash.out), 'give')}${row('খরচ', money(r.cash.exp), 'give')}<tr class="tot"><td>শেষের ক্যাশ</td><td class="r">${money(r.cashClose)}</td></tr></table>
  <h2>খরচের খাত</h2><table>${Object.keys(r.expCats).length ? Object.entries(r.expCats).sort((a, b) => b[1] - a[1]).map(([k, v]) => row(esc(k), money(v))).join('') : row('কোনো খরচ নেই', money(0))}</table>
  <h2>আনুমানিক লাভ</h2><table>${row('বিক্রয়', money(r.sale.total))}${row('− ক্রয়', money(r.purchase.total))}${row('− খরচ', money(r.cash.exp))}<tr class="tot"><td>আনুমানিক লাভ/ক্ষতি</td><td class="r ${r.profit >= 0 ? 'get' : 'give'}">${r.profit < 0 ? '−' : ''}${moneyAbs(r.profit)}</td></tr></table>
  <p class="${forPdf ? 'sub' : 'small muted'}">লাভ = বিক্রয় − ক্রয় − খরচ (মজুদ মালের হিসাব ধরা হয়নি, তাই আনুমানিক)।</p>
  <h2>বর্তমান বাকি — পাবো ${money(r.totals.receivable)} · দেবো ${money(r.totals.payable)}</h2>
  <table><thead><tr><th>নাম</th><th>ফোন</th><th class="r">পাবো</th><th class="r">দেবো</th></tr></thead><tbody>${r.debtors.length ? r.debtors.map(d => `<tr><td>${esc(d.name)} <small>(${typeBn(d.type)})</small></td><td>${d.phone ? bn(d.phone) : ''}</td><td class="r get">${d.bal > 0 ? money(d.bal) : ''}</td><td class="r give">${d.bal < 0 ? moneyAbs(d.bal) : ''}</td></tr>`).join('') : '<tr><td colspan="4">কোনো বাকি নেই</td></tr>'}</tbody></table>`;
}
function reports() {
  const [from, to] = rangeOf(repRange); const r = Book.report(from, to);
  view.innerHTML = `
  <div class="chips">${[['today', 'আজ'], ['week', 'এই সপ্তাহ'], ['month', 'এই মাস'], ['last', 'গত মাস'], ['year', 'এই বছর'], ['custom', 'নির্দিষ্ট তারিখ']].map(([k, l]) => `<button data-r="${k}" class="${repRange === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div class="grid2 ${repRange === 'custom' ? '' : 'hidden'}"><label class="field"><span>শুরু</span><input class="input" type="date" id="rFrom" value="${from}"></label><label class="field"><span>শেষ</span><input class="input" type="date" id="rTo" value="${to}"></label></div>
  <div class="card"><b>${U.dateBn(from)} — ${U.dateBn(to)}</b>
    <div class="grid2" style="margin-top:10px"><div class="stat mini get"><div class="lbl">বিক্রয়</div><div class="val" id="rSale">${money(r.sale.total)}</div></div><div class="stat mini ${r.profit >= 0 ? 'get' : 'give'}"><div class="lbl">আনুমানিক লাভ</div><div class="val" id="rProfit">${r.profit < 0 ? '−' : ''}${moneyAbs(r.profit)}</div></div></div></div>
  <div class="btns" style="margin-bottom:10px"><button class="btn primary" id="rPdf">📄 PDF শেয়ার / সেভ</button></div>
  <div class="card rep" id="repBody">${reportHtml(r, false)}</div>`;
  $$('.chips button', view).forEach(b => b.onclick = () => { repRange = b.dataset.r; render(); });
  $('#rFrom').onchange = e => { repFrom = e.target.value; render(); };
  $('#rTo').onchange = e => { repTo = e.target.value; render(); };
  $('#rPdf').onclick = async () => {
    const btn = $('#rPdf'); btn.disabled = true; btn.textContent = '⏳ PDF তৈরি হচ্ছে…';
    try { await PDF.share(reportHtml(r, true), `bakikhata-report-${from}_${to}.pdf`, 'dFaster Note রিপোর্ট'); U.toast('PDF তৈরি হয়েছে'); }
    catch (e) { console.error(e); U.toast('PDF তৈরি হয়নি: ' + e.message); }
    btn.disabled = false; btn.textContent = '📄 PDF শেয়ার / সেভ';
  };
}
async function partyPdf(p) {
  const led = Book.ledger(p.id), pr = DB.meta.get('profile') || {}, bal = led.length ? led[led.length - 1].run : 0;
  const html = `<div class="pdf-block"><h1>${esc(pr.shopName || 'dFaster Note')}</h1><div class="sub">${esc([pr.ownerName, pr.phone && bn(pr.phone)].filter(Boolean).join(' · '))}</div>
    <h2>হিসাব বিবরণী: ${esc(p.name)}${p.phone ? ' (' + bn(p.phone) + ')' : ''}</h2><div class="sub">${typeBn(p.type)} · ${bal > 0 ? 'মোট পাবো' : bal < 0 ? 'মোট দেবো' : 'হিসাব সমান'}: <b>${moneyAbs(bal)}</b></div></div>
    <table><thead><tr><th>তারিখ</th><th>বিবরণ</th><th class="r">দিলাম</th><th class="r">পেলাম</th><th class="r">ব্যালেন্স</th></tr></thead><tbody>
    ${led.map(e => `<tr><td>${U.dateShort(e.date)}</td><td>${esc(e.note || '')}</td><td class="r give">${e.kind === 'gave' ? money(e.amount) : ''}</td><td class="r get">${e.kind === 'got' ? money(e.amount) : ''}</td><td class="r">${e.run < 0 ? '−' : ''}${moneyAbs(e.run)}</td></tr>`).join('')}
    </tbody></table>`;
  U.toast('⏳ PDF তৈরি হচ্ছে…');
  try { await PDF.share(html, `bakikhata-statement-${ymd()}.pdf`, 'হিসাব বিবরণী'); } catch (e) { U.toast('PDF তৈরি হয়নি: ' + e.message); }
}

/* ================= PRODUCTS ================= */
function products() {
  const l = DB.list('products').sort((a, b) => a.name.localeCompare(b.name, 'bn'));
  view.innerHTML = `<h2>পণ্যের তালিকা</h2><p class="small muted">বিক্রয়/ক্রয়ে পণ্যের নাম লিখলে দর নিজে থেকে বসে যাবে। নতুন পণ্য বিক্রির সময়ই তালিকায় যোগ হয়।</p>
  <div class="list" id="prl">${l.length ? l.map(p => `<button class="row" data-prod="${p.id}"><div class="avatar">🏷️</div><div class="main"><div class="t">${esc(p.name)}</div></div><div class="amt">${money(p.price || 0)}${p.unit ? '<small class="muted">/' + esc(p.unit) + '</small>' : ''}</div></button>`).join('') : '<div class="empty">কোনো পণ্য নেই</div>'}</div>
  <button class="fab" id="prAdd">＋ পণ্য</button>`;
  const form = (p = {}) => openSheet(`<h2>${p.id ? 'পণ্য বদলান' : 'নতুন পণ্য'}</h2>
    <label class="field"><span>নাম</span><input class="input" id="prn" value="${esc(p.name || '')}" autofocus></label>
    <div class="grid2"><label class="field"><span>দর (৳)</span><input class="input" id="prp" inputmode="decimal" value="${p.price || ''}"></label><label class="field"><span>একক</span><input class="input" id="pru" placeholder="কেজি / পিস" value="${esc(p.unit || '')}"></label></div>
    <div class="btns">${p.id ? '<button class="btn danger" id="prd">🗑 মুছুন</button>' : ''}<button class="btn primary" id="prs">সংরক্ষণ</button></div>`, c => {
    $('#prs', c).onclick = async () => { const n = $('#prn', c).value.trim(); if (!n) return U.toast('নাম লিখুন'); await DB.put('products', {...p, name: n, price: U.num($('#prp', c).value), unit: $('#pru', c).value.trim()}); closeSheet(); render(); Cloud.schedule(); };
    if ($('#prd', c)) $('#prd', c).onclick = async () => { await DB.remove('products', p.id); closeSheet(); render(); Cloud.schedule(); };
  });
  $('#prAdd').onclick = () => form();
  $('#prl').onclick = e => { const r = e.target.closest('[data-prod]'); if (r) form(DB.get('products', r.dataset.prod)); };
}

/* ================= SETTINGS ================= */
function settings() {
  const p = DB.meta.get('profile') || {}, s = S(), cs = Cloud.status();
  view.innerHTML = `
  <h2>দোকানের তথ্য</h2>
  <div class="card">
    <label class="field"><span>দোকানের নাম</span><input class="input" id="sShop" value="${esc(p.shopName || '')}"></label>
    <label class="field"><span>মালিকের নাম</span><input class="input" id="sOwner" value="${esc(p.ownerName || '')}"></label>
    <label class="field"><span>মোবাইল নম্বর${p.verified ? ' (যাচাই করা ✅)' : ''}</span><input class="input" id="sPhone" type="tel" value="${esc(p.phone || '')}" ${p.verified ? 'disabled' : ''}></label>
    <label class="field"><span>ঠিকানা</span><input class="input" id="sAddr" value="${esc(p.address || '')}"></label>
    <button class="btn primary block" id="sSaveP">সংরক্ষণ</button>
    <p class="small muted">এই নাম ও নম্বর SMS আর PDF রিপোর্টে ব্যবহার হয়।</p>
  </div>
  <h2>SMS</h2>
  <div class="card">
    <label class="switch-row"><div class="main">প্রতিটি লেনদেনের পর SMS-এ জানানোর প্রস্তাব<div class="small muted">ফোনের SMS অ্যাপ খুলবে, লেখা তৈরি থাকবে — শুধু পাঠান চাপুন</div></div><input type="checkbox" id="sSmsP" ${s.smsPrompt !== false ? 'checked' : ''}></label>
    <label class="switch-row"><div class="main">অটো SMS<div class="small muted">লেনদেনের পর নিজে থেকেই SMS চলে যাবে (SMS পাঠানোর অনুমতি লাগবে; সিমের স্বাভাবিক SMS খরচ কাটবে)।${U.isNative() ? '' : ' <b>শুধু Android অ্যাপে।</b>'}</div></div><input type="checkbox" id="sAuto" ${s.autoSms ? 'checked' : ''} ${U.isNative() ? '' : 'disabled'}></label>
  </div>
  <h2>নিরাপত্তা</h2>
  <div class="card"><div class="switch-row"><div class="main">🔒 PIN লক<div class="small muted">${s.pinHash ? 'চালু — অ্যাপ খুললে PIN লাগবে' : 'বন্ধ'}</div></div><button class="btn" id="sPin">${s.pinHash ? 'বদলান' : 'চালু করুন'}</button>${s.pinHash ? '<button class="btn danger" id="sPinOff">বন্ধ</button>' : ''}</div></div>
  <h2>ব্যাকআপ</h2>
  <div class="card">
    <div class="btns"><button class="btn primary" id="sExport">💾 ব্যাকআপ ফাইল</button><button class="btn" id="sImport">📂 ফেরত আনুন</button></div>
    <p class="small muted">${s.lastBackup ? 'শেষ ব্যাকআপ: ' + U.dateBn(ymd(new Date(s.lastBackup))) : 'এখনও ব্যাকআপ নেওয়া হয়নি'} · ফাইলটি Google Drive, WhatsApp বা অন্য ফোনে রেখে দিন। ফেরত আনলে নতুন তথ্য মিলিয়ে নেওয়া হয় (কিছু মুছে যায় না)।</p>
  </div>
  <h2>অ্যাকাউন্ট ও ক্লাউড</h2>
  <div class="card"><p class="small" id="cloudStatus">${esc(cs.text)}</p>
    ${cs.on ? (cs.signedIn ? `<p class="small muted">সব হিসাব (কাস্টমার, সাপ্লায়ার, খাতা, বেচাকেনা, ক্যাশ, খরচ, পণ্য, ছবি, দোকানের তথ্য ও সেটিংস) আপনার অ্যাকাউন্টে নিরাপদে সিঙ্ক হয়। নতুন ফোনে একই ${cs.user.providers && cs.user.providers.includes('google.com') && !cs.user.phone ? 'Google অ্যাকাউন্ট' : 'নম্বর + পাসওয়ার্ড'} দিয়ে লগইন করলেই সব ফিরে আসবে।${Cloud.unsynced() ? ` <b>${bn(Cloud.unsynced())}টি পরিবর্তন এখনও আপলোড হয়নি।</b>` : ''}</p>
      <div class="btns"><button class="btn primary" id="sSync">🔄 এখন সিঙ্ক</button>${cs.user.providers && cs.user.providers.includes('password') ? '<button class="btn" id="sPw">🔑 পাসওয়ার্ড বদলান</button>' : ''}<button class="btn danger" id="sOut">লগআউট</button></div>`
      : '<button class="btn primary block" id="sLogin">🔐 লগইন / রেজিস্ট্রেশন</button><p class="small muted">লগইন করলে এই ফোনের সব হিসাব আপনার অ্যাকাউন্টে উঠে যাবে।</p>') : ''}
  </div>
  <h2>অন্যান্য</h2>
  <div class="card">
    <label class="field"><span>শুরুর ক্যাশ (ক্যাশবক্সে আগে থেকে যত টাকা ছিল)</span><input class="input" id="sOpen" inputmode="decimal" value="${s.openingCash || ''}" placeholder="০"></label>
    <label class="field"><span>থিম</span><select class="input" id="sTheme"><option value="auto">ফোনের মতো</option><option value="light">লাইট</option><option value="dark">ডার্ক</option></select></label>
    <button class="btn block" id="sProd">🏷️ পণ্যের তালিকা</button>
  </div>
  <p class="small muted" style="text-align:center">dFaster Note v${bn(VERSION)} · কোনো বিজ্ঞাপন বা ট্র্যাকিং নেই</p>`;
  $('#sTheme').value = s.theme || 'auto';
  $('#sSaveP').onclick = async () => {
    const ph = $('#sPhone').value.trim(); if (ph && !U.validBdPhone(ph)) return U.toast('সঠিক মোবাইল নম্বর লিখুন');
    await DB.meta.set('profile', {...p, shopName: $('#sShop').value.trim(), ownerName: $('#sOwner').value.trim(), phone: ph ? U.normPhone(ph) : '', address: $('#sAddr').value.trim()});
    applyProfile(); U.toast('সংরক্ষণ হয়েছে'); Cloud.schedule();
  };
  $('#sSmsP').onchange = e => setS({smsPrompt: e.target.checked});
  $('#sAuto').onchange = async e => {
    const el = e.target;
    if (el.checked) {
      const ok = await confirmSheet('অটো SMS চালু করবেন?', 'প্রতিটি লেনদেনের পর কাস্টমারের নম্বরে নিজে থেকে SMS যাবে। আপনার সিম থেকে SMS-এর স্বাভাবিক খরচ কাটবে। এজন্য "SMS পাঠানো"র অনুমতি চাওয়া হবে।', 'চালু করুন', false);
      if (!ok) { el.checked = false; return; }
      const r = await Native.smsPermission(true).catch(() => 'denied');
      if (r !== 'granted') { el.checked = false; return U.toast('অনুমতি দেওয়া হয়নি — সাধারণ SMS (অ্যাপ খুলে) চালু থাকবে'); }
    }
    await setS({autoSms: el.checked}); U.toast(el.checked ? 'অটো SMS চালু' : 'অটো SMS বন্ধ');
  };
  $('#sPin').onclick = () => setPin();
  if ($('#sPinOff')) $('#sPinOff').onclick = async () => { if (await confirmSheet('PIN লক বন্ধ করবেন?', 'অ্যাপ খুলতে আর PIN লাগবে না।', 'বন্ধ করুন')) { await setS({pinHash: null, pinSalt: null}); render(); } };
  $('#sExport').onclick = exportBackup;
  $('#sImport').onclick = () => importBackup(() => render());
  $('#sOpen').onchange = e => setS({openingCash: U.num(e.target.value)});
  $('#sTheme').onchange = async e => { await setS({theme: e.target.value}); applyTheme(); };
  $('#sProd').onclick = () => go('#/products');
  if ($('#sLogin')) $('#sLogin').onclick = () => authScreen();
  if ($('#sPw')) $('#sPw').onclick = () => forgotPassword((cs.user.phone && U.normPhone(cs.user.phone)) || p.phone || '');
  if ($('#sSync')) $('#sSync').onclick = async () => { try { const r = await Cloud.sync(); U.toast(`সিঙ্ক হয়েছে (${bn(r.pushed || 0)}↑ ${bn(r.pulled || 0)}↓)`); render(); } catch (e) { U.toast('সিঙ্ক হয়নি: ' + e.message); } };
  if ($('#sOut')) $('#sOut').onclick = async () => {
    if (!await confirmSheet('লগআউট করবেন?', 'আগে সব হিসাব ক্লাউডে সিঙ্ক হবে, তারপর এই ফোন থেকে মুছে যাবে। আবার লগইন করলে সব ফিরে আসবে।' + (navigator.onLine === false ? ' <b>এখন ইন্টারনেট নেই — যেগুলো আপলোড হয়নি সেগুলো হারাবে।</b>' : ''), 'লগআউট')) return;
    try { await Cloud.sync(); } catch (e) { if (!await confirmSheet('সিঙ্ক হয়নি', esc(e.message) + ' — তবুও লগআউট করলে আপলোড না হওয়া হিসাব হারাবে।', 'তবুও লগআউট')) return; }
    await Cloud.signOut(); location.hash = '#/'; location.reload();
  };
}
async function exportBackup() {
  try {
    const data = DB.exportAll();
    await Native.shareFile(`bakikhata-backup-${ymd()}.json`, 'application/json', Native.utf8b64(JSON.stringify(data)), 'dFaster Note ব্যাকআপ');
    await setS({lastBackup: Date.now()}); U.toast('ব্যাকআপ ফাইল তৈরি হয়েছে');
  } catch (e) { U.toast('ব্যাকআপ হয়নি: ' + e.message); }
}
function importBackup(done) {
  const inp = $('#filePick'); inp.value = '';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const n = await DB.importMerge(obj);
      applyProfile(); U.toast(`✅ ${bn(n)}টি হিসাব ফেরত আনা হয়েছে`); Cloud.schedule(); if (done) done();
    } catch (e) { U.toast('ফাইলটি পড়া যায়নি: ' + e.message, 4000); }
  };
  inp.click();
}

/* ================= PIN LOCK ================= */
function pinPad(title, sub, onPin, opts = {}) {
  const el = $('#lock'); let pin = '';
  el.innerHTML = `<div class="inner"><div class="hero"><div class="logo">🔒</div><h1>${esc(title)}</h1><p class="muted small">${sub}</p></div>
    <div class="pin-dots" id="dots">${'<i></i>'.repeat(4)}</div>
    <div class="pad" id="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}">${bn(n)}</button>`).join('')}<button data-n="c">${opts.cancel ? '✕' : ''}</button><button data-n="0">${bn(0)}</button><button data-n="x">⌫</button></div>
    ${opts.forgot ? '<p style="text-align:center;margin-top:18px"><a href="#" id="forgot" class="small">PIN ভুলে গেছেন?</a></p>' : ''}</div>`;
  el.classList.remove('hidden');
  const dots = () => $$('#dots i', el).forEach((d, i) => d.classList.toggle('f', i < pin.length));
  $('#pad', el).onclick = async e => {
    const b = e.target.closest('button'); if (!b) return; const n = b.dataset.n;
    if (n === 'x') pin = pin.slice(0, -1);
    else if (n === 'c') { if (opts.cancel) { el.classList.add('hidden'); opts.cancel(); } return; }
    else if (pin.length < 4) pin += n;
    dots();
    if (pin.length === 4) {
      const v = pin; pin = '';
      const ok = await onPin(v);
      if (ok === false) { $('#dots', el).classList.add('err'); setTimeout(() => { $('#dots', el).classList.remove('err'); dots(); }, 350); }
    }
  };
  if (opts.forgot) $('#forgot', el).onclick = e => { e.preventDefault(); opts.forgot(); };
}
let hiddenAt = 0;
function showLock() {
  const s = S(); if (!s.pinHash) return;
  pinPad('dFaster Note লক করা', '৪ অঙ্কের PIN দিন', async pin => {
    if (await U.sha256(s.pinSalt + pin) === s.pinHash) { $('#lock').classList.add('hidden'); return true; }
    return false;
  }, {forgot: () => U.toast(Cloud.user() ? 'PIN ভুলে গেলে: ফোনের Settings → Apps → dFaster Note → Clear data করে আবার লগইন করুন — ক্লাউড থেকে সব হিসাব ফিরে আসবে।' : 'PIN ছাড়া খোলা যাবে না। অ্যাপের ডেটা মুছে আবার চালু করে ব্যাকআপ ফাইল থেকে হিসাব ফেরত আনুন।', 6000)});
}
function setPin() {
  const cancel = () => {};
  pinPad('নতুন PIN', '৪ অঙ্কের নতুন PIN দিন', first => {
    pinPad('আবার দিন', 'নিশ্চিত করতে একই PIN আবার দিন', async second => {
      if (second !== first) { U.toast('দুটি PIN মেলেনি — আবার চেষ্টা করুন'); setPin(); return true; }
      const salt = U.uid(); await setS({pinSalt: salt, pinHash: await U.sha256(salt + second)});
      $('#lock').classList.add('hidden'); U.toast('🔒 PIN লক চালু হয়েছে'); render(); return true;
    }, {cancel});
    return true;
  }, {cancel});
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (S().pinHash && hiddenAt && Date.now() - hiddenAt > 60000 && $('#lock').classList.contains('hidden')) showLock();
});

/* ================= ONBOARDING / REGISTRATION / LOGIN ================= */
function onboarding() { if (Cloud.enabled()) authScreen(); else localSetup(); }
const finishOnboard = (msg = 'স্বাগতম! 🎉') => {
  $('#onboard').classList.add('hidden'); applyProfile(); applyTheme();
  if (location.hash && location.hash !== '#/') location.hash = '#/'; else render();
  U.toast(msg);
};
// web demo / local-only: the shop form, saved on this device
function localSetup() {
  const el = $('#onboard');
  el.innerHTML = `<div class="inner"><div class="hero"><img class="logo" src="icons/icon-192.png" alt="" style="display:block;background:none"><h1>dFaster Note</h1><p class="muted">দোকানের বাকি, বেচাকেনা আর ক্যাশের হিসাব — সহজে, বাংলায়</p></div>
    <div class="card"><h2 style="margin-top:0">দোকানের তথ্য দিন</h2>${shopFields()}
      <button class="btn primary block" id="oGo">শুরু করুন →</button>
      ${Cloud.enabled() ? '<p style="text-align:center"><a href="#" id="oAuth">← লগইন / রেজিস্ট্রেশন</a></p>' : '<div class="note small">এখানে সব হিসাব শুধু এই ডিভাইসে থাকবে। মোবাইল নম্বর + পাসওয়ার্ড বা Google দিয়ে লগইন আর ক্লাউড সিঙ্ক — Android অ্যাপে।</div>'}
    </div>
    <p style="text-align:center"><a href="#" id="oRestore">📂 পুরোনো ব্যাকআপ ফাইল থেকে ফেরত আনুন</a></p>
    <p class="credit">Powered by Robin · dFaster.com</p></div>`;
  el.classList.remove('hidden');
  $('#oGo', el).onclick = async () => {
    const pr = readShop(el); if (!pr) return;
    await DB.meta.set('profile', {...pr, registeredAt: Date.now(), verified: false}); finishOnboard();
  };
  if ($('#oAuth', el)) $('#oAuth', el).onclick = e => { e.preventDefault(); authScreen(); };
  $('#oRestore', el).onclick = e => { e.preventDefault(); importBackup(() => { if (DB.meta.get('profile')) finishOnboard(); else U.toast('ফাইলে দোকানের তথ্য নেই — উপরের ফর্মটি পূরণ করুন'); }); };
}
const shopFields = (p = {}, withPhone = true) => `
  <label class="field"><span>দোকানের নাম *</span><input class="input" id="oShop" placeholder="যেমন: মায়ের দোয়া স্টোর" autocomplete="organization" value="${esc(p.shopName || '')}"></label>
  <label class="field"><span>মালিকের নাম *</span><input class="input" id="oOwner" autocomplete="name" value="${esc(p.ownerName || '')}"></label>
  ${withPhone ? `<label class="field"><span>মোবাইল নম্বর *</span><input class="input" id="oPhone" type="tel" inputmode="tel" placeholder="01XXXXXXXXX" autocomplete="tel" value="${esc(p.phone || '')}"></label>` : ''}`;
function readShop(el, withPhone = true) {
  const shopName = $('#oShop', el).value.trim(), ownerName = $('#oOwner', el).value.trim(), phone = withPhone ? $('#oPhone', el).value.trim() : '';
  if (!shopName) return U.toast('দোকানের নাম লিখুন'), null;
  if (!ownerName) return U.toast('মালিকের নাম লিখুন'), null;
  if (withPhone && !U.validBdPhone(phone)) return U.toast('সঠিক মোবাইল নম্বর লিখুন (01XXXXXXXXX)'), null;
  return {shopName, ownerName, phone: phone ? U.normPhone(phone) : ''};
}
const pwField = (id, label, auto = 'current-password') => `<label class="field"><span>${label}</span><span class="pw"><input class="input" id="${id}" type="password" autocomplete="${auto}" minlength="6"><button type="button" class="eye" data-eye="${id}" aria-label="পাসওয়ার্ড দেখান">👁</button></span></label>`;
function wireEyes(root) {
  $$('[data-eye]', root).forEach(b => b.onclick = () => {
    const i = $('#' + b.dataset.eye, root), show = i.type === 'password';
    i.type = show ? 'text' : 'password'; b.textContent = show ? '🙈' : '👁'; b.setAttribute('aria-label', show ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখান');
  });
}
function checkPw(a, b) {
  if (a.length < 6) return U.toast('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন'), false;
  if (b !== undefined && a !== b) return U.toast('দুটি পাসওয়ার্ড মেলেনি'), false;
  return true;
}
const busy = async (btn, label, f) => { const t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '⏳ ' + label; try { return await f(); } finally { btn.disabled = false; btn.innerHTML = t; } };
// after any successful login: make sure there is a shop profile (Google users / brand-new accounts), then enter
async function afterLogin(msg) {
  const p = DB.meta.get('profile');
  if (p && p.shopName) return finishOnboard(msg);
  const u = Cloud.user() || {}, el = $('#onboard');
  el.innerHTML = `<div class="inner"><div class="hero"><img class="logo" src="icons/icon-192.png" alt="" style="display:block;background:none"><h1>দোকানের তথ্য</h1><p class="muted">লগইন হয়েছে ✅ ${esc(u.phone ? U.bn(U.normPhone(u.phone)) : (u.email || ''))}</p></div>
    <div class="card">${shopFields({ownerName: u.name || '', phone: u.phone ? U.normPhone(u.phone) : ''})}<button class="btn primary block" id="oGo">শুরু করুন →</button></div>
    <p class="credit">Powered by Robin · dFaster.com</p></div>`;
  el.classList.remove('hidden');
  $('#oGo', el).onclick = async () => {
    const pr = readShop(el); if (!pr) return;
    await DB.meta.set('profile', {...(DB.meta.get('profile') || {}), ...pr, registeredAt: Date.now(), verified: true});
    Cloud.schedule(); finishOnboard();
  };
}
function authScreen(tab = 'login') {
  const el = $('#onboard');
  el.innerHTML = `<div class="inner"><div class="hero"><img class="logo" src="icons/icon-192.png" alt="" style="display:block;background:none"><h1>dFaster Note</h1><p class="muted">দোকানের বাকি, বেচাকেনা আর ক্যাশের হিসাব — নিরাপদে ক্লাউডে, যেকোনো ফোনে</p></div>
    <div class="tabs" id="aTabs"><button data-tab="login">লগইন</button><button data-tab="reg">রেজিস্ট্রেশন</button></div>
    <div class="card" id="aLogin">
      <label class="field"><span>মোবাইল নম্বর</span><input class="input" id="aPh" type="tel" inputmode="tel" placeholder="01XXXXXXXXX" autocomplete="tel"></label>
      ${pwField('aPw', 'পাসওয়ার্ড')}
      <button class="btn primary block" id="aGo">লগইন</button>
      <p style="text-align:center;margin:12px 0 0"><a href="#" id="aForgot">পাসওয়ার্ড ভুলে গেছেন?</a></p>
    </div>
    <div class="card" id="aReg">${shopFields()}
      ${pwField('rPw', 'পাসওয়ার্ড দিন (কমপক্ষে ৬ অক্ষর)', 'new-password')}${pwField('rPw2', 'আবার পাসওয়ার্ড দিন', 'new-password')}
      <button class="btn primary block" id="rGo">📩 OTP পাঠিয়ে রেজিস্ট্রেশন</button>
      <p class="small muted" style="margin:10px 0 0">নম্বরটি আপনার কিনা যাচাই করতে একবার SMS কোড (OTP) যাবে। এরপর শুধু নম্বর + পাসওয়ার্ড দিয়ে যেকোনো ফোনে লগইন।</p>
    </div>
    <div class="or"><span>অথবা</span></div>
    <button class="btn block google" id="aGoogle"><b class="g">G</b> Google দিয়ে লগইন</button>
    <p class="small muted" style="text-align:center">লগইন করলে সব হিসাব (কাস্টমার, সাপ্লায়ার, খাতা, বেচাকেনা, ক্যাশ, খরচ, ছবি) আপনার অ্যাকাউন্টে নিরাপদে থাকে — নতুন ফোনে লগইন করলেই সব ফিরে আসে।</p>
    <p style="text-align:center" class="small"><a href="#" id="oRestore">📂 ব্যাকআপ ফাইল থেকে ফেরত আনুন</a> · <a href="#" id="aLocal">লগইন ছাড়া চালান</a></p>
    <p class="credit">Powered by Robin · dFaster.com</p></div>`;
  el.classList.remove('hidden');
  const show = t => { $$('#aTabs button', el).forEach(b => b.classList.toggle('on', b.dataset.tab === t)); $('#aLogin', el).classList.toggle('hidden', t !== 'login'); $('#aReg', el).classList.toggle('hidden', t !== 'reg'); };
  show(tab);
  $('#aTabs', el).onclick = e => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); };
  wireEyes(el);
  $('#aGo', el).onclick = async e => {
    const ph = $('#aPh', el).value.trim(), pw = $('#aPw', el).value;
    if (!U.validBdPhone(ph)) return U.toast('সঠিক মোবাইল নম্বর লিখুন (01XXXXXXXXX)');
    if (!pw) return U.toast('পাসওয়ার্ড লিখুন');
    try { await busy(e.currentTarget, 'লগইন হচ্ছে…', () => Cloud.loginPassword(ph, pw)); afterLogin('✅ লগইন হয়েছে — হিসাব ফেরত আনা হয়েছে'); }
    catch (err) { U.toast(err.message, 4000); }
  };
  $('#aForgot', el).onclick = e => { e.preventDefault(); forgotPassword($('#aPh', el).value.trim()); };
  $('#rGo', el).onclick = async () => {
    const pr = readShop(el); if (!pr) return;
    const pw = $('#rPw', el).value; if (!checkPw(pw, $('#rPw2', el).value)) return;
    await DB.meta.set('profile', {...pr, registeredAt: Date.now(), verified: false});   // kept only if the account has no saved shop yet
    otpFlow(pr.phone, async () => {
      await Cloud.setPassword(pr.phone, pw);
      afterLogin('✅ রেজিস্ট্রেশন হয়েছে');
    }, {title: '📱 নম্বর যাচাই', lock: true});
  };
  $('#aGoogle', el).onclick = async e => {
    try { await busy(e.currentTarget, 'Google…', () => Cloud.loginGoogle()); afterLogin('✅ Google দিয়ে লগইন হয়েছে'); }
    catch (err) { U.toast('Google লগইন হয়নি: ' + err.message, 4000); }
  };
  $('#aLocal', el).onclick = e => { e.preventDefault(); localSetup(); };
  $('#oRestore', el).onclick = e => { e.preventDefault(); importBackup(() => { if (DB.meta.get('profile')) finishOnboard(); else U.toast('ফাইলে দোকানের তথ্য নেই'); }); };
}
function forgotPassword(phone) {
  openSheet(`<h2>🔑 নতুন পাসওয়ার্ড</h2><p class="small muted">নম্বরে SMS কোড (OTP) যাবে। যাচাই হলে নতুন পাসওয়ার্ড দিন।</p>
    <label class="field"><span>মোবাইল নম্বর</span><input class="input" id="fPh" type="tel" inputmode="tel" value="${esc(phone || '')}"></label>
    ${pwField('fPw', 'নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)', 'new-password')}${pwField('fPw2', 'আবার নতুন পাসওয়ার্ড', 'new-password')}
    <button class="btn primary block" id="fGo">📩 OTP পাঠান</button>`, c => {
    wireEyes(c);
    $('#fGo', c).onclick = () => {
      const ph = $('#fPh', c).value.trim(), pw = $('#fPw', c).value;
      if (!U.validBdPhone(ph)) return U.toast('সঠিক মোবাইল নম্বর লিখুন');
      if (!checkPw(pw, $('#fPw2', c).value)) return;
      otpFlow(ph, async () => { await Cloud.setPassword(ph, pw); afterLogin('✅ নতুন পাসওয়ার্ড সেট হয়েছে'); }, {title: '🔑 নম্বর যাচাই', lock: true});
    };
  });
}
// OTP sheet: sends the code right away; onOk runs after the phone is verified (user is signed in to Firebase)
function otpFlow(phone, onOk, {title = '📱 ফোন নম্বর যাচাই'} = {}) {
  let vid = null;
  const ok = async c => {
    try { await onOk(); closeSheet(); }
    catch (e) { U.toast(e.message, 4500); if (c) { const b = $('#otpOk', c); if (b) b.disabled = false; } }
  };
  openSheet(`<h2>${esc(title)}</h2><p class="small muted" id="otpMsg">${esc(U.bn(U.normPhone(phone)))} নম্বরে ৬ অঙ্কের কোড পাঠানো হচ্ছে…</p>
    <div id="otpW"><label class="field"><span>SMS-এ আসা ৬ অঙ্কের কোড</span><input class="input amount" id="otpC" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>
    <button class="btn primary block" id="otpOk" disabled>যাচাই করুন</button>
    <p style="text-align:center;margin:10px 0 0"><button class="btn" id="otpSend" disabled>আবার পাঠান</button></p></div>`, c => {
    const send = async () => {
      const b = $('#otpSend', c); b.disabled = true;
      try {
        const r = await Cloud.sendOtp(phone);
        if (r.user) { U.toast('✅ নম্বর নিজে থেকেই যাচাই হয়েছে'); return ok(c); }   // Android auto-verified the SMS
        vid = r.verificationId; $('#otpOk', c).disabled = false; $('#otpMsg', c).textContent = `${U.bn(U.normPhone(phone))} নম্বরে SMS-এ কোড পাঠানো হয়েছে।`; $('#otpC', c).focus(); U.toast('কোড পাঠানো হয়েছে');
      } catch (e) { U.toast('OTP পাঠানো যায়নি: ' + e.message, 5000); }
      setTimeout(() => { if ($('#otpSend', c)) $('#otpSend', c).disabled = false; }, 30000);
    };
    $('#otpSend', c).onclick = send;
    $('#otpOk', c).onclick = async e => {
      const code = U.toAscii($('#otpC', c).value); if (!/^\d{6}$/.test(code)) return U.toast('৬ অঙ্কের কোড লিখুন');
      e.currentTarget.disabled = true;
      try { await Cloud.confirmOtp(vid, code); } catch (err) { e.currentTarget.disabled = false; return U.toast(err.message); }
      ok(c);
    };
    send();
  });
}

/* ================= boot ================= */
const VIEWS = {home, parties, party, trade, cash, reports, settings, products};
async function boot() {
  try { await DB.init(); }
  catch (e) { view.innerHTML = `<div class="card">ডেটাবেস খোলা যায়নি: ${esc(e.message)}</div>`; return; }
  applyTheme(); applyProfile();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  if (!DB.meta.get('profile')) onboarding();
  else if (S().pinHash) showLock();
  render();
  if (Cloud.enabled() && Cloud.user()) Cloud.sync().catch(e => console.warn('sync', e));
  window.addEventListener('online', () => Cloud.schedule());
}
window.BK = {go, render, openSheet, closeSheet, VERSION};
boot();
})();
