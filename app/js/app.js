/* dFaster Note — screens, router, sheets, lock, onboarding */
(() => {
'use strict';
const {$, $$, esc, money, moneyAbs, bn, ymd} = U;
const view = $('#view');
const S = () => DB.meta.get('settings') || {};
const setS = async patch => DB.meta.set('settings', {...S(), ...patch});
const VERSION = '1.2.0';

/* ================= router ================= */
let route = {name: 'home', args: []};
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
function parse() { const [name, ...args] = (location.hash.replace(/^#\/?/, '') || 'home').split('/'); return {name, args: args.map(decodeURIComponent)}; }
const NAVMAP = {home: 'home', parties: 'parties', party: 'parties', trade: 'trade', cash: 'cash', reports: 'reports', settings: '', products: '', profile: 'profile', smslog: ''};
function render(keepScroll) {
  const y = window.scrollY;
  route = parse();
  const fn = VIEWS[route.name] || VIEWS.home;
  $$('#bottomNav button').forEach(b => b.classList.toggle('on', b.dataset.nav === NAVMAP[route.name]));
  view.innerHTML = '';
  fn(...route.args);
  window.scrollTo(0, keepScroll === true ? y : 0);
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
  closeSheet(); go('#/' + n);
});
$('#setBtn').onclick = () => go('#/settings');
$('#meBtn').onclick = () => go('#/profile');
$('#brand').onclick = () => go('#/home');
$('#themeBtn').onclick = async () => { const dark = document.documentElement.dataset.theme !== 'dark'; await setS({theme: dark ? 'dark' : 'light'}); applyTheme(); };
function applyTheme() {
  const t = S().theme || 'auto';
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#themeBtn').innerHTML = Ic(dark ? 'sun' : 'moon');
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#11251d' : '#0b6e4f';
}
function applyProfile() {
  const p = DB.meta.get('profile') || {};
  $('#shopTitle').textContent = p.shopName || 'dFaster Note';
  $('#subTitle').textContent = p.shopName ? 'dFaster Note' + (p.ownerName ? ' · ' + p.ownerName : '') : 'ডিজিটাল দোকানের হিসাব';
  $('#meBtn').innerHTML = p.photo ? `<img src="${esc(p.photo)}" alt="">` : (p.ownerName || p.shopName) ? initials(p.ownerName || p.shopName) : Ic('user-round');
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
// per-transaction SMS status (from the local SMS log)
const SMS_ST = {sent: ['circle-check', 'SMS গেছে'], failed: ['circle-alert', 'SMS যায়নি'], opened: ['message-square-text', 'SMS অ্যাপে'], pending: ['clock', 'SMS অপেক্ষায়'], sending: ['clock', 'পাঠানো হচ্ছে']};
function smsBadge(ref) { const r = smsStatusOf(ref); if (!r || !SMS_ST[r.status]) return ''; const [i, l] = SMS_ST[r.status]; return `<span class="smsb ${r.status}" title="${esc(r.error || '')}">${Ic(i)}${l}</span>`; }
const avatar = (p, big) => `<div class="avatar${big ? ' big' : ''}">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : initials(p.name)}</div>`;
function balHtml(b, small) {
  if (b > 0) return `<span class="get">${money(b)}</span>${small ? '<small class="get">পাবো</small>' : ''}`;
  if (b < 0) return `<span class="give">${moneyAbs(b)}</span>${small ? '<small class="give">দেবো</small>' : ''}`;
  return `<span class="muted">${money(0)}</span>${small ? '<small class="muted">হিসাব সমান</small>' : ''}`;
}
const typeBn = t => t === 'supplier' ? 'সাপ্লায়ার' : 'কাস্টমার';
function partyRow(p, bal) {
  return `<button class="row" data-party="${p.id}">${avatar(p)}<div class="main"><div class="t">${esc(p.name)}</div><div class="s">${p.phone ? Ic('phone', 'sm') + ' ' + bn(p.phone) : typeBn(p.type)}</div></div><div class="amt">${balHtml(bal, true)}</div></button>`;
}
function txnRow(t) {
  const p = t.partyId ? DB.get('parties', t.partyId) : null;
  const items = (t.items || []).map(i => i.name).join(', ');
  return `<button class="row" data-txn="${t.id}"><div class="tile ${t.type === 'sale' ? 't-green' : 't-orange'}">${Ic(t.type === 'sale' ? 'receipt' : 'package')}</div><div class="main"><div class="t">${t.type === 'sale' ? 'বিক্রয়' : 'ক্রয়'}${p ? ' · ' + esc(p.name) : ''} <span class="badge ${t.due > 0 ? 'due' : ''}">${t.due > 0 ? (t.paid > 0 ? 'আংশিক বাকি' : 'বাকি') : 'নগদ'}</span>${smsBadge(t.id)}</div><div class="s">${U.dateShort(t.date)}${items ? ' · ' + esc(items) : t.note ? ' · ' + esc(t.note) : ''}</div></div><div class="amt ${t.type === 'sale' ? 'get' : 'give'}">${money(t.total)}${t.due > 0 ? `<small class="give">বাকি ${money(t.due)}</small>` : ''}</div></button>`;
}
function cashRow(c) {
  const sign = c.kind === 'in' ? '+' : '−';
  const lbl = c.kind === 'expense' ? 'খরচ' : c.kind === 'in' ? 'ক্যাশ ইন' : 'ক্যাশ আউট';
  return `<button class="row" data-cash="${c.id}"><div class="tile ${c.kind === 'expense' ? 't-red' : c.kind === 'in' ? 't-green' : 't-orange'}">${Ic(c.kind === 'expense' ? 'receipt' : c.kind === 'in' ? 'arrow-down-to-line' : 'arrow-up-from-line')}</div><div class="main"><div class="t">${esc(c.category || lbl)}</div><div class="s">${lbl} · ${U.dateShort(c.date)}${c.note ? ' · ' + esc(c.note) : ''}</div></div><div class="amt ${c.kind === 'in' ? 'get' : 'give'}">${sign}${money(c.amount)}</div></button>`;
}
function entryRow(e) {
  const p = DB.get('parties', e.partyId) || {name: '?'};
  return `<button class="row" data-entry="${e.id}">${avatar(p)}<div class="main"><div class="t">${esc(p.name)} · ${e.kind === 'gave' ? 'দিলাম' : 'পেলাম'}${smsBadge(e.src ? e.src.id : e.id)}</div><div class="s">${U.dateShort(e.date)}${e.note ? ' · ' + esc(e.note) : ''}</div></div><div class="amt ${e.kind === 'gave' ? 'give' : 'get'}">${money(e.amount)}</div></button>`;
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
    <button data-q="sale-cash"><b class="tile t-green">${Ic('banknote')}</b>নগদ বিক্রয়</button>
    <button data-q="sale-due"><b class="tile t-teal">${Ic('notebook-pen')}</b>বাকিতে বিক্রয়</button>
    <button data-q="gave"><b class="tile t-red">${Ic('arrow-up-from-line')}</b>দিলাম</button>
    <button data-q="got"><b class="tile t-green">${Ic('arrow-down-to-line')}</b>পেলাম</button>
    <button data-q="purchase"><b class="tile t-orange">${Ic('package')}</b>ক্রয়</button>
    <button data-q="expense"><b class="tile t-red">${Ic('receipt')}</b>খরচ</button>
    <button data-q="customer"><b class="tile t-blue">${Ic('user-plus')}</b>নতুন কাস্টমার</button>
    <button data-q="remind"><b class="tile t-amber">${Ic('bell-ring')}</b>তাগাদা</button>
  </div>
  ${Cloud.enabled() && !Cloud.user() ? `<div class="note warn">${Ic('cloud-off')} হিসাব এখন শুধু এই ফোনে। <a href="#" id="hLogin">লগইন / রেজিস্ট্রেশন</a> করলে সব হিসাব নিরাপদে ক্লাউডে থাকবে, নতুন ফোনেও ফিরে পাবেন।</div>` : ''}
  ${S().notifOff ? `<div class="note warn">${Ic('bell')} নোটিফিকেশন বন্ধ আছে — SMS-এর খবর ও বাকির রিমাইন্ডার পাবেন না। <a href="#" id="hNotif">চালু করুন</a></div>` : ''}
  ${(() => { const c = profileCompletion(); return c.pct < 100 && DB.meta.get('profile') ? `<div class="note">${Ic('user-round')} প্রোফাইল ${bn(c.pct)}% সম্পূর্ণ — <a href="#/profile">বাকি তথ্য দিন</a></div>` : ''; })()}
  ${!S().pinHash ? `<div class="note">${Ic('lock')} অন্য কেউ যেন আপনার হিসাব দেখতে না পারে — <a href="#/settings">সেটিংসে PIN লক</a> চালু করুন।</div>` : ''}
  ${!Cloud.user() && (!lb || Date.now() - lb > 7 * 864e5) ? `<div class="note warn">${Ic('hard-drive')} ${lb ? 'শেষ ব্যাকআপ ' + bn(Math.floor((Date.now() - lb) / 864e5)) + ' দিন আগে।' : 'এখনও কোনো ব্যাকআপ নেওয়া হয়নি।'} ফোন হারালে হিসাব ফেরত পেতে <a href="#/settings">ব্যাকআপ ফাইল</a> রাখুন।</div>` : ''}
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
  if ($('#hNotif', view)) $('#hNotif', view).onclick = async e => { e.preventDefault(); const st = await Notify.status(); if (st.perm !== 'denied' && !S().notifAsked) return askNotifications(true); const r = await Notify.request(); if (r.enabled) { await setS({notifOff: false}); render(true); } else Native.openNotificationSettings(); };
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
    <div class="btns">${edit ? '<button class="btn danger" id="pdel">' + Ic('trash-2') + ' মুছুন</button>' : ''}<button class="btn primary" id="psave">সংরক্ষণ</button></div>`, c => {
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
    <div class="partyhead">${avatar(p, true)}<div class="main"><h2>${esc(p.name)}</h2><div class="small muted">${typeBn(p.type)}${p.phone ? ' · ' + bn(p.phone) : ' · <span class="give">নম্বর নেই — অটো SMS যাবে না</span>'}${p.address ? ' · ' + esc(p.address) : ''}</div></div></div>
    <div style="margin-top:10px" class="small muted">${bal > 0 ? (sup ? 'সাপ্লায়ারের কাছে পাবো' : 'মোট বাকি (পাবো)') : bal < 0 ? (sup ? 'সাপ্লায়ারকে দেবো' : 'কাস্টমারকে দেবো (অগ্রিম)') : 'হিসাব সমান'}</div>
    <div class="bigbal" id="pbal">${balHtml(bal)}</div>
    <div class="acts" style="grid-template-columns:repeat(5,1fr)">
      <button id="aCall" ${p.phone ? '' : 'disabled'}><b class="tile t-blue">${Ic('phone')}</b>কল</button>
      <button id="aRemind"><b class="tile t-amber">${Ic('bell-ring')}</b>তাগাদা</button>
      <button id="aQr"><b class="tile t-green">${Ic('qr-code')}</b>পেমেন্ট QR</button>
      <button id="aPdf"><b class="tile t-purple">${Ic('file-text')}</b>PDF</button>
      <button id="aEdit"><b class="tile t-gray">${Ic('pencil')}</b>এডিট</button>
    </div>
  </div>
  <div class="card" style="padding:6px 8px">
    <table class="ledger"><thead><tr><th>তারিখ / বিবরণ</th><th>দিলাম</th><th>পেলাম</th><th>ব্যালেন্স</th></tr></thead>
    <tbody id="ledBody">${led.length ? [...led].reverse().map(e => `<tr data-entry="${e.id}"><td>${U.dateShort(e.date)}<span class="s">${esc(e.note || (e.kind === 'gave' ? 'দিলাম' : 'পেলাম'))}${e.cashId ? ' · নগদ' : ''}${smsBadge(e.src ? e.src.id : e.id)}</span></td><td class="give">${e.kind === 'gave' ? money(e.amount) : ''}</td><td class="get">${e.kind === 'got' ? money(e.amount) : ''}</td><td>${balHtml(e.run)}</td></tr>`).join('')
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
  $('#aQr').onclick = () => payQrSheet(p, Math.max(0, Book.balance(p.id)));
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
    ${old ? smsStatusLine(old.id) : ''}
    <div class="btns">${old ? '<button class="btn danger" id="edel">' + Ic('trash-2') + ' মুছুন</button>' : ''}<button class="btn primary" id="esave">সংরক্ষণ</button></div>`, c => {
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
        const changed = !old || old.amount !== saved.amount || old.kind !== saved.kind || old.date !== saved.date;
        if (changed) notifySms(p, Native.entryText(saved, p, {edited: !!old}), saved.id, old ? 'edit' : 'new');
      } catch (err) { U.toast(err.message); }
    };
    if ($('#edel', c)) $('#edel', c).onclick = async () => { closeSheet(); if (await confirmSheet('এই হিসাবটি মুছবেন?', `${money(old.amount)} · ${U.dateShort(old.date)}`, 'মুছুন')) { await Book.deleteEntry(old.id); U.toast('মুছে ফেলা হয়েছে'); render(); Cloud.schedule();
      notifySms(p, Native.cancelText(old.kind === 'gave' ? (sup ? 'পরিশোধের হিসাব' : 'বাকির হিসাব') : (sup ? 'বাকির হিসাব' : 'জমার হিসাব'), old.amount, old.date, p), old.id, 'cancel'); } };
  });
}

/* ================= SMS =================
   অটো SMS (default ON in the Android app): after every দিলাম / পেলাম / sale / purchase / edit / delete the party gets an SMS,
   sent silently via SmsManager from the chosen SIM. First time: Bangla explanation, then the SEND_SMS permission dialog.
   Permission denied → the phone's SMS app opens with the text ready. No phone number → skipped. Every attempt is logged. */
const autoSmsOn = () => S().autoSms !== false;
const smsLog = () => DB.meta.get('smslog') || [];
async function logSms(rec) { const l = smsLog().filter(x => x.id !== rec.id); l.unshift(rec); await DB.meta.set('smslog', l.slice(0, 300)); return rec; }
function smsStatusOf(ref) { return ref ? smsLog().find(x => x.ref === ref) || null : null; }
let smsQ = Promise.resolve();
function notifySms(p, text, ref, kind = 'new') { const job = smsQ.then(() => doNotifySms(p, text, ref, kind)).catch(e => console.warn('sms', e)); smsQ = job; return job; }
async function ensureSmsPerm(force) {
  let st = await Native.smsPermission(false).catch(() => 'denied');
  if (st === 'granted') return true;
  if (S().smsPermAsked && !force) return false;
  await setS({smsPermAsked: true});
  const ok = await confirmSheet('অটো SMS-এর অনুমতি', `প্রতিটি হিসাবের পর (দিলাম, পেলাম, বিক্রয়, ক্রয়, সংশোধন) কাস্টমারকে নিজে থেকেই SMS পাঠাতে dFaster Note-কে <b>"SMS পাঠানো"</b>র অনুমতি দিন।<br><br>• SMS আপনার সিম থেকে যাবে — সিমের স্বাভাবিক SMS খরচ কাটবে।<br>• অ্যাপ আপনার কোনো SMS পড়ে না।<br>• অনুমতি না দিলে প্রতিবার ফোনের SMS অ্যাপ খুলবে, লেখা তৈরি থাকবে।<br>• সেটিংস থেকে যেকোনো সময় অটো SMS বন্ধ করা যায়।`, 'অনুমতি দিন', false);
  if (!ok) return false;
  st = await Native.smsPermission(true).catch(() => 'denied');
  return st === 'granted';
}
async function doNotifySms(p, text, ref, kind) {
  if (!p) return;
  const base = {id: U.uid(), at: Date.now(), ref: ref || null, partyId: p.id, name: p.name, phone: p.phone || '', text, kind};
  if (!p.phone) { await logSms({...base, status: 'nophone'}); return; }
  if (!U.isNative() || !autoSmsOn()) { if (S().smsPrompt !== false) await smsSheetWait(p, text, 'কাস্টমারকে SMS-এ জানাবেন?', ref, kind); return; }
  if (!await ensureSmsPerm()) return openSmsApp(base);
  return sendNow(base);
}
async function openSmsApp(base) {
  await logSms({...base, status: 'opened', at: Date.now()});
  U.toast('SMS-এর অনুমতি নেই — SMS অ্যাপ খোলা হচ্ছে');
  try { await Native.composeSms(base.phone, base.text); } catch (e) { U.toast(e.message); }
}
async function sendNow(base) {
  const s = S(); const rec = await logSms({...base, status: 'sending', sim: s.smsSimLabel || ''});
  let r;
  try { r = await Native.sendSmsAuto(base.phone, base.text, s.smsSim); }
  catch (e) { if (e && e.code === 'NO_PERMISSION') return openSmsApp(base); r = {status: 'failed', error: e.message}; }
  const status = r.status === 'sent' ? 'sent' : r.status === 'pending' ? 'pending' : 'failed';
  const error = status === 'failed' ? (r.error || Native.smsErr(r.code)) : '';
  await logSms({...rec, status, parts: r.parts || 0, error, at: Date.now()});
  if (status !== 'failed') {
    U.toast(`SMS পাঠানো হয়েছে — ${base.name}`);
    Notify.show('sms', 'SMS পাঠানো হয়েছে', `${base.name} (${bn(base.phone)})${r.parts > 1 ? ' · ' + bn(r.parts) + ' ভাগে' : ''}`);
  } else {
    U.toast(`SMS যায়নি — ${error}`, 4200);
    Notify.show('sms_fail', 'SMS যায়নি', `${base.name}: ${error}। SMS লগ থেকে "আবার পাঠান" চাপুন।`);
  }
  if ($('#sheet').classList.contains('hidden') && ['party', 'home', 'smslog', 'trade'].includes(route.name)) render(true);
  return status;
}
function smsSheetWait(p, text, title, ref, kind) { return new Promise(res => smsSheet(p, text, title, ref, kind, res)); }
function smsSheet(p, text, title, ref, kind = 'manual', onDone) {
  const cust = p.type !== 'supplier', bal = Book.balance(p.id), hasPay = Pay.methods().length > 0;
  openSheet(`<h2>${esc(title)}</h2>
    <p class="small muted">প্রাপক: ${esc(p.name)} · ${bn(p.phone)}</p>
    <textarea class="input" id="smsT" rows="5">${esc(text)}</textarea>
    <p class="small muted" id="smsN"></p>
    <div class="btns"><button class="btn primary" id="smsGo">${Ic('send')} SMS পাঠান</button><button class="btn" id="waGo">${Ic('message-circle')} WhatsApp</button></div>
    ${cust && bal > 0 && hasPay ? `<button class="btn block" id="qrGo" style="margin-top:8px">${Ic('qr-code')} পেমেন্ট QR (${money(bal)}) শেয়ার</button>` : ''}
    <button class="btn block" data-close style="margin-top:8px">এখন না</button>`, c => {
    const n = () => { const t = $('#smsT', c).value; $('#smsN', c).textContent = `${bn(t.length)} অক্ষর · আনুমানিক ${bn(Native.smsParts(t))}টি SMS (বাংলায় ৭০ অক্ষরে ১টি SMS)`; };
    n(); $('#smsT', c).oninput = n;
    $('#smsGo', c).onclick = async () => {
      const t = $('#smsT', c).value, base = {id: U.uid(), at: Date.now(), ref: ref || null, partyId: p.id, name: p.name, phone: p.phone, text: t, kind};
      closeSheet();
      try {
        if (U.isNative() && autoSmsOn() && await ensureSmsPerm(true)) await sendNow(base);
        else { await logSms({...base, status: 'opened'}); await Native.composeSms(p.phone, t); }
      } catch (err) { U.toast(err.message); }
    };
    $('#waGo', c).onclick = () => { Native.whatsapp(p.phone, $('#smsT', c).value); closeSheet(); };
    if ($('#qrGo', c)) $('#qrGo', c).onclick = () => { closeSheet(); payQrSheet(p, bal); };
  }, () => onDone && onDone());
}
// one SMS log row → resend
async function resendSms(rec) {
  const p = DB.get('parties', rec.partyId) || {id: rec.partyId, name: rec.name, phone: rec.phone};
  if (!p.phone) return U.toast('এই কাস্টমারের মোবাইল নম্বর নেই');
  const base = {id: U.uid(), at: Date.now(), ref: rec.ref, partyId: p.id, name: p.name, phone: p.phone, text: rec.text, kind: 'resend'};
  if (U.isNative() && autoSmsOn() && await ensureSmsPerm(true)) return sendNow(base);
  await logSms({...base, status: 'opened'}); return Native.composeSms(p.phone, rec.text);
}
function remind(p) {
  if (!p.phone) return U.toast('এই কাস্টমারের মোবাইল নম্বর নেই — এডিট করে যোগ করুন');
  if (Book.balance(p.id) <= 0) return U.toast('এই কাস্টমারের কোনো বাকি নেই');
  smsSheet(p, Native.reminderText(p), 'বাকির তাগাদা', null, 'remind');
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
    <div class="seg" id="tm"><button data-v="cash" class="${t.mode === 'cash' ? 'on' : ''}">নগদ</button><button data-v="due" class="gave ${t.mode === 'due' ? 'on' : ''}">বাকি</button></div>
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
    ${old ? smsStatusLine(old.id) : ''}
    <div class="btns">${old ? '<button class="btn danger" id="tdel">' + Ic('trash-2') + ' মুছুন</button>' : ''}<button class="btn primary" id="tsave">সংরক্ষণ</button></div>`, c => {
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
        const changed = !old || ['total', 'paid', 'mode', 'date', 'partyId', 'type'].some(k => old[k] !== saved[k]);
        if (changed && old && old.partyId && old.partyId !== partyId) { const op = DB.get('parties', old.partyId); if (op) notifySms(op, Native.cancelText(old.type === 'sale' ? 'বিক্রয়' : 'ক্রয়', old.total, old.date, op), old.id, 'cancel'); }
        if (changed && p) notifySms(p, Native.saleText(saved, p, {edited: !!old}), saved.id, old ? 'edit' : 'new');
        // a due sale: show the payment QR with the new due right away (if the shop saved a payment method)
        if (p && sale && saved.due > 0 && p.type !== 'supplier' && Pay.methods().length && S().qrAfterSale !== false) smsQ.then(() => payQrSheet(p, Math.max(0, Book.balance(p.id))));
      } catch (err) { U.toast(err.message); }
    };
    if ($('#tdel', c)) $('#tdel', c).onclick = async () => { closeSheet(); if (await confirmSheet('লেনদেনটি মুছবেন?', `${money(old.total)} · ${U.dateShort(old.date)} — খাতার বাকি ও ক্যাশবক্সের হিসাবও মুছবে।`, 'মুছুন')) { await Book.deleteTxn(old.id); U.toast('মুছে ফেলা হয়েছে'); render(); Cloud.schedule();
      const op = old.partyId && DB.get('parties', old.partyId); if (op) notifySms(op, Native.cancelText(old.type === 'sale' ? 'বিক্রয়' : 'ক্রয়', old.total, old.date, op), old.id, 'cancel'); } };
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
    <div class="btns">${old ? '<button class="btn danger" id="cdel">' + Ic('trash-2') + ' মুছুন</button>' : ''}<button class="btn primary" id="csave">সংরক্ষণ</button></div>`, c => {
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
  <div class="list" id="prl">${l.length ? l.map(p => `<button class="row" data-prod="${p.id}"><div class="tile t-purple">${Ic('tag')}</div><div class="main"><div class="t">${esc(p.name)}</div></div><div class="amt">${money(p.price || 0)}${p.unit ? '<small class="muted">/' + esc(p.unit) + '</small>' : ''}</div></button>`).join('') : '<div class="empty">কোনো পণ্য নেই</div>'}</div>
  <button class="fab" id="prAdd">＋ পণ্য</button>`;
  const form = (p = {}) => openSheet(`<h2>${p.id ? 'পণ্য বদলান' : 'নতুন পণ্য'}</h2>
    <label class="field"><span>নাম</span><input class="input" id="prn" value="${esc(p.name || '')}" autofocus></label>
    <div class="grid2"><label class="field"><span>দর (৳)</span><input class="input" id="prp" inputmode="decimal" value="${p.price || ''}"></label><label class="field"><span>একক</span><input class="input" id="pru" placeholder="কেজি / পিস" value="${esc(p.unit || '')}"></label></div>
    <div class="btns">${p.id ? '<button class="btn danger" id="prd">' + Ic('trash-2') + ' মুছুন</button>' : ''}<button class="btn primary" id="prs">সংরক্ষণ</button></div>`, c => {
    $('#prs', c).onclick = async () => { const n = $('#prn', c).value.trim(); if (!n) return U.toast('নাম লিখুন'); await DB.put('products', {...p, name: n, price: U.num($('#prp', c).value), unit: $('#pru', c).value.trim()}); closeSheet(); render(); Cloud.schedule(); };
    if ($('#prd', c)) $('#prd', c).onclick = async () => { await DB.remove('products', p.id); closeSheet(); render(); Cloud.schedule(); };
  });
  $('#prAdd').onclick = () => form();
  $('#prl').onclick = e => { const r = e.target.closest('[data-prod]'); if (r) form(DB.get('products', r.dataset.prod)); };
}

/* ================= SETTINGS ================= */
function smsStatusLine(ref) {
  const r = smsStatusOf(ref); if (!r) return '';
  const st = SMS_ST[r.status], t = U.dateShort(ymd(new Date(r.at))) + ' ' + new Date(r.at).toLocaleTimeString('bn-BD', {hour: 'numeric', minute: '2-digit'});
  const lbl = r.status === 'nophone' ? 'নম্বর নেই — SMS যায়নি' : st ? st[1] : r.status;
  return `<div class="statusline">${Ic(st ? st[0] : 'message-square-text')}<div class="main" style="flex:1">${lbl}<div class="small muted">${t}${r.error ? ' · ' + esc(r.error) : ''}</div></div>${r.phone ? `<button class="btn" data-resend="${esc(r.id)}">${Ic('refresh-cw')} আবার পাঠান</button>` : ''}</div>`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-resend]'); if (!b) return;
  const rec = smsLog().find(x => x.id === b.dataset.resend); if (!rec) return;
  closeSheet(); try { await resendSms(rec); } catch (err) { U.toast(err.message); }
});
const SMS_LBL = {sent: 'গেছে', failed: 'যায়নি', opened: 'SMS অ্যাপে খোলা হয়েছে', pending: 'অপেক্ষায়', sending: 'পাঠানো হচ্ছে', nophone: 'নম্বর নেই'};
const KIND_LBL = {new: 'নতুন', edit: 'সংশোধন', cancel: 'মুছে ফেলা', resend: 'আবার', remind: 'তাগাদা', manual: 'হাতে'};
function smslog() {
  const l = smsLog();
  const n = k => l.filter(x => x.status === k).length;
  view.innerHTML = `<h2>${Ic('history')} SMS লগ</h2>
  <div class="chips" style="margin-bottom:10px"><span class="chip">${Ic('circle-check')} গেছে ${bn(n('sent'))}</span><span class="chip" style="background:var(--givebg);color:var(--give)">${Ic('circle-alert')} যায়নি ${bn(n('failed'))}</span><span class="chip">${Ic('message-square-text')} অ্যাপে ${bn(n('opened'))}</span></div>
  <div class="list">${l.length ? l.map(r => `<div class="row logrow"><div class="tile ${r.status === 'sent' ? 't-green' : r.status === 'failed' ? 't-red' : r.status === 'nophone' ? 't-gray' : 't-amber'}">${Ic(r.status === 'sent' ? 'circle-check' : r.status === 'failed' ? 'circle-alert' : r.status === 'nophone' ? 'user-x' : 'message-square-text')}</div>
    <div class="main"><div class="t">${esc(r.name)} <span class="small muted">· ${KIND_LBL[r.kind] || ''} · ${SMS_LBL[r.status] || r.status}</span></div><div class="s">${esc(r.text)}</div><div class="s small muted">${new Date(r.at).toLocaleString('bn-BD')}${r.sim ? ' · ' + esc(r.sim) : ''}${r.parts > 1 ? ' · ' + bn(r.parts) + ' ভাগ' : ''}${r.error ? ' · ' + esc(r.error) : ''}</div></div>
    ${r.phone && r.status !== 'sent' ? `<button class="btn" data-resend="${esc(r.id)}" aria-label="আবার পাঠান">${Ic('refresh-cw')}</button>` : ''}</div>`).join('') : '<div class="empty">এখনও কোনো SMS পাঠানো হয়নি।</div>'}</div>
  <p class="small muted">শেষ ৩০০টি SMS এই ফোনেই থাকে। "SMS অ্যাপে" মানে অনুমতি না থাকায় SMS অ্যাপ খোলা হয়েছিল — সেখানে পাঠান চাপা হয়েছে কিনা অ্যাপ জানতে পারে না।</p>`;
}
async function pickSim() {
  try {
    const r = await Native.listSims();
    const sims = r.sims || [];
    if (!sims.length) return U.toast('সিম পাওয়া যায়নি (ফোনের অনুমতি লাগবে)');
    openSheet(`<h2>${Ic('card-sim')} কোন সিম থেকে SMS যাবে?</h2><div class="list">
      <button class="row" data-sim=""><div class="main"><div class="t">ফোনের ডিফল্ট SMS সিম</div></div>${S().smsSim == null || S().smsSim === '' ? Ic('check') : ''}</button>
      ${sims.map(x => `<button class="row" data-sim="${x.subId}" data-lbl="${esc('সিম ' + bn(x.slot + 1) + (x.carrier ? ' · ' + x.carrier : ''))}"><div class="main"><div class="t">সিম ${bn(x.slot + 1)} · ${esc(x.carrier || x.name || '')}</div><div class="s">${esc(x.name || '')}</div></div>${String(S().smsSim) === String(x.subId) ? Ic('check') : ''}</button>`).join('')}</div>`, c => {
      $$('[data-sim]', c).forEach(b => b.onclick = async () => { await setS({smsSim: b.dataset.sim === '' ? null : +b.dataset.sim, smsSimLabel: b.dataset.lbl || ''}); closeSheet(); U.toast('সিম সেট হয়েছে'); render(true); });
    });
  } catch (e) { U.toast('সিমের তালিকা পাওয়া যায়নি: ' + e.message); }
}
async function fillPermRows() {
  const sp = $('#sSmsPerm'), np = $('#sNotif'); if (!sp && !np) return;
  if (sp) {
    const st = U.isNative() ? await Native.smsPermission(false).catch(() => 'denied') : 'web';
    sp.innerHTML = st === 'granted' ? `${Ic('shield-check')} <span class="main">SMS পাঠানোর অনুমতি আছে</span>`
      : st === 'web' ? `${Ic('info')} <span class="main">ওয়েবে অটো SMS হয় না — SMS অ্যাপ খুলবে</span>`
      : `${Ic('circle-alert')} <span class="main">SMS-এর অনুমতি নেই — এখন SMS অ্যাপ খুলবে</span><button class="btn" id="sSmsAsk">অনুমতি দিন</button>`;
    if ($('#sSmsAsk')) $('#sSmsAsk').onclick = async () => {
      const ok = await ensureSmsPerm(true);
      if (!ok && await Native.smsPermission(false).catch(() => 'denied') !== 'granted' && await confirmSheet('অনুমতি বন্ধ আছে', 'ফোনের সেটিংসে গিয়ে <b>অনুমতি → SMS → অনুমতি দিন</b> চাপুন।', 'সেটিংস খুলুন', false)) Native.openAppSettings();
      fillPermRows();
    };
  }
  if (np) {
    const n = await Notify.status();
    np.innerHTML = !n.available ? `${Ic('info')} <span class="main">ওয়েবে নোটিফিকেশন নেই — Android অ্যাপে আছে</span>`
      : n.enabled ? `${Ic('bell')} <span class="main">নোটিফিকেশন চালু আছে</span><button class="btn" id="sNotifOpen">সেটিংস</button>`
      : `${Ic('circle-alert')} <span class="main give">নোটিফিকেশন বন্ধ — SMS, সিঙ্ক ও বাকির রিমাইন্ডার দেখা যাবে না</span><button class="btn primary" id="sNotifOpen">চালু করুন</button>`;
    if ($('#sNotifOpen')) $('#sNotifOpen').onclick = async () => {
      if (!n.enabled && n.perm !== 'denied') { const r = await Notify.request(); if (r.enabled) { U.toast('নোটিফিকেশন চালু হয়েছে'); return fillPermRows(); } }
      await Native.openNotificationSettings(); U.toast('এখানে "নোটিফিকেশন দেখান" চালু করুন', 4000);
    };
  }
}
// returning from the system settings screen: refresh the status rows
document.addEventListener('visibilitychange', () => { if (!document.hidden && route.name === 'settings') fillPermRows(); });
function settings() {
  const p = DB.meta.get('profile') || {}, s = S(), cs = Cloud.status(), nat = U.isNative();
  const hours = Array.from({length: 15}, (_, i) => i + 8);
  view.innerHTML = `
  <button class="row" id="sProfile" style="margin-top:6px">${avatar({name: p.ownerName || p.shopName || '?', photo: p.photo}, false)}<div class="main"><div class="t">${esc(p.shopName || 'দোকানের তথ্য দিন')}</div><div class="s">${esc(p.ownerName || '')} · প্রোফাইল, দোকানের তথ্য ও পেমেন্ট পদ্ধতি</div></div>${Ic('chevron-right')}</button>
  <h2>${Ic('message-square-text')} SMS</h2>
  <div class="card">
    <label class="switch-row"><div class="main">অটো SMS<div class="small muted">প্রতিটি হিসাবের পর (দিলাম, পেলাম, বিক্রয়, ক্রয়, সংশোধন, মুছে ফেলা) কাস্টমার/সাপ্লায়ারের নম্বরে নিজে থেকেই SMS চলে যাবে। সিমের স্বাভাবিক SMS খরচ কাটবে।${nat ? '' : ' <b>শুধু Android অ্যাপে।</b>'}</div></div><input type="checkbox" id="sAuto" ${s.autoSms !== false && nat ? 'checked' : ''} ${nat ? '' : 'disabled'}></label>
    <div class="statusline" id="sSmsPerm">…</div>
    ${nat ? `<button class="row" id="sSim">${Ic('card-sim')}<div class="main"><div class="t">SMS-এর সিম</div><div class="s">${esc(s.smsSimLabel || 'ফোনের ডিফল্ট SMS সিম')}</div></div>${Ic('chevron-right')}</button>` : ''}
    <label class="switch-row"><div class="main">অটো SMS বন্ধ থাকলে জিজ্ঞেস করুন<div class="small muted">লেনদেনের পর SMS অ্যাপ খুলে পাঠানোর প্রস্তাব</div></div><input type="checkbox" id="sSmsP" ${s.smsPrompt !== false ? 'checked' : ''}></label>
    <label class="switch-row"><div class="main">SMS-এ পেমেন্ট নম্বর<div class="small muted">বাকি থাকলে SMS-এর শেষে বিকাশ/নগদ নম্বর যোগ হবে${Pay.methods().length ? '' : ' (প্রোফাইলে পেমেন্ট পদ্ধতি যোগ করুন)'}</div></div><input type="checkbox" id="sSmsPay" ${s.smsPay !== false ? 'checked' : ''}></label>
    <label class="switch-row"><div class="main">বাকিতে বিক্রির পর পেমেন্ট QR দেখান</div><input type="checkbox" id="sQrSale" ${s.qrAfterSale !== false ? 'checked' : ''}></label>
    <button class="btn block" id="sLog">${Ic('history')} SMS লগ (${bn(smsLog().length)})</button>
  </div>
  <h2>${Ic('bell')} নোটিফিকেশন</h2>
  <div class="card">
    <div class="statusline" id="sNotif">…</div>
    <label class="switch-row"><div class="main">প্রতিদিন বাকির রিমাইন্ডার<div class="small muted">মোট কত টাকা পাবেন, কতজনের কাছে — প্রতিদিন নির্দিষ্ট সময়ে</div></div><input type="checkbox" id="sDue" ${s.dueReminder !== false ? 'checked' : ''}></label>
    <label class="field"><span>রিমাইন্ডারের সময়</span><select class="input" id="sDueH">${hours.map(h => `<option value="${h}">${bn(h > 12 ? h - 12 : h)}টা ${h < 12 ? 'সকাল' : h < 16 ? 'দুপুর' : h < 18 ? 'বিকাল' : 'রাত'}</option>`).join('')}</select></label>
    <p class="small muted">Xiaomi/Redmi (HyperOS/MIUI) ফোনে রিমাইন্ডার ঠিক সময়ে পেতে: সেটিংস → অ্যাপ → dFaster Note → ব্যাটারি → "No restrictions" দিন।</p>
  </div>
  <h2>${Ic('lock')} নিরাপত্তা</h2>
  <div class="card"><div class="switch-row"><div class="main">PIN লক<div class="small muted">${s.pinHash ? 'চালু — অ্যাপ খুললে PIN লাগবে' : 'বন্ধ'}</div></div><button class="btn" id="sPin">${s.pinHash ? 'বদলান' : 'চালু করুন'}</button>${s.pinHash ? '<button class="btn danger" id="sPinOff">বন্ধ</button>' : ''}</div></div>
  <h2>${Ic('hard-drive')} ব্যাকআপ</h2>
  <div class="card">
    <div class="btns"><button class="btn primary" id="sExport">${Ic('download')} ব্যাকআপ ফাইল</button><button class="btn" id="sImport">${Ic('upload')} ফেরত আনুন</button></div>
    <p class="small muted">${s.lastBackup ? 'শেষ ব্যাকআপ: ' + U.dateBn(ymd(new Date(s.lastBackup))) : 'এখনও ব্যাকআপ নেওয়া হয়নি'} · ফাইলটি Google Drive, WhatsApp বা অন্য ফোনে রেখে দিন। ফেরত আনলে নতুন তথ্য মিলিয়ে নেওয়া হয় (কিছু মুছে যায় না)।</p>
  </div>
  <h2>${Ic('cloud')} ক্লাউড</h2>
  <div class="card"><p class="small" id="cloudStatus">${esc(cs.text)}</p>
    ${cs.on ? (cs.signedIn ? `<p class="small muted">সব হিসাব আপনার অ্যাকাউন্টে নিরাপদে সিঙ্ক হয়।${Cloud.unsynced() ? ` <b>${bn(Cloud.unsynced())}টি পরিবর্তন এখনও আপলোড হয়নি।</b>` : ''}</p>
      <div class="btns"><button class="btn primary" id="sSync">${Ic('refresh-cw')} এখন সিঙ্ক</button><button class="btn" id="sAcc">${Ic('user-round')} অ্যাকাউন্ট</button></div>`
      : `<button class="btn primary block" id="sLogin">${Ic('key-round')} লগইন / রেজিস্ট্রেশন</button><p class="small muted">লগইন করলে এই ফোনের সব হিসাব আপনার অ্যাকাউন্টে উঠে যাবে।</p>`) : ''}
  </div>
  <h2>অন্যান্য</h2>
  <div class="card">
    <label class="field"><span>শুরুর ক্যাশ (ক্যাশবক্সে আগে থেকে যত টাকা ছিল)</span><input class="input" id="sOpen" inputmode="decimal" value="${s.openingCash || ''}" placeholder="০"></label>
    <label class="field"><span>থিম</span><select class="input" id="sTheme"><option value="auto">ফোনের মতো</option><option value="light">লাইট</option><option value="dark">ডার্ক</option></select></label>
    <button class="btn block" id="sProd">${Ic('tag')} পণ্যের তালিকা</button>
  </div>
  <p class="small muted" style="text-align:center">dFaster Note v${bn(VERSION)} · কোনো বিজ্ঞাপন বা ট্র্যাকিং নেই · আইকন: Lucide (ISC)</p>`;
  $('#sTheme').value = s.theme || 'auto';
  $('#sDueH').value = String(s.dueHour || 20);
  $('#sProfile').onclick = () => go('#/profile');
  $('#sSmsP').onchange = e => setS({smsPrompt: e.target.checked});
  $('#sSmsPay').onchange = e => setS({smsPay: e.target.checked});
  $('#sQrSale').onchange = e => setS({qrAfterSale: e.target.checked});
  $('#sLog').onclick = () => go('#/smslog');
  if ($('#sSim')) $('#sSim').onclick = pickSim;
  $('#sAuto').onchange = async e => {
    const el = e.target;
    if (el.checked && !await ensureSmsPerm(true)) U.toast('অনুমতি ছাড়া অটো SMS যাবে না — SMS অ্যাপ খুলবে');
    await setS({autoSms: el.checked}); U.toast(el.checked ? 'অটো SMS চালু' : 'অটো SMS বন্ধ'); fillPermRows();
  };
  $('#sDue').onchange = async e => { await setS({dueReminder: e.target.checked}); Notify.scheduleDue(true); };
  $('#sDueH').onchange = async e => { await setS({dueHour: +e.target.value}); Notify.scheduleDue(true); };
  $('#sPin').onclick = () => setPin();
  if ($('#sPinOff')) $('#sPinOff').onclick = async () => { if (await confirmSheet('PIN লক বন্ধ করবেন?', 'অ্যাপ খুলতে আর PIN লাগবে না।', 'বন্ধ করুন')) { await setS({pinHash: null, pinSalt: null}); render(); } };
  $('#sExport').onclick = exportBackup;
  $('#sImport').onclick = () => importBackup(() => render());
  $('#sOpen').onchange = e => setS({openingCash: U.num(e.target.value)});
  $('#sTheme').onchange = async e => { await setS({theme: e.target.value}); applyTheme(); };
  $('#sProd').onclick = () => go('#/products');
  if ($('#sLogin')) $('#sLogin').onclick = () => authScreen();
  if ($('#sAcc')) $('#sAcc').onclick = () => go('#/profile');
  if ($('#sSync')) $('#sSync').onclick = async () => { try { const r = await Cloud.sync(); U.toast(`সিঙ্ক হয়েছে (${bn(r.pushed || 0)}↑ ${bn(r.pulled || 0)}↓)`); render(true); } catch (e) { U.toast('সিঙ্ক হয়নি: ' + e.message); } };
  fillPermRows();
}

/* ================= PROFILE ================= */
const SHOP_TYPES = ['মুদি দোকান', 'ফার্মেসি', 'কাপড়ের দোকান', 'ইলেকট্রনিক্স / মোবাইল', 'হার্ডওয়্যার', 'রেস্টুরেন্ট / হোটেল', 'কসমেটিকস', 'লাইব্রেরি / স্টেশনারি', 'পাইকারি', 'অন্যান্য'];
const fmtTime = ms => ms ? new Date(+ms).toLocaleDateString('bn-BD', {day: 'numeric', month: 'long', year: 'numeric'}) : '—';
function mfsLogo(m) {
  if (m.kind === 'mfs') { const pv = Pay.PROVIDERS[m.provider] || {en: '?', color: '#555'}; return `<div class="logo-mfs" style="background:${pv.color}">${esc(pv.en)}</div>`; }
  return `<div class="tile ${m.kind === 'bank' ? 't-blue' : 't-green'}">${Ic(m.kind === 'bank' ? 'landmark' : m.kind === 'qr' ? 'qr-code' : 'image')}</div>`;
}
async function setPhoto(photo) { const p = DB.meta.get('profile') || {}; await DB.meta.set('profile', {...p, photo}); applyProfile(); Cloud.schedule(); }
async function saveProfile(patch) { await DB.meta.set('profile', {...(DB.meta.get('profile') || {}), ...patch}); applyProfile(); Cloud.schedule(); }
function profile() {
  const p = DB.meta.get('profile') || {}, u = Cloud.user(), cs = Cloud.status(), ms = Pay.methods(), defId = Pay.pay().defaultId;
  const prov = (u && u.providers) || [], hasPw = prov.includes('password'), hasG = prov.includes('google.com');
  const loginPh = u && (u.phone || (u.email && /@phone\.dfaster\.com$/.test(u.email) ? '+' + u.email.split('@')[0] : ''));
  view.innerHTML = `
  <div class="profhead">
    <label class="pphoto" id="prPhoto">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : initials(p.ownerName || p.shopName || '?')}<span class="cam">${Ic('camera')}</span><input type="file" accept="image/*" id="prFile" hidden></label>
    <h2 style="margin:4px 0 0">${esc(p.ownerName || 'আপনার নাম')}</h2><div class="small muted">${esc(p.shopName || '')}${p.shopType ? ' · ' + esc(p.shopType) : ''}</div>
    ${p.photo ? `<button class="btn" id="prPhotoRm" style="padding:4px 12px">${Ic('x')} ছবি সরান</button>` : ''}
  </div>
  ${(() => { const c = profileCompletion(p); return `<div class="card" id="prDone"><div style="display:flex;justify-content:space-between;align-items:center"><b>প্রোফাইল ${bn(c.pct)}% সম্পূর্ণ</b>${c.pct < 100 ? `<button class="btn primary" id="prWiz">${Ic('chevron-right')} সেটআপ শেষ করুন</button>` : `<span class="chip">${Ic('circle-check')} সম্পূর্ণ</span>`}</div><div class="pbar"><i style="width:${c.pct}%"></i></div>${c.missing.length ? `<p class="small muted" style="margin:6px 0 0">বাকি: ${c.missing.join(', ')}</p>` : ''}</div>`; })()}
  <h2>${Ic('user-round')} ব্যক্তিগত ও দোকানের তথ্য</h2>
  <div class="card">
    <label class="field"><span>আপনার নাম</span><input class="input" id="prName" value="${esc(p.ownerName || '')}" autocomplete="name"></label>
    <label class="field"><span>মোবাইল নম্বর${p.verified ? ' (যাচাই করা)' : ''}</span><input class="input" id="prPhone" type="tel" inputmode="tel" value="${esc(p.phone || '')}" ${p.verified ? 'disabled' : ''}></label>
    <label class="field"><span>ইমেইল (ঐচ্ছিক)</span><input class="input" id="prEmail" type="email" value="${esc(p.email || (u && u.email && !/@phone\.dfaster\.com$/.test(u.email) ? u.email : '') || '')}" autocomplete="email"></label>
    <label class="field"><span>দোকানের নাম</span><input class="input" id="prShop" value="${esc(p.shopName || '')}"></label>
    <label class="field"><span>দোকানের ধরন</span><input class="input" id="prType" list="shopTypes" value="${esc(p.shopType || '')}" placeholder="যেমন: মুদি দোকান"><datalist id="shopTypes">${SHOP_TYPES.map(t => `<option value="${t}">`).join('')}</datalist></label>
    <label class="field"><span>দোকানের ঠিকানা</span><input class="input" id="prAddr" value="${esc(p.address || '')}"></label>
    <button class="btn primary block" id="prSave">${Ic('check')} সংরক্ষণ</button>
    <p class="small muted">নাম, দোকানের নাম ও নম্বর SMS আর PDF রিপোর্টে ব্যবহার হয়।${u ? ' আপনার অ্যাকাউন্টে সিঙ্ক হয়।' : ''}</p>
  </div>
  <h2>${Ic('wallet')} পেমেন্ট পদ্ধতি</h2>
  <div class="card">
    <div id="pmList">${ms.length ? ms.map(m => `<div class="pm" data-pm="${esc(m.id)}">${mfsLogo(m)}<div class="main"><div class="t">${esc(Pay.title(m))}${m.id === defId ? ' <span class="chip">ডিফল্ট</span>' : ''}</div><div class="s">${esc(Pay.detail(m))}</div></div>
      <button data-pmdef class="${m.id === defId ? 'on' : ''}" aria-label="ডিফল্ট করুন">${Ic('star')}</button><button data-pmedit aria-label="এডিট">${Ic('pencil')}</button><button data-pmdel aria-label="মুছুন">${Ic('trash-2')}</button></div>`).join('')
      : '<p class="small muted">কাস্টমার যেন সহজে বাকি পরিশোধ করতে পারে — আপনার বিকাশ/নগদ/রকেট/উপায় নম্বর, ব্যাংক হিসাব বা দোকানের Bangla QR যোগ করুন।</p>'}</div>
    <div class="btns" style="margin-top:8px"><button class="btn" id="pmMfs">${Ic('smartphone')} MFS নম্বর</button><button class="btn" id="pmBank">${Ic('landmark')} ব্যাংক</button></div>
    <button class="btn block" id="pmQr" style="margin-top:8px">${Ic('scan-line')} Bangla QR স্ক্যান / আপলোড</button>
    ${ms.length ? `<button class="btn primary block" id="pmPreview" style="margin-top:8px">${Ic('qr-code')} QR দেখুন</button>` : ''}
    <p class="small muted">বাকি আদায়ের সময় (খাতায় "পেমেন্ট QR", বাকিতে বিক্রির পর, তাগাদায়) ডিফল্ট পদ্ধতির QR বাকির টাকাসহ নিজে থেকে দেখাবে। টাকা এলে অ্যাপ নিজে জানতে পারে না — পেলাম চাপুন। ব্যাংক হিসাব নম্বর শুধু আপনার নিজের অ্যাকাউন্টে থাকে, SMS-এ যায় না (আপনি চালু না করলে)।</p>
  </div>
  <h2>${Ic('shield-check')} অ্যাকাউন্ট</h2>
  <div class="card">${!cs.on ? '<p class="small muted">এই সংস্করণে ক্লাউড অ্যাকাউন্ট নেই — হিসাব শুধু এই ফোনে।</p>' : !u ? `<p class="small muted">লগইন করা নেই — হিসাব শুধু এই ফোনে।</p><button class="btn primary block" id="acLogin">${Ic('key-round')} লগইন / রেজিস্ট্রেশন</button>` : `
    <div class="kv"><span>লগইনের পদ্ধতি</span><span class="chips">${hasPw ? `<span class="chip">${Ic('phone')} মোবাইল + পাসওয়ার্ড</span>` : ''}${hasG ? `<span class="chip">${Ic('mail')} Google</span>` : ''}${!hasPw && !hasG ? `<span class="chip">${Ic('phone')} ফোন OTP</span>` : ''}</span></div>
    ${loginPh ? `<div class="kv"><span>মোবাইল</span><span>${bn(U.normPhone(loginPh))}</span></div>` : ''}
    ${u.email && !/@phone\.dfaster\.com$/.test(u.email) ? `<div class="kv"><span>ইমেইল</span><span>${esc(u.email)}</span></div>` : ''}
    <div class="kv"><span>অ্যাকাউন্ট খোলা</span><span id="acCreated">${fmtTime(u.created)}</span></div>
    <div class="kv"><span>শেষ লগইন</span><span>${fmtTime(u.lastLogin)}</span></div>
    <div class="btns" style="margin-top:10px">${hasPw ? `<button class="btn" id="acPw">${Ic('key-round')} পাসওয়ার্ড বদলান</button>` : ''}${!hasG ? `<button class="btn" id="acLinkG">${Ic('link')} Google যুক্ত করুন</button>` : ''}${!hasPw ? `<button class="btn" id="acLinkP">${Ic('link')} মোবাইল + পাসওয়ার্ড যুক্ত করুন</button>` : ''}</div>
    <div class="btns" style="margin-top:8px"><button class="btn" id="acOut">${Ic('log-out')} লগআউট</button><button class="btn danger" id="acDel">${Ic('trash-2')} অ্যাকাউন্ট মুছুন</button></div>`}
  </div>`;
  if ($('#prWiz')) $('#prWiz').onclick = () => { const k = profileCompletion(p).missingKeys; setupWizard({msg: 'প্রোফাইল আপডেট হয়েছে', start: k.some(x => ['photo', 'ownerName', 'phone'].includes(x)) ? 0 : k.some(x => ['shopName', 'shopType', 'address'].includes(x)) ? 1 : 2}); };
  // photo
  $('#prFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { await setPhoto(await resizeImage(f, 256)); U.toast('ছবি সেভ হয়েছে'); render(true); } catch (err) { U.toast('ছবি নেওয়া যায়নি'); } };
  if ($('#prPhotoRm')) $('#prPhotoRm').onclick = async () => { await setPhoto(''); render(true); };
  $('#prSave').onclick = async () => {
    const ph = $('#prPhone').value.trim(), em = $('#prEmail').value.trim();
    if (ph && !U.validBdPhone(ph)) return U.toast('সঠিক মোবাইল নম্বর লিখুন');
    if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return U.toast('সঠিক ইমেইল লিখুন');
    if (!$('#prShop').value.trim()) return U.toast('দোকানের নাম লিখুন');
    await saveProfile({ownerName: $('#prName').value.trim(), phone: p.verified ? p.phone : ph ? U.normPhone(ph) : '', email: em, shopName: $('#prShop').value.trim(), shopType: $('#prType').value.trim(), address: $('#prAddr').value.trim()});
    U.toast('সংরক্ষণ হয়েছে'); render(true);
  };
  // payment methods
  const list = () => Pay.pay().methods || [];
  $$('[data-pm]').forEach(row => {
    const id = row.dataset.pm, m = list().find(x => x.id === id);
    $('[data-pmdef]', row).onclick = async () => { await Pay.save(list(), id); Cloud.schedule(); U.toast('ডিফল্ট করা হয়েছে'); render(true); };
    $('[data-pmedit]', row).onclick = () => m.kind === 'mfs' ? mfsForm(m) : m.kind === 'bank' ? bankForm(m) : qrForm(m);
    $('[data-pmdel]', row).onclick = async () => { if (await confirmSheet('মুছবেন?', esc(Pay.title(m)) + ' — ' + esc(Pay.detail(m)), 'মুছুন')) { await Pay.save(list().filter(x => x.id !== id), Pay.pay().defaultId); Cloud.schedule(); render(true); } };
  });
  $('#pmMfs').onclick = () => mfsForm();
  $('#pmBank').onclick = () => bankForm();
  $('#pmQr').onclick = () => qrForm();
  if ($('#pmPreview')) $('#pmPreview').onclick = () => payQrSheet(null, 0);
  // account
  if ($('#acLogin')) $('#acLogin').onclick = () => authScreen();
  if (!u) return;
  Cloud.refreshUser().then(n => { if (n && n.created && $('#acCreated')) $('#acCreated').textContent = fmtTime(n.created); });
  if ($('#acPw')) $('#acPw').onclick = () => changePwSheet(loginPh);
  if ($('#acLinkG')) $('#acLinkG').onclick = async () => { try { await Cloud.linkGoogle(); U.toast('Google যুক্ত হয়েছে — এখন Google দিয়েও লগইন করা যাবে'); render(true); } catch (e) { U.toast('যুক্ত হয়নি: ' + e.message, 5000); } };
  if ($('#acLinkP')) $('#acLinkP').onclick = () => linkPhoneSheet();
  $('#acOut').onclick = async () => {
    if (!await confirmSheet('লগআউট করবেন?', 'আগে সব হিসাব ক্লাউডে সিঙ্ক হবে, তারপর এই ফোন থেকে মুছে যাবে। আবার লগইন করলে সব ফিরে আসবে।' + (navigator.onLine === false ? ' <b>এখন ইন্টারনেট নেই — যেগুলো আপলোড হয়নি সেগুলো হারাবে।</b>' : ''), 'লগআউট')) return;
    try { await Cloud.sync(); } catch (e) { if (!await confirmSheet('সিঙ্ক হয়নি', esc(e.message) + ' — তবুও লগআউট করলে আপলোড না হওয়া হিসাব হারাবে।', 'তবুও লগআউট')) return; }
    await Cloud.signOut(); location.hash = '#/'; location.reload();
  };
  $('#acDel').onclick = () => deleteAccountFlow(hasPw ? loginPh : null);
}
function changePwSheet(phone) {
  openSheet(`<h2>${Ic('key-round')} পাসওয়ার্ড বদলান</h2>
    ${pwField('cpOld', 'এখনকার পাসওয়ার্ড')}${pwField('cpNew', 'নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)', 'new-password')}${pwField('cpNew2', 'আবার নতুন পাসওয়ার্ড', 'new-password')}
    <button class="btn primary block" id="cpGo">বদলান</button>
    <p class="small" style="text-align:center"><a href="#" id="cpForgot">পুরোনো পাসওয়ার্ড মনে নেই?</a></p>`, c => {
    wireEyes(c);
    $('#cpGo', c).onclick = async e => {
      const o = $('#cpOld', c).value, n = $('#cpNew', c).value;
      if (n.length < 6) return U.toast('নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন');
      if (n !== $('#cpNew2', c).value) return U.toast('দুইবার একই পাসওয়ার্ড দিন');
      e.currentTarget.disabled = true;
      try { await Cloud.changePassword(phone, o, n); closeSheet(); U.toast('পাসওয়ার্ড বদলানো হয়েছে'); }
      catch (err) { e.currentTarget.disabled = false; U.toast(err.message, 4500); }
    };
    $('#cpForgot', c).onclick = ev => { ev.preventDefault(); closeSheet(); forgotPassword(phone); };
  });
}
function linkPhoneSheet() {
  openSheet(`<h2>${Ic('link')} মোবাইল + পাসওয়ার্ড যুক্ত করুন</h2><p class="small muted">একই অ্যাকাউন্টে (একই হিসাব) মোবাইল নম্বর ও পাসওয়ার্ড দিয়েও লগইন করা যাবে। নম্বর যাচাইয়ে SMS কোড যাবে।</p>
    <label class="field"><span>মোবাইল নম্বর</span><input class="input" id="lpPh" type="tel" inputmode="tel" value="${esc((DB.meta.get('profile') || {}).phone || '')}"></label>
    ${pwField('lpPw', 'পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)', 'new-password')}
    <button class="btn primary block" id="lpGo">কোড পাঠান</button>`, c => {
    wireEyes(c);
    $('#lpGo', c).onclick = () => {
      const ph = $('#lpPh', c).value.trim(), pw = $('#lpPw', c).value;
      if (!U.validBdPhone(ph)) return U.toast('সঠিক মোবাইল নম্বর লিখুন');
      if (pw.length < 6) return U.toast('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন');
      linkOtpFlow(ph, pw);
    };
  });
}
function linkOtpFlow(phone, pw) {
  let vid = null;
  const finish = async () => { await Cloud.linkPhoneFinish(phone, pw); await saveProfile({phone: U.normPhone(phone), verified: true}); closeSheet(); U.toast('মোবাইল + পাসওয়ার্ড যুক্ত হয়েছে'); render(true); };
  openSheet(`<h2>নম্বর যাচাই</h2><p class="small muted" id="loMsg">কোড পাঠানো হচ্ছে…</p>
    <label class="field"><span>SMS-এ আসা ৬ অঙ্কের কোড</span><input class="input amount" id="loC" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>
    <button class="btn primary block" id="loOk" disabled>যাচাই করুন</button>`, async c => {
    try {
      const r = await Cloud.linkPhoneStart(phone);
      if (r.user) return finish();
      vid = r.verificationId; $('#loOk', c).disabled = false; $('#loMsg', c).textContent = `${bn(U.normPhone(phone))} নম্বরে কোড পাঠানো হয়েছে।`;
    } catch (e) { $('#loMsg', c).textContent = 'কোড পাঠানো যায়নি: ' + e.message; }
    $('#loOk', c).onclick = async e => {
      const code = U.toAscii($('#loC', c).value); if (!/^\d{6}$/.test(code)) return U.toast('৬ অঙ্কের কোড লিখুন');
      e.currentTarget.disabled = true;
      try { await Cloud.confirmOtp(vid, code); await finish(); } catch (err) { e.currentTarget.disabled = false; U.toast(err.message, 4500); }
    };
  });
}
async function deleteAccountFlow(phone) {
  if (!await confirmSheet('অ্যাকাউন্ট মুছে ফেলবেন?', 'আপনার অ্যাকাউন্ট এবং ক্লাউডে থাকা <b>সব হিসাব (কাস্টমার, খাতা, বেচাকেনা, ক্যাশ, পণ্য, প্রোফাইল)</b> চিরতরে মুছে যাবে, এই ফোন থেকেও। এটা আর ফেরত আনা যাবে না।<br><br>দরকার হলে আগে সেটিংস থেকে ব্যাকআপ ফাইল নিন।', 'হ্যাঁ, মুছতে চাই')) return;
  openSheet(`<h2 class="give">${Ic('trash-2')} শেষবার নিশ্চিত করুন</h2><p class="small muted">নিরাপত্তার জন্য আবার লগইন যাচাই করতে হবে। নিচে <b>মুছুন</b> লিখুন।</p>
    <label class="field"><span>নিশ্চিত করতে "মুছুন" লিখুন</span><input class="input" id="dcTxt" autocomplete="off"></label>
    ${phone ? pwField('dcPw', 'আপনার পাসওয়ার্ড') : '<p class="small muted">Google অ্যাকাউন্ট দিয়ে আবার যাচাই করা হবে।</p>'}
    <div class="btns"><button class="btn" data-close>বাতিল</button><button class="btn danger" id="dcGo">চিরতরে মুছুন</button></div>`, c => {
    wireEyes(c);
    $('#dcGo', c).onclick = async e => {
      if ($('#dcTxt', c).value.trim() !== 'মুছুন') return U.toast('"মুছুন" লিখুন');
      const b = e.currentTarget; b.disabled = true; b.textContent = 'মুছে ফেলা হচ্ছে…';
      try {
        await Cloud.reauth(phone ? {phone, password: $('#dcPw', c).value} : {});
        await Cloud.deleteAccount();
        closeSheet(); U.toast('অ্যাকাউন্ট মুছে ফেলা হয়েছে', 3000);
        setTimeout(() => { location.hash = '#/'; location.reload(); }, 1200);
      } catch (err) { b.disabled = false; b.textContent = 'চিরতরে মুছুন'; U.toast('মোছা যায়নি: ' + err.message, 5000); }
    };
  });
}
const pmId = () => 'pm' + U.uid();
async function upsertMethod(m) {
  const l = Pay.pay().methods || [], i = l.findIndex(x => x.id === m.id);
  const next = i >= 0 ? l.map(x => x.id === m.id ? m : x) : [...l, m];
  await Pay.save(next, Pay.pay().defaultId || m.id); Cloud.schedule(); closeSheet(); U.toast('সংরক্ষণ হয়েছে');
  if (wizRefresh && !$('#onboard').classList.contains('hidden')) wizRefresh(); else render(true);
}
function mfsForm(old) {
  const m = old || {provider: 'bkash', type: 'personal', number: ''};
  openSheet(`<h2>${Ic('smartphone')} মোবাইল ব্যাংকিং (MFS)</h2>
    <div class="seg" id="mfP">${Object.entries(Pay.PROVIDERS).map(([k, v]) => `<button data-v="${k}" class="${m.provider === k ? 'on' : ''}">${v.name}</button>`).join('')}</div>
    <div class="seg" id="mfT" style="margin-top:8px">${Object.entries(Pay.TYPES).map(([k, v]) => `<button data-v="${k}" class="${m.type === k ? 'on' : ''}">${v}</button>`).join('')}</div>
    <label class="field" style="margin-top:10px"><span>অ্যাকাউন্ট নম্বর</span><input class="input" id="mfN" type="tel" inputmode="tel" value="${esc(m.number || '')}" placeholder="01XXXXXXXXX"></label>
    <p class="small muted">মার্চেন্ট অ্যাকাউন্ট হলে কাস্টমার "পেমেন্ট" অপশনে, পার্সোনাল হলে "সেন্ড মানি", এজেন্ট হলে "ক্যাশ আউট" দিয়ে পাঠাবে।</p>
    <button class="btn primary block" id="mfS">সংরক্ষণ</button>`, c => {
    const seg = id => $$(`#${id} button`, c).forEach(b => b.onclick = () => { $$(`#${id} button`, c).forEach(x => x.classList.toggle('on', x === b)); });
    seg('mfP'); seg('mfT');
    $('#mfS', c).onclick = () => {
      const n = $('#mfN', c).value.trim(); if (!U.validBdPhone(n)) return U.toast('সঠিক ১১ অঙ্কের নম্বর লিখুন');
      upsertMethod({...m, id: m.id || pmId(), kind: 'mfs', provider: $('#mfP .on', c).dataset.v, type: $('#mfT .on', c).dataset.v, number: U.normPhone(n)});
    };
  });
}
function bankForm(old) {
  const m = old || {};
  openSheet(`<h2>${Ic('landmark')} ব্যাংক হিসাব</h2>
    <label class="field"><span>ব্যাংকের নাম</span><input class="input" id="bkB" value="${esc(m.bank || '')}" placeholder="যেমন: ডাচ-বাংলা ব্যাংক"></label>
    <label class="field"><span>হিসাবের নাম</span><input class="input" id="bkA" value="${esc(m.accName || '')}"></label>
    <label class="field"><span>হিসাব নম্বর</span><input class="input" id="bkN" inputmode="numeric" value="${esc(m.accNo || '')}"></label>
    <label class="field"><span>শাখা</span><input class="input" id="bkBr" value="${esc(m.branch || '')}"></label>
    <label class="field"><span>রাউটিং নম্বর (ঐচ্ছিক)</span><input class="input" id="bkR" inputmode="numeric" value="${esc(m.routing || '')}"></label>
    <label class="check"><input type="checkbox" id="bkSms" ${m.inSms ? 'checked' : ''}><span>কাস্টমারের SMS-এ এই হিসাব নম্বর দিন</span></label>
    <p class="small muted">${Ic('lock')} হিসাব নম্বর শুধু এই ফোনে ও আপনার নিজের অ্যাকাউন্টে থাকে। তালিকায় আংশিক লুকানো দেখায়। টিক না দিলে SMS-এ যায় না।</p>
    <button class="btn primary block" id="bkS">সংরক্ষণ</button>`, c => {
    $('#bkS', c).onclick = () => {
      const v = id => $(id, c).value.trim();
      if (!v('#bkB') || !v('#bkN')) return U.toast('ব্যাংকের নাম ও হিসাব নম্বর লিখুন');
      upsertMethod({...m, id: m.id || pmId(), kind: 'bank', bank: v('#bkB'), accName: v('#bkA'), accNo: U.toAscii(v('#bkN')).replace(/\s+/g, ''), branch: v('#bkBr'), routing: U.toAscii(v('#bkR')), inSms: $('#bkSms', c).checked});
    };
  });
}
function qrForm(old) {
  let m = old ? {...old} : null;
  const show = c => {
    const box = $('#qfRes', c);
    if (!m) { box.innerHTML = ''; $('#qfS', c).disabled = true; return; }
    $('#qfS', c).disabled = false;
    box.innerHTML = m.kind === 'qr' ? `<div class="note">${Ic('circle-check')} অফিশিয়াল Bangla QR পাওয়া গেছে${m.merchant ? ': <b>' + esc(m.merchant) + '</b>' : ''}${m.city ? ', ' + esc(m.city) : ''}। বাকির টাকা QR-এ বসিয়ে দেওয়া যাবে।</div>`
      : `<div class="note warn">${Ic('circle-alert')} ছবি থেকে Bangla QR পড়া যায়নি — ছবিটাই সেভ হবে, কাস্টমারকে টাকার অঙ্ক নিজে লিখতে হবে।</div><img src="${esc(m.img)}" alt="" style="max-width:160px;border-radius:12px;display:block;margin:6px auto">`;
  };
  openSheet(`<h2>${Ic('scan-line')} Bangla QR</h2>
    <p class="small muted">ব্যাংক বা বিকাশ/নগদ মার্চেন্ট থেকে পাওয়া দোকানের অফিশিয়াল Bangla QR-এর ছবি তুলুন বা গ্যালারি থেকে দিন।</p>
    <div class="btns"><label class="btn primary">${Ic('camera')} ছবি তুলুন<input type="file" accept="image/*" capture="environment" id="qfCam" hidden></label><label class="btn">${Ic('image')} গ্যালারি<input type="file" accept="image/*" id="qfGal" hidden></label></div>
    <div id="qfRes" style="margin-top:10px"></div>
    <label class="field"><span>নাম (ঐচ্ছিক)</span><input class="input" id="qfL" value="${esc((m && m.label) || '')}" placeholder="যেমন: দোকানের Bangla QR"></label>
    <button class="btn primary block" id="qfS" disabled>সংরক্ষণ</button>`, c => {
    show(c);
    const onFile = async e => {
      const f = e.target.files[0]; if (!f) return;
      $('#qfRes', c).innerHTML = '<p class="small muted">QR পড়া হচ্ছে…</p>';
      try {
        const src = await Pay.fileToDataUrl(f);
        const txt = await Pay.decodeImage(src), emv = txt && Pay.parseEmv(txt);
        m = emv ? {...(m || {}), kind: 'qr', payload: txt, merchant: emv.merchant, city: emv.city, img: undefined}
          : {...(m || {}), kind: 'qrimg', img: await Pay.shrinkImage(src, 600), payload: undefined};
        if (txt && !emv) U.toast('QR পড়া গেছে, কিন্তু এটি Bangla QR (EMVCo) নয়', 4000);
      } catch (err) { m = null; U.toast('ছবি খোলা যায়নি'); }
      show(c);
    };
    $('#qfCam', c).onchange = onFile; $('#qfGal', c).onchange = onFile;
    $('#qfS', c).onclick = () => { if (m) upsertMethod({...m, id: m.id || pmId(), label: $('#qfL', c).value.trim()}); };
  });
}
// full-screen payment QR with the due amount; switch methods; share via WhatsApp / SMS
function payQrSheet(p, amount) {
  const ms = Pay.methods();
  if (!ms.length) {
    return openSheet(`<h2>${Ic('qr-code')} পেমেন্ট QR</h2><p class="muted">এখনও কোনো পেমেন্ট পদ্ধতি যোগ করা হয়নি। প্রোফাইলে বিকাশ/নগদ নম্বর, ব্যাংক হিসাব বা দোকানের Bangla QR যোগ করুন।</p><button class="btn primary block" id="pqAdd">${Ic('plus')} পেমেন্ট পদ্ধতি যোগ করুন</button>`, c => { $('#pqAdd', c).onclick = () => { closeSheet(); go('#/profile'); }; });
  }
  let cur = ms[0], amt = Math.max(0, Math.round((+amount || 0) * 100) / 100), img = null, out = null;
  openSheet(`<div style="display:flex;align-items:center;gap:8px"><h2 style="flex:1;margin:4px 0">${Ic('qr-code')} পেমেন্ট QR${p ? ' · ' + esc(p.name) : ''}</h2><button class="icon-btn" data-close style="background:var(--soft);color:var(--text)" aria-label="বন্ধ">${Ic('x')}</button></div>
    <div class="mtabs" id="pqTabs">${ms.map((m, i) => `<button data-i="${i}" class="${i ? '' : 'on'}">${esc(Pay.title(m))}</button>`).join('')}</div>
    <label class="field"><span>টাকার অঙ্ক${p ? ' (বাকি ' + money(Math.max(0, Book.balance(p.id))) + ')' : ''}</span><input class="input amount" id="pqAmt" inputmode="decimal" value="${amt || ''}" placeholder="০"></label>
    <div class="qrwrap"><img id="pqImg" alt="পেমেন্ট QR"><p class="small muted" id="pqNote" style="text-align:center"></p></div>
    <div class="btns"><button class="btn primary" id="pqWa">${Ic('message-circle')} WhatsApp / শেয়ার</button>${p && p.phone ? `<button class="btn" id="pqSms">${Ic('send')} SMS</button>` : ''}</div>
    <p class="small muted" style="text-align:center">টাকা পেলে অ্যাপ নিজে জানতে পারে না — পাওয়ার পর খাতায় <b>পেলাম</b> চাপুন।</p>`, c => {
    $('#sheet').classList.add('full');
    const draw = async () => {
      try {
        out = await Pay.card(cur, amt, {partyName: p && p.name});
        img = out.canvas.toDataURL('image/png'); $('#pqImg', c).src = img;
        $('#pqNote', c).innerHTML = out.payable ? `${Ic('circle-check')} অফিশিয়াল Bangla QR — যেকোনো ব্যাংক/MFS অ্যাপে স্ক্যান করলে ${amt ? money(amt) + ' বসানো থাকবে' : 'টাকা লিখে দিতে হবে'}।`
          : cur.kind === 'qrimg' ? 'সেভ করা QR ছবি — কাস্টমারকে টাকার অঙ্ক নিজে লিখতে হবে।' : `${Ic('info')} এটি তথ্য কার্ড, পেমেন্ট QR নয় — কাস্টমার নম্বর দেখে ${cur.kind === 'bank' ? 'ব্যাংকে' : 'অ্যাপে'} টাকা পাঠাবে।`;
      } catch (e) { $('#pqNote', c).textContent = 'QR তৈরি হয়নি: ' + e.message; }
    };
    const text = () => `${(DB.meta.get('profile') || {}).shopName || 'দোকান'}${p ? ' — ' + p.name + ',' : ''} ${amt ? money(amt) + ' পরিশোধ করুন।' : 'পেমেন্টের তথ্য:'} ${Pay.title(cur)}: ${cur.kind === 'mfs' ? bn(cur.number) : cur.kind === 'bank' ? Pay.detail(cur, true) : 'QR স্ক্যান করুন'}`;
    $$('#pqTabs button', c).forEach(b => b.onclick = () => { $$('#pqTabs button', c).forEach(x => x.classList.toggle('on', x === b)); cur = ms[+b.dataset.i]; draw(); });
    $('#pqAmt', c).onchange = e => { amt = Math.max(0, U.num(e.target.value)); draw(); };
    $('#pqWa', c).onclick = async () => {
      if (!img) return;
      try { await Native.shareFile(`payment-qr-${ymd()}.png`, 'image/png', img.split(',')[1], 'পেমেন্ট QR', text()); }
      catch (e) { if (p && p.phone) Native.whatsapp(p.phone, text()); else U.toast(e.message); }
    };
    if ($('#pqSms', c)) $('#pqSms', c).onclick = () => { const t = text(); closeSheet(); smsSheet(p, t, 'পেমেন্টের তথ্য SMS', null, 'manual'); };
    draw();
  }, () => $('#sheet').classList.remove('full'));
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
    if (await U.sha256(s.pinSalt + pin) === s.pinHash) { $('#lock').classList.add('hidden'); setTimeout(() => askNotifications(), 700); return true; }
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
  setTimeout(() => askNotifications(), 1200);
};
// web demo / local-only: the setup wizard, saved on this device
function localSetup() { setupWizard({local: true}); }
/* ---- first-login profile setup wizard: photo+name → shop → payment → done (any step can be skipped for later) ---- */
const PROFILE_ITEMS = [['photo', 'ছবি'], ['ownerName', 'আপনার নাম'], ['phone', 'মোবাইল'], ['shopName', 'দোকানের নাম'], ['shopType', 'দোকানের ধরন'], ['address', 'ঠিকানা'], ['pay', 'পেমেন্ট পদ্ধতি']];
function profileCompletion(p = DB.meta.get('profile') || {}) {
  const has = k => k === 'pay' ? !!(p.pay && p.pay.methods && p.pay.methods.length) : !!(p[k] && String(p[k]).trim());
  const missing = PROFILE_ITEMS.filter(([k]) => !has(k));
  return {pct: Math.round((PROFILE_ITEMS.length - missing.length) / PROFILE_ITEMS.length * 100), missing: missing.map(x => x[1]), missingKeys: missing.map(x => x[0])};
}
const needsSetup = p => !p || !p.shopName || (!p.setupDone && !p.setupSkippedAt && profileCompletion(p).pct < 100);
let wizRefresh = null;
function setupWizard({start = 0, msg = 'স্বাগতম!', local = false} = {}) {
  const el = $('#onboard'), u = Cloud.user() || {};
  let step = start, draft = {...(DB.meta.get('profile') || {})};
  if (!draft.ownerName && u.name) draft.ownerName = u.name;
  if (!draft.phone && u.phone) draft.phone = U.normPhone(u.phone);
  if (!draft.email && u.email && !/@phone\.dfaster\.com$/.test(u.email)) draft.email = u.email;
  if (!draft.photo && u.photo) draft.photo = '';   // Google photo URL is not stored (offline app); owner picks a photo
  const STEPS = ['আপনার পরিচয়', 'দোকানের তথ্য', 'পেমেন্ট পদ্ধতি', 'সব তৈরি'];
  const persist = async extra => { draft = {...(DB.meta.get('profile') || {}), ...draft, ...extra, pay: (DB.meta.get('profile') || {}).pay || draft.pay}; if (!draft.registeredAt) draft.registeredAt = Date.now(); await DB.meta.set('profile', draft); applyProfile(); Cloud.schedule(); };
  const finish = async skipped => { await persist(skipped ? {setupSkippedAt: Date.now()} : {setupDone: true, setupSkippedAt: null}); wizRefresh = null; finishOnboard(skipped ? 'পরে প্রোফাইল থেকে বাকি তথ্য দিতে পারবেন' : msg); };
  const read = () => {
    if (step === 0) {
      const n = $('#wName', el).value.trim(), ph = $('#wPhone', el).value.trim();
      if (!n) return U.toast('আপনার নাম লিখুন'), false;
      if (ph && !U.validBdPhone(ph)) return U.toast('সঠিক মোবাইল নম্বর লিখুন (01XXXXXXXXX)'), false;
      if (!ph && local) return U.toast('মোবাইল নম্বর লিখুন — SMS ও রিপোর্টে লাগবে'), false;
      Object.assign(draft, {ownerName: n, phone: draft.verified && draft.phone ? draft.phone : ph ? U.normPhone(ph) : ''});
    }
    if (step === 1) {
      const s = $('#wShop', el).value.trim(); if (!s) return U.toast('দোকানের নাম লিখুন'), false;
      Object.assign(draft, {shopName: s, shopType: ($('#wType .on', el) || {}).dataset ? ($('#wType .on', el).dataset.v === 'other' ? $('#wTypeO', el).value.trim() : $('#wType .on', el).dataset.v) : draft.shopType || '', address: $('#wAddr', el).value.trim()});
    }
    return true;
  };
  const draw = () => {
    const c = profileCompletion({...draft, pay: (DB.meta.get('profile') || {}).pay});
    const ms = Pay.methods();
    const body = [
      `<p class="muted small">ছবি ও নাম দিন — কাস্টমারের SMS আর রিপোর্টে আপনার নাম যাবে।</p>
       <div class="profhead"><label class="pphoto" id="wPhoto">${draft.photo ? `<img src="${esc(draft.photo)}" alt="">` : Ic('user-round')}<span class="cam">${Ic('camera')}</span><input type="file" accept="image/*" id="wFile" hidden></label><span class="small muted">ছবি (ঐচ্ছিক)</span></div>
       <label class="field"><span>আপনার নাম *</span><input class="input" id="wName" autocomplete="name" value="${esc(draft.ownerName || '')}"></label>
       <label class="field"><span>মোবাইল নম্বর${local ? ' *' : ''}${draft.verified && draft.phone ? ' (যাচাই করা)' : ''}</span><input class="input" id="wPhone" type="tel" inputmode="tel" placeholder="01XXXXXXXXX" value="${esc(draft.phone || '')}" ${draft.verified && draft.phone ? 'disabled' : ''}></label>`,
      `<label class="field"><span>দোকানের নাম *</span><input class="input" id="wShop" placeholder="যেমন: মায়ের দোয়া স্টোর" autocomplete="organization" value="${esc(draft.shopName || '')}"></label>
       <div class="field"><span>ব্যবসার ধরন</span><div class="mtabs" id="wType" style="flex-wrap:wrap">${SHOP_TYPES.map(t => `<button type="button" data-v="${t === 'অন্যান্য' ? 'other' : t}" class="${draft.shopType === t || (t === 'অন্যান্য' && draft.shopType && !SHOP_TYPES.includes(draft.shopType)) ? 'on' : ''}">${t}</button>`).join('')}</div>
       <input class="input ${draft.shopType && !SHOP_TYPES.includes(draft.shopType) ? '' : 'hidden'}" id="wTypeO" placeholder="ব্যবসার ধরন লিখুন" value="${esc(draft.shopType && !SHOP_TYPES.includes(draft.shopType) ? draft.shopType : '')}"></div>
       <label class="field"><span>দোকানের ঠিকানা</span><input class="input" id="wAddr" placeholder="বাজার / রোড, এলাকা, জেলা" value="${esc(draft.address || '')}"></label>`,
      `<p class="muted small">কাস্টমার যেন সহজে বাকি পরিশোধ করতে পারে — বাকির SMS ও পেমেন্ট QR-এ এগুলো দেখাবে।</p>
       <div>${ms.length ? ms.map(m => `<div class="pm">${mfsLogo(m)}<div class="main"><div class="t">${esc(Pay.title(m))}</div><div class="s">${esc(Pay.detail(m))}</div></div></div>`).join('') : '<p class="small muted">এখনও কিছু যোগ করা হয়নি।</p>'}</div>
       <div class="btns" style="margin-top:8px"><button class="btn" id="wMfs">${Ic('smartphone')} বিকাশ / নগদ / রকেট / উপায়</button><button class="btn" id="wBank">${Ic('landmark')} ব্যাংক</button></div>
       <button class="btn block" id="wQr" style="margin-top:8px">${Ic('scan-line')} Bangla QR স্ক্যান / আপলোড</button>`,
      `<div style="text-align:center"><div class="tile t-green" style="width:64px;height:64px;margin:6px auto;border-radius:20px">${Ic('circle-check')}</div>
       <h2 style="margin:6px 0">প্রোফাইল ${bn(c.pct)}% সম্পূর্ণ</h2>
       <div class="pbar"><i style="width:${c.pct}%"></i></div>
       ${c.missing.length ? `<p class="small muted">বাকি: ${c.missing.join(', ')} — পরে প্রোফাইল থেকে দিতে পারবেন।</p>` : '<p class="small muted">সব তথ্য দেওয়া হয়েছে।</p>'}</div>`][step];
    el.innerHTML = `<div class="inner"><div class="hero" style="padding-bottom:4px"><h1 style="font-size:1.3rem">${step < 3 ? 'প্রোফাইল সেটআপ' : 'ধন্যবাদ!'}</h1>
      <div class="wsteps">${STEPS.map((t, i) => `<span class="${i < step ? 'done' : i === step ? 'on' : ''}"><b>${i < step ? Ic('check') : bn(i + 1)}</b>${t}</span>`).join('')}</div></div>
      <div class="card">${body}
        <div class="btns" style="margin-top:12px">${step > 0 && step < 3 ? `<button class="btn" id="wBack">← আগে</button>` : ''}<button class="btn primary" id="wNext">${step === 3 ? 'শুরু করুন →' : step === 2 && !ms.length ? 'পরে যোগ করব →' : 'পরের ধাপ →'}</button></div>
        ${step < 3 ? `<p style="text-align:center;margin:10px 0 0"><a href="#" id="wSkip">এখন না, পরে করব</a></p>` : ''}
      </div>
      ${local && step === 0 ? `<p style="text-align:center"><a href="#" id="oRestore">${Ic('upload')} পুরোনো ব্যাকআপ ফাইল থেকে ফেরত আনুন</a>${Cloud.enabled() ? ` · <a href="#" id="oAuth">লগইন</a>` : ''}</p>` : ''}
      <p class="credit">Powered by Robin · dFaster.com</p></div>`;
    el.classList.remove('hidden'); el.scrollTop = 0;
    if ($('#wFile', el)) $('#wFile', el).onchange = async e => { const f = e.target.files[0]; if (!f) return; draft.photo = await resizeImage(f, 256); draft.ownerName = $('#wName', el).value; draft.phone = $('#wPhone', el).value; draw(); };
    $$('#wType button', el).forEach(b => b.onclick = () => { $$('#wType button', el).forEach(x => x.classList.toggle('on', x === b)); $('#wTypeO', el).classList.toggle('hidden', b.dataset.v !== 'other'); });
    if ($('#wMfs', el)) $('#wMfs', el).onclick = () => mfsForm();
    if ($('#wBank', el)) $('#wBank', el).onclick = () => bankForm();
    if ($('#wQr', el)) $('#wQr', el).onclick = () => qrForm();
    if ($('#wBack', el)) $('#wBack', el).onclick = () => { if (step === 1) read(); step--; draw(); };
    $('#wNext', el).onclick = async () => {
      if (step === 3) return finish(false);
      if (!read()) return;
      await persist({}); step++; draw();
    };
    if ($('#wSkip', el)) $('#wSkip', el).onclick = async e => {
      e.preventDefault();
      if (step < 2) { const ok = step === 0 ? !!$('#wName', el).value.trim() || !!draft.ownerName : true; if (ok && $('#wName', el)) read(); }
      if (!draft.shopName && step < 2) { if (step === 1 && !read()) return; if (!draft.shopName) { U.toast('অন্তত দোকানের নাম দিন'); step = 1; return draw(); } }
      finish(true);
    };
    if ($('#oRestore', el)) $('#oRestore', el).onclick = e => { e.preventDefault(); importBackup(() => { if ((DB.meta.get('profile') || {}).shopName) finishOnboard(); else U.toast('ফাইলে দোকানের তথ্য নেই'); }); };
    if ($('#oAuth', el)) $('#oAuth', el).onclick = e => { e.preventDefault(); authScreen(); };
  };
  wizRefresh = draw;
  draw();
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
const pwField = (id, label, auto = 'current-password') => `<label class="field"><span>${label}</span><span class="pw"><input class="input" id="${id}" type="password" autocomplete="${auto}" minlength="6"><button type="button" class="eye" data-eye="${id}" aria-label="পাসওয়ার্ড দেখান">${Ic('eye')}</button></span></label>`;
function wireEyes(root) {
  $$('[data-eye]', root).forEach(b => b.onclick = () => {
    const i = $('#' + b.dataset.eye, root), show = i.type === 'password';
    i.type = show ? 'text' : 'password'; b.innerHTML = Ic(show ? 'eye-off' : 'eye'); b.setAttribute('aria-label', show ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখান');
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
  if (!needsSetup(p)) return finishOnboard(msg);
  setupWizard({msg, start: p && p.shopName && p.ownerName ? (p.shopType && p.address ? 2 : 1) : 0});
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
const VIEWS = {home, parties, party, trade, cash, reports, settings, products, profile, smslog};
async function boot() {
  try { await DB.init(); }
  catch (e) { view.innerHTML = `<div class="card">ডেটাবেস খোলা যায়নি: ${esc(e.message)}</div>`; return; }
  applyTheme(); applyProfile();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  if (window.Notify) Notify.init().catch(e => console.warn('notify', e));
  if (!DB.meta.get('profile')) onboarding();
  else if (S().pinHash) showLock();
  else setTimeout(() => askNotifications(), 900);
  render();
  DB.on(store => { if (['entries', 'parties', 'txns'].includes(store) && window.Notify) Notify.scheduleDue(); });
  if (Cloud.enabled() && Cloud.user()) Cloud.sync().catch(e => console.warn('sync', e));
  window.addEventListener('online', () => Cloud.schedule());
}
// Android 13+: notifications are off until the app asks — explain in Bangla first, then the system dialog.
// Some phones (Xiaomi HyperOS/MIUI) keep them off even then → offer the app's system notification page.
async function askNotifications(force) {
  if (!U.isNative() || !window.Notify) return;
  const st = await Notify.status(); if (!st.available) return;
  if (st.enabled) { if (S().notifOff) await setS({notifOff: false}); return; }
  if (S().notifAsked && !force) { if (!S().notifOff) await setS({notifOff: true}); return; }
  await setS({notifAsked: true});
  const ok = await confirmSheet('নোটিফিকেশন চালু করুন', `dFaster Note নোটিফিকেশনে জানাবে:<br>• কাস্টমারকে <b>SMS গেছে কিনা</b><br>• হিসাব <b>ক্লাউডে সিঙ্ক</b> হয়েছে কিনা<br>• প্রতিদিন <b>কার কাছে কত বাকি</b> — রিমাইন্ডার<br><br>পরের স্ক্রিনে <b>"Allow / অনুমতি দিন"</b> চাপুন।`, 'চালু করুন', false);
  let r = st;
  if (ok) r = await Notify.request();
  if (!r.enabled) {
    await setS({notifOff: true});
    if (ok && await confirmSheet('নোটিফিকেশন এখনও বন্ধ', 'ফোনের সেটিংসে dFaster Note-এর <b>"নোটিফিকেশন দেখান"</b> চালু করুন। (Xiaomi/Redmi ফোনে প্রায়ই এটা নিজে বন্ধ থাকে।)', 'সেটিংস খুলুন', false)) Native.openNotificationSettings();
  } else { await setS({notifOff: false}); U.toast('নোটিফিকেশন চালু হয়েছে'); Notify.scheduleDue(true); }
  if (route.name === 'home') render(true);
}
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !U.isNative() || !window.Notify) return;
  const st = await Notify.status(); if (st.available && !!S().notifOff === st.enabled) { await setS({notifOff: !st.enabled}); if (route.name === 'home') render(true); }
});
window.BK = {go, render, openSheet, closeSheet, VERSION};
boot();
})();
