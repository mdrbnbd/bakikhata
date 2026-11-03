/* বাকি খাতা — phone features: SMS (open SMS app / auto-send), WhatsApp, share files.
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
// optional mode "অটো SMS": send directly through SmsManager (needs SEND_SMS runtime permission)
async function smsPermission(request = false) {
  const p = P(); if (!p) return 'unavailable';
  let r = await p.checkPermissions();
  if (r.sms !== 'granted' && request) r = await p.requestPermissions({permissions: ['sms']});
  return r.sms;
}
async function sendSmsAuto(phone, body) {
  const p = P(); if (!p) throw new Error('অটো SMS শুধু Android অ্যাপে কাজ করে');
  if (await smsPermission(true) !== 'granted') throw new Error('SMS পাঠানোর অনুমতি দেওয়া হয়নি');
  return p.sendSms({phone: U.normPhone(phone), body});
}
function whatsapp(phone, body) {
  const n = '88' + U.normPhone(phone);
  return openUrl(`https://wa.me/${n}?text=${encodeURIComponent(body)}`);
}
function call(phone) { return openUrl('tel:' + U.normPhone(phone)); }
// share/save a generated file (backup JSON, report PDF)
async function shareFile(filename, mime, base64, title) {
  const p = P();
  if (p) return p.shareFile({filename, mime, base64, title: title || filename});
  const bin = atob(base64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const blob = new Blob([u8], {type: mime});
  const file = new File([blob], filename, {type: mime});
  if (navigator.canShare && navigator.canShare({files: [file]})) { try { await navigator.share({files: [file], title}); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
const utf8b64 = s => { const u8 = new TextEncoder().encode(s); let b = ''; for (let i = 0; i < u8.length; i += 0x8000) b += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(b); };

/* ---------- SMS texts (Bangla) ---------- */
function shopSign() { const p = profile(); return p.shopName ? p.shopName + (p.phone ? ' (' + U.bn(p.phone) + ')' : '') : 'বাকি খাতা'; }
function balLine(bal) {
  if (bal > 0) return `মোট বাকি: ${U.money(bal)}`;
  if (bal < 0) return `আপনার পাওনা: ${U.moneyAbs(bal)}`;
  return 'আপনার কোনো বাকি নেই';
}
function entryText(entry, party) {
  const bal = Book.balance(party.id), d = U.dateShort(entry.date), sup = party.type === 'supplier';
  let what;
  if (entry.src && entry.src.type === 'txn') {
    const t = DB.get('txns', entry.src.id);
    what = t && t.type === 'sale' ? `${d} তারিখে ${U.money(t.total)} টাকার পণ্য কিনেছেন` + (t.paid > 0 ? `, নগদ দিয়েছেন ${U.money(t.paid)}` : '') + `, বাকি ${U.money(entry.amount)}`
      : `${d} তারিখে ${U.money(entry.amount)} বাকিতে মাল পাওয়া গেল`;
  } else if (entry.kind === 'got') what = sup ? `${d} তারিখে আপনার কাছ থেকে ${U.money(entry.amount)} বাকিতে মাল/টাকা পাওয়া গেল` : `${d} তারিখে আপনার কাছ থেকে ${U.money(entry.amount)} পাওয়া গেল। ধন্যবাদ`;
  else what = sup ? `${d} তারিখে আপনাকে ${U.money(entry.amount)} পরিশোধ করা হলো` : `${d} তারিখে আপনাকে ${U.money(entry.amount)} বাকি দেওয়া হলো`;
  return `${party.name}, ${what}। ${balLine(bal)}। - ${shopSign()}`;
}
function saleText(t, party) {
  const bal = Book.balance(party.id), d = U.dateShort(t.date);
  const kind = t.type === 'sale' ? 'বিক্রয়' : 'ক্রয়';
  return `${party.name}, ${d} তারিখে ${kind}: মোট ${U.money(t.total)}` + (t.paid > 0 ? `, নগদ ${U.money(t.paid)}` : '') + (t.due > 0 ? `, বাকি ${U.money(t.due)}` : '') + `। ${balLine(bal)}। - ${shopSign()}`;
}
function reminderText(party) {
  const bal = Book.balance(party.id), p = profile();
  return `সম্মানিত ${party.name}, ${p.shopName || 'আমাদের দোকান'}-এ আপনার মোট বাকি ${U.money(bal)}। অনুগ্রহ করে দ্রুত পরিশোধ করুন। ধন্যবাদ - ${p.ownerName || ''}${p.phone ? ' ' + U.bn(p.phone) : ''}`.trim();
}
// SMS parts estimate: Bangla is Unicode → 70 chars (67 per part when split)
const smsParts = s => s.length <= 70 ? 1 : Math.ceil(s.length / 67);

window.Native = {openUrl, composeSms, smsPermission, sendSmsAuto, whatsapp, call, shareFile, utf8b64,
  entryText, saleText, reminderText, smsParts, settings, profile};
})();
