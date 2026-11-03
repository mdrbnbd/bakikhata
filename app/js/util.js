/* বাকি খাতা — helpers: Bangla numerals, money, dates, ids, DOM, toast */
(() => {
'use strict';
const BN = '০১২৩৪৫৬৭৮৯';
const bn = v => String(v).replace(/\d/g, d => BN[d]);
const toAscii = s => String(s == null ? '' : s).replace(/[০-৯]/g, d => BN.indexOf(d)).replace(/[,\s৳]/g, '');
const num = s => { const n = parseFloat(toAscii(s)); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
// Indian/Bangladeshi grouping: ১২,৩৪,৫৬৭
function group(n) {
  const neg = n < 0; n = Math.abs(Math.round(n * 100) / 100);
  let [i, f] = n.toFixed(2).split('.');
  let last3 = i.slice(-3), rest = i.slice(0, -3);
  if (rest) last3 = ',' + last3;
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (neg ? '-' : '') + rest + last3 + (f !== '00' ? '.' + f : '');
}
const money = n => '৳' + bn(group(n));
const moneyAbs = n => money(Math.abs(n));
const pad = n => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const MONTHS = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
const DAYS = ['রবিবার','সোমবার','মঙ্গলবার','বুধবার','বৃহস্পতিবার','শুক্রবার','শনিবার'];
const dateBn = s => { const d = parseYmd(s); return `${bn(d.getDate())} ${MONTHS[d.getMonth()]} ${bn(d.getFullYear())}`; };
const dateShort = s => { const d = parseYmd(s); return `${bn(pad(d.getDate()))}/${bn(pad(d.getMonth() + 1))}/${bn(d.getFullYear())}`; };
const monthBn = s => { const d = parseYmd(s); return `${MONTHS[d.getMonth()]} ${bn(d.getFullYear())}`; };
const timeBn = ms => { const d = new Date(ms); let h = d.getHours(); const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; return bn(`${h}:${pad(d.getMinutes())}`) + ' ' + ap; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// Bangladeshi mobile: 01XXXXXXXXX (accepts +880 / 880 / Bangla digits)
function normPhone(p) {
  let s = toAscii(p).replace(/[^\d+]/g, '');
  if (s.startsWith('+880')) s = '0' + s.slice(4); else if (s.startsWith('880')) s = '0' + s.slice(3);
  return s;
}
const validBdPhone = p => /^01[3-9]\d{8}$/.test(normPhone(p));
const e164 = p => '+88' + normPhone(p);
let toastT;
function toast(msg, ms = 2600) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}
async function sha256(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const isNative = () => !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
const plugin = name => (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins[name]) || null;
window.U = {bn, toAscii, num, group, money, moneyAbs, ymd, parseYmd, dateBn, dateShort, monthBn, timeBn, MONTHS, DAYS,
  uid, esc, $, $$, normPhone, validBdPhone, e164, toast, sha256, isNative, plugin, pad};
})();
