/* বাকি খাতা — business rules.
   Party balance = Σ দিলাম − Σ পেলাম.  > 0 → পাবো (they owe the shop), < 0 → দেবো (shop owes them).
   Customer: দিলাম = বাকিতে মাল/টাকা দিলাম, পেলাম = টাকা পেলাম.  Supplier: পেলাম = বাকিতে মাল পেলাম, দিলাম = টাকা দিলাম.
   বিক্রয়/ক্রয়: paid part → ক্যাশবক্স, unpaid (বাকি) part → party ledger (sale → দিলাম, purchase → পেলাম). */
(() => {
'use strict';
const EXPENSE_CATS = ['দোকান ভাড়া', 'বিদ্যুৎ বিল', 'কর্মচারীর বেতন', 'পরিবহন', 'নাস্তা/চা', 'মোবাইল/ইন্টারনেট', 'মালামাল খরচ', 'অন্যান্য'];
const CASH_IN_CATS = ['মালিকের বিনিয়োগ', 'ঋণ গ্রহণ', 'অন্যান্য আয়'];
const CASH_OUT_CATS = ['মালিকের উত্তোলন', 'ঋণ পরিশোধ', 'ব্যাংকে জমা', 'অন্যান্য'];

const parties = type => DB.list('parties').filter(p => !type || p.type === type);
const entriesOf = pid => DB.list('entries').filter(e => e.partyId === pid);
const sortChrono = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt;
function balance(pid) { let b = 0; for (const e of DB.list('entries')) if (e.partyId === pid) b += e.kind === 'gave' ? e.amount : -e.amount; return Math.round(b * 100) / 100; }
function balances() { const m = new Map(); for (const e of DB.list('entries')) m.set(e.partyId, (m.get(e.partyId) || 0) + (e.kind === 'gave' ? e.amount : -e.amount)); return m; }
function totals() {
  const m = balances(); let receivable = 0, payable = 0, nRec = 0, nPay = 0;
  for (const p of DB.list('parties')) { const b = Math.round((m.get(p.id) || 0) * 100) / 100; if (b > 0) { receivable += b; nRec++; } else if (b < 0) { payable -= b; nPay++; } }
  return {receivable, payable, nRec, nPay};
}
// ledger with running balance (oldest → newest)
function ledger(pid) {
  let run = 0;
  return entriesOf(pid).sort(sortChrono).map(e => { run += e.kind === 'gave' ? e.amount : -e.amount; return {...e, run: Math.round(run * 100) / 100}; });
}
async function saveParty(p) {
  if (!p.name || !p.name.trim()) throw new Error('নাম লিখুন');
  return DB.put('parties', {...p, name: p.name.trim(), phone: p.phone ? U.normPhone(p.phone) : '', type: p.type || 'customer'});
}
async function deleteParty(id) {
  const ops = [['parties', {...DB.get('parties', id), deleted: 1}]];
  for (const e of entriesOf(id)) {
    ops.push(['entries', {...e, deleted: 1}]);
    if (e.cashId && DB.get('cash', e.cashId)) ops.push(['cash', {...DB.get('cash', e.cashId), deleted: 1}]);
  }
  for (const t of DB.list('txns').filter(t => t.partyId === id)) ops.push(['txns', {...t, partyId: null, entryId: null}]);
  return DB.putMany(ops);
}
// manual দিলাম / পেলাম (optionally moves cash in the ক্যাশবক্স)
async function saveEntry({id, partyId, kind, amount, date, note, cash}) {
  amount = U.num(amount);
  if (!(amount > 0)) throw new Error('টাকার পরিমাণ লিখুন');
  if (!DB.get('parties', partyId)) throw new Error('পার্টি পাওয়া যায়নি');
  const old = id ? DB.get('entries', id) : null;
  const e = {...(old || {}), id: id || U.uid(), partyId, kind, amount, date: date || U.ymd(), note: (note || '').trim()};
  const ops = [];
  const oldCash = old && old.cashId ? DB.get('cash', old.cashId) : null;
  if (cash) {
    const c = {...(oldCash || {}), id: (oldCash && oldCash.id) || U.uid(), kind: kind === 'got' ? 'in' : 'out', category: kind === 'got' ? 'বাকি আদায়' : 'বাকি/পরিশোধ',
      amount, date: e.date, note: DB.get('parties', partyId).name + (e.note ? ' — ' + e.note : ''), src: {type: 'entry', id: e.id}};
    e.cashId = c.id; ops.push(['cash', c]);
  } else { if (oldCash) ops.push(['cash', {...oldCash, deleted: 1}]); e.cashId = null; }
  ops.unshift(['entries', e]);
  const [saved] = await DB.putMany(ops);
  return saved;
}
async function deleteEntry(id) {
  const e = DB.get('entries', id); if (!e) return;
  if (e.src && e.src.type === 'txn') return deleteTxn(e.src.id);
  const ops = [['entries', {...e, deleted: 1}]];
  if (e.cashId && DB.get('cash', e.cashId)) ops.push(['cash', {...DB.get('cash', e.cashId), deleted: 1}]);
  return DB.putMany(ops);
}
// বিক্রয় / ক্রয় — mode 'cash' (নগদ) or 'due' (বাকি, with optional paid-now part)
async function saveTxn({id, type, mode, partyId, items, total, paid, date, note}) {
  items = (items || []).filter(i => i.name && i.name.trim()).map(i => ({name: i.name.trim(), qty: U.num(i.qty) || 1, price: U.num(i.price)}));
  const itemsTotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  total = U.num(total) || Math.round(itemsTotal * 100) / 100;
  if (!(total > 0)) throw new Error('মোট টাকার পরিমাণ লিখুন');
  paid = mode === 'cash' ? total : Math.min(U.num(paid), total);
  const due = Math.round((total - paid) * 100) / 100;
  if (mode === 'due' && !partyId) throw new Error(type === 'sale' ? 'বাকিতে বিক্রির জন্য কাস্টমার বাছাই করুন' : 'বাকিতে কেনার জন্য সাপ্লায়ার বাছাই করুন');
  const old = id ? DB.get('txns', id) : null;
  const t = {...(old || {}), id: id || U.uid(), type, mode, partyId: partyId || null, items, total, paid, due, date: date || U.ymd(), note: (note || '').trim()};
  const party = partyId ? DB.get('parties', partyId) : null;
  const label = (type === 'sale' ? 'বিক্রয়' : 'ক্রয়') + (party ? ' — ' + party.name : '');
  const ops = [];
  const oldE = old && old.entryId ? DB.get('entries', old.entryId) : null;
  const oldC = old && old.cashId ? DB.get('cash', old.cashId) : null;
  if (due > 0 && party) {
    const e = {...(oldE || {}), id: (oldE && oldE.id) || U.uid(), partyId, kind: type === 'sale' ? 'gave' : 'got', amount: due, date: t.date,
      note: (type === 'sale' ? 'বাকিতে বিক্রয়' : 'বাকিতে ক্রয়') + (paid > 0 ? ` (মোট ${U.money(total)}, নগদ ${U.money(paid)})` : '') + (t.note ? ' — ' + t.note : ''),
      src: {type: 'txn', id: t.id}, cashId: null};
    t.entryId = e.id; ops.push(['entries', e]);
  } else { if (oldE) ops.push(['entries', {...oldE, deleted: 1}]); t.entryId = null; }
  if (paid > 0) {
    const c = {...(oldC || {}), id: (oldC && oldC.id) || U.uid(), kind: type === 'sale' ? 'in' : 'out', category: type === 'sale' ? 'বিক্রয়' : 'ক্রয়',
      amount: paid, date: t.date, note: label + (t.note ? ' — ' + t.note : ''), src: {type: 'txn', id: t.id}};
    t.cashId = c.id; ops.push(['cash', c]);
  } else { if (oldC) ops.push(['cash', {...oldC, deleted: 1}]); t.cashId = null; }
  ops.unshift(['txns', t]);
  for (const i of items) if (!DB.list('products').some(p => p.name === i.name)) ops.push(['products', {name: i.name, price: i.price}]);
  const [saved] = await DB.putMany(ops);
  return saved;
}
async function deleteTxn(id) {
  const t = DB.get('txns', id); if (!t) return;
  const ops = [['txns', {...t, deleted: 1}]];
  if (t.entryId && DB.get('entries', t.entryId)) ops.push(['entries', {...DB.get('entries', t.entryId), deleted: 1}]);
  if (t.cashId && DB.get('cash', t.cashId)) ops.push(['cash', {...DB.get('cash', t.cashId), deleted: 1}]);
  return DB.putMany(ops);
}
async function saveCash({id, kind, category, amount, date, note}) {
  amount = U.num(amount);
  if (!(amount > 0)) throw new Error('টাকার পরিমাণ লিখুন');
  const old = id ? DB.get('cash', id) : null;
  if (old && old.src) throw new Error('এটি লেনদেন থেকে এসেছে — মূল লেনদেনটি বদলান');
  return DB.put('cash', {...(old || {}), id: id || undefined, kind, category: category || (kind === 'expense' ? 'অন্যান্য' : ''), amount, date: date || U.ymd(), note: (note || '').trim()});
}
async function deleteCash(id) {
  const c = DB.get('cash', id); if (!c) return;
  if (c.src && c.src.type === 'txn') return deleteTxn(c.src.id);
  if (c.src && c.src.type === 'entry') { const e = DB.get('entries', c.src.id); if (e) return DB.putMany([['cash', {...c, deleted: 1}], ['entries', {...e, cashId: null}]]); }
  return DB.remove('cash', id);
}
const cashSign = c => c.kind === 'in' ? c.amount : -c.amount;
function cashSummary(from, to) {
  let inn = 0, out = 0, exp = 0;
  for (const c of DB.list('cash')) if (c.date >= from && c.date <= to) { if (c.kind === 'in') inn += c.amount; else if (c.kind === 'expense') exp += c.amount; else out += c.amount; }
  return {inn, out, exp, net: inn - out - exp};
}
function cashInHand(upto = '9999-12-31') {
  const open = U.num((DB.meta.get('settings') || {}).openingCash || 0);
  return open + DB.list('cash').filter(c => c.date <= upto).reduce((s, c) => s + cashSign(c), 0);
}
function txnSummary(from, to, type) {
  let total = 0, paid = 0, due = 0, n = 0;
  for (const t of DB.list('txns')) if (t.type === type && t.date >= from && t.date <= to) { total += t.total; paid += t.paid; due += t.due; n++; }
  return {total, paid, due, n};
}
function report(from, to) {
  const sale = txnSummary(from, to, 'sale'), purchase = txnSummary(from, to, 'purchase'), cash = cashSummary(from, to);
  const pType = id => (DB.get('parties', id) || {}).type;
  const led = {custGave: 0, custGot: 0, supGave: 0, supGot: 0};
  for (const e of DB.list('entries')) if (e.date >= from && e.date <= to) {
    const k = (pType(e.partyId) === 'supplier' ? 'sup' : 'cust') + (e.kind === 'gave' ? 'Gave' : 'Got'); led[k] += e.amount;
  }
  const expCats = {};
  for (const c of DB.list('cash')) if (c.kind === 'expense' && c.date >= from && c.date <= to) expCats[c.category || 'অন্যান্য'] = (expCats[c.category || 'অন্যান্য'] || 0) + c.amount;
  const m = balances();
  const debtors = DB.list('parties').map(p => ({...p, bal: Math.round((m.get(p.id) || 0) * 100) / 100})).filter(p => p.bal !== 0).sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal));
  return {from, to, sale, purchase, cash, led, expCats, totals: totals(), debtors,
    profit: sale.total - purchase.total - cash.exp,
    cashOpen: cashInHand(prevDay(from)), cashClose: cashInHand(to)};
}
function prevDay(s) { const d = U.parseYmd(s); d.setDate(d.getDate() - 1); return U.ymd(d); }
window.Book = {EXPENSE_CATS, CASH_IN_CATS, CASH_OUT_CATS, parties, entriesOf, balance, balances, totals, ledger, saveParty, deleteParty,
  saveEntry, deleteEntry, saveTxn, deleteTxn, saveCash, deleteCash, cashSummary, cashInHand, txnSummary, report, sortChrono};
})();
