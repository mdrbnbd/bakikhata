/* dFaster Note — phone features: SMS (open SMS app / auto-send), WhatsApp, share files.
   In the Android app these go through the BakiNative plugin (android-app/.../BakiNativePlugin.java);
   in a browser they fall back to sms:/wa.me links and file downloads. */
(() => {
'use strict';
const P = () => U.plugin('BakiNative');
const settings = () => DB.meta.get('settings') || {};
const profile = () => DB.meta.get('profile') || {};

function openUrl(url) {
  const p = P();
  if (p) return p.openUrl({url});
  const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
}
// default mode: open the phone's SMS app with the text filled in (needs no permission)
async function composeSms(phone, body) {
  const p = P();
  if (p) return p.composeSms({phone: U.normPhone(phone), body});
  location.href = `sms:${U.normPhone(phone)}?body=${encodeURIComponent(body)}`;
}
// "অটো SMS": send silently through SmsManager (needs the SEND_SMS runtime permission)
async function smsPermission(request = false) {
  const p = P(); if (!p) return 'unavailable';
  let r = await p.checkPermissions();
  if (r.sms !== 'granted' && request) r = await p.requestPermissions({permissions: ['sms']});
  return r.sms;
}
// resolves {status: 'sent'|'failed'|'pending', parts, code}; throws (code NO_PERMISSION) without permission
async function sendSmsAuto(phone, body, subId) {
  const p = P(); if (!p) throw new Error('অটো SMS শুধু Android অ্যাপে কাজ করে');
  return p.sendSms({phone: U.normPhone(phone), body, subId: subId == null || subId === '' ? -1 : +subId});
}
// Android SmsManager result codes → Bangla
function smsErr(code) {
  return ({1: 'নেটওয়ার্ক সমস্যা', 2: 'ফোনের সিগন্যাল/রেডিও বন্ধ (ফ্লাইট মোড?)', 3: 'SMS তৈরি হয়নি', 4: 'নেটওয়ার্ক নেই',
    5: 'SMS-এর সীমা পার হয়েছে', 6: 'জরুরি কলের সময় SMS যায় না', 7: 'ছোট কোড SMS অনুমতি নেই', 8: 'ছোট কোড SMS নিষেধ'})[code]
    || (code ? `সিম/নেটওয়ার্ক ত্রুটি (${code})` : 'অজানা সমস্যা');
}
async function listSims() { const p = P(); if (!p) return {sims: []}; return p.listSims(); }
async function openAppSettings() { const p = P(); if (p) return p.openAppSettings(); }
async function openNotificationSettings() { const p = P(); if (p) return p.openNotificationSettings(); }
function whatsapp(phone, body) {
  const n = '88' + U.normPhone(phone);
  return openUrl(`https://wa.me/${n}?text=${encodeURIComponent(body)}`);
}
function call(phone) { return openUrl('tel:' + U.normPhone(phone)); }
// share/save a generated file (backup JSON, report PDF)
async function shareFile(filename, mime, base64, title, text) {
  const p = P();
  if (p) return p.shareFile({filename, mime, base64, title: title || filename, text});
  const bin = atob(base64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const blob = new Blob([u8], {type: mime});
  const file = new File([blob], filename, {type: mime});
  if (navigator.canShare && navigator.canShare({files: [file]})) { try { await navigator.share({files: [file], title, text}); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
const utf8b64 = s => { const u8 = new TextEncoder().encode(s); let b = ''; for (let i = 0; i < u8.length; i += 0x8000) b += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(b); };

/* ---------- SMS texts (Bangla) ---------- */
function shopSign() { const p = profile(); return p.shopName ? p.shopName + (p.phone ? ' (' + U.bn(p.phone) + ')' : '') : 'dFaster Note'; }
function balLine(bal) {
  if (bal > 0) return `মোট বাকি: ${U.money(bal)}`;
  if (bal < 0) return `আপনার পাওনা: ${U.moneyAbs(bal)}`;
  return 'আপনার কোনো বাকি নেই';
}
// payment numbers go into customer SMS while they owe money (owner can turn this off)
function payTail(party, bal) {
  if (party.type === 'supplier' || bal <= 0 || settings().smsPay === false || !window.Pay) return '';
  const l = Pay.smsLine(); return l ? ' ' + l + '।' : '';
}
const edited = o => o && o.edited ? 'সংশোধিত হিসাব: ' : '';
function entryText(entry, party, o) {
  const bal = Book.balance(party.id), d = U.dateShort(entry.date), sup = party.type === 'supplier';
  let what;
  if (entry.src && entry.src.type === 'txn') {
    const t = DB.get('txns', entry.src.id);
    what = t && t.type === 'sale' ? `${d} তারিখে ${U.money(t.total)} টাকার পণ্য কিনেছেন` + (t.paid > 0 ? `, নগদ দিয়েছেন ${U.money(t.paid)}` : '') + `, বাকি ${U.money(entry.amount)}`
      : `${d} তারিখে ${U.money(entry.amount)} বাকিতে মাল পাওয়া গেল`;
  } else if (entry.kind === 'got') what = sup ? `${d} তারিখে আপনার কাছ থেকে ${U.money(entry.amount)} বাকিতে মাল/টাকা পাওয়া গেল` : `${d} তারিখে আপনার কাছ থেকে ${U.money(entry.amount)} পাওয়া গেল। ধন্যবাদ`;
  else what = sup ? `${d} তারিখে আপনাকে ${U.money(entry.amount)} পরিশোধ করা হলো` : `${d} তারিখে আপনাকে ${U.money(entry.amount)} বাকি দেওয়া হলো`;
  return `${edited(o)}${party.name}, ${what}। ${balLine(bal)}।${payTail(party, bal)} - ${shopSign()}`;
}
function saleText(t, party, o) {
  const bal = Book.balance(party.id), d = U.dateShort(t.date);
  const head = t.type === 'sale' ? `${d} তারিখে বিক্রয়: মোট ${U.money(t.total)}` + (t.paid > 0 ? `, নগদ ${U.money(t.paid)}` : '') + (t.due > 0 ? `, বাকি ${U.money(t.due)}` : '')
    : `${d} তারিখে আপনার কাছ থেকে ${U.money(t.total)} টাকার মাল কেনা হলো` + (t.paid > 0 ? `, নগদ দেওয়া ${U.money(t.paid)}` : '') + (t.due > 0 ? `, বাকি ${U.money(t.due)}` : '');
  return `${edited(o)}${party.name}, ${head}। ${balLine(bal)}।${payTail(party, bal)} - ${shopSign()}`;
}
// after a delete: tell the customer the record was cancelled, with the new balance
function cancelText(what, amount, date, party) {
  const bal = Book.balance(party.id);
  return `${party.name}, ${U.dateShort(date)} তারিখের ${U.money(amount)} টাকার ${what} বাতিল করা হলো। ${balLine(bal)}।${payTail(party, bal)} - ${shopSign()}`;
}
function reminderText(party) {
  const bal = Book.balance(party.id), p = profile();
  return `সম্মানিত ${party.name}, ${p.shopName || 'আমাদের দোকান'}-এ আপনার মোট বাকি ${U.money(bal)}। অনুগ্রহ করে দ্রুত পরিশোধ করুন।${payTail(party, bal)} ধন্যবাদ - ${p.ownerName || ''}${p.phone ? ' ' + U.bn(p.phone) : ''}`.trim();
}
// SMS parts estimate: Bangla is Unicode → 70 chars (67 per part when split)
const smsParts = s => s.length <= 70 ? 1 : Math.ceil(s.length / 67);

window.Native = {openUrl, composeSms, smsPermission, sendSmsAuto, smsErr, listSims, openAppSettings, openNotificationSettings, whatsapp, call, shareFile, utf8b64,
  entryText, saleText, cancelText, reminderText, smsParts, settings, profile};
})();
