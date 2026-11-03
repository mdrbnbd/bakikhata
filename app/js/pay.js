/* dFaster Note — payment methods (bKash / Nagad / Rocket / Upay, bank accounts, official Bangla QR) and payment QR.
   - Bangla QR is EMVCo Merchant-Presented QR: TLV "tag(2) len(2) value", "6304"+CRC16-CCITT (0x1021, init 0xFFFF) last.
     For a due amount we set tag 54 (transaction amount), tag 01 = "12" (dynamic) and recompute the CRC.
   - MFS / bank methods have no official payment QR here, so we draw an INFO card (clearly labelled "not a payment QR").
   No automatic payment confirmation: that needs a merchant API — the owner taps পেলাম when the money arrives. */
(() => {
'use strict';
const PROVIDERS = {
  bkash: {name: 'বিকাশ', en: 'bKash', color: '#e2136e'},
  nagad: {name: 'নগদ', en: 'Nagad', color: '#ec1c24'},
  rocket: {name: 'রকেট', en: 'Rocket', color: '#8c3494'},
  upay: {name: 'উপায়', en: 'Upay', color: '#0f5cab'},
};
const TYPES = {personal: 'পার্সোনাল', merchant: 'মার্চেন্ট', agent: 'এজেন্ট'};
const profile = () => DB.meta.get('profile') || {};
const pay = () => (profile().pay && Array.isArray(profile().pay.methods)) ? profile().pay : {methods: [], defaultId: null};
// default first, then the order the owner added them
function methods() {
  const p = pay(), m = [...p.methods];
  m.sort((a, b) => (b.id === p.defaultId) - (a.id === p.defaultId));
  return m;
}
async function save(methodsList, defaultId) {
  const pr = profile();
  const ids = methodsList.map(m => m.id);
  const def = ids.includes(defaultId) ? defaultId : (ids[0] || null);
  await DB.meta.set('profile', {...pr, pay: {methods: methodsList, defaultId: def}});
}
function title(m) {
  if (m.kind === 'mfs') { const p = PROVIDERS[m.provider] || {name: m.provider}; return `${p.name} (${TYPES[m.type] || ''})`; }
  if (m.kind === 'bank') return m.bank || 'ব্যাংক';
  if (m.kind === 'qr') return m.label || (m.merchant ? 'Bangla QR · ' + m.merchant : 'Bangla QR');
  return m.label || 'QR ছবি';
}
function detail(m, full) {
  if (m.kind === 'mfs') return U.bn(m.number || '');
  if (m.kind === 'bank') return [m.accName, full ? 'হিসাব নং ' + U.bn(m.accNo || '') : 'হিসাব নং ' + mask(m.accNo), m.branch && 'শাখা: ' + m.branch, full && m.routing && 'রাউটিং: ' + U.bn(m.routing)].filter(Boolean).join(' · ');
  if (m.kind === 'qr') return 'অফিশিয়াল Bangla QR' + (m.city ? ' · ' + m.city : '');
  return 'সেভ করা QR ছবি';
}
const mask = s => { s = String(s || ''); return s.length > 4 ? '••••' + U.bn(s.slice(-4)) : U.bn(s); };

/* ---------- EMVCo TLV ---------- */
function crc16(str) {
  const bytes = new TextEncoder().encode(str); let crc = 0xFFFF;
  for (const b of bytes) { crc ^= b << 8; for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF; }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function parseTLV(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    if (i + 4 > s.length) throw new Error('bad TLV');
    const tag = s.substr(i, 2), len = parseInt(s.substr(i + 2, 2), 10);
    if (!/^\d\d$/.test(tag) || isNaN(len) || i + 4 + len > s.length) throw new Error('bad TLV');
    out.push({tag, val: s.substr(i + 4, len)}); i += 4 + len;
  }
  return out;
}
const tlv = (tag, val) => tag + String(val.length).padStart(2, '0') + val;
function crcOk(s) { return /6304[0-9A-Fa-f]{4}$/.test(s) && crc16(s.slice(0, -4)) === s.slice(-4).toUpperCase(); }
function parseEmv(s) {
  s = String(s || '').trim();
  if (!s.startsWith('000201')) return null;
  let f; try { f = parseTLV(s); } catch (e) { return null; }
  if (!f.length || f[f.length - 1].tag !== '63' || !crcOk(s)) return null;
  const get = t => (f.find(x => x.tag === t) || {}).val;
  return {fields: f, merchant: get('59') || '', city: get('60') || '', country: get('58') || '', currency: get('53') || '', amount: get('54') || '', dynamic: get('01') === '12'};
}
const fmtAmount = a => { const n = Math.round(Number(a) * 100) / 100; return Number.isInteger(n) ? String(n) : n.toFixed(2); };
// insert/replace the amount (tag 54), mark as dynamic (01=12), recompute CRC. amount <= 0 → amount removed (static QR).
function withAmount(payload, amount) {
  const e = parseEmv(payload); if (!e) throw new Error('অফিশিয়াল Bangla QR নয়');
  let f = e.fields.filter(x => x.tag !== '63' && x.tag !== '54');
  const amt = Number(amount) > 0 ? fmtAmount(amount) : null;
  if (amt) {
    if (amt.length > 13) throw new Error('টাকার পরিমাণ খুব বড়');
    const at = f.findIndex(x => x.tag === '53'); const nf = {tag: '54', val: amt};
    if (at >= 0) f.splice(at + 1, 0, nf); else { const i58 = f.findIndex(x => +x.tag > 54); f.splice(i58 < 0 ? f.length : i58, 0, nf); }
    const i01 = f.findIndex(x => x.tag === '01'); if (i01 >= 0) f[i01] = {tag: '01', val: '12'}; else f.splice(1, 0, {tag: '01', val: '12'});
  } else {
    const i01 = f.findIndex(x => x.tag === '01'); if (i01 >= 0) f[i01] = {tag: '01', val: '11'};
  }
  const body = f.map(x => tlv(x.tag, x.val)).join('') + '6304';
  return body + crc16(body);
}

/* ---------- QR render / decode (vendor libs loaded on demand) ---------- */
const loaded = {};
function load(src) { return loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('লাইব্রেরি লোড হয়নি')); document.head.appendChild(s); })); }
async function qrMatrix(text) {
  await load('vendor/qrcode.min.js');
  const q = qrcode(0, 'M'); q.addData(text, 'Byte'); q.make();
  const n = q.getModuleCount(); return {n, dark: (r, c) => q.isDark(r, c)};
}
function drawQr(ctx, m, x, y, size) {
  const cell = size / (m.n + 8); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, size, size); ctx.fillStyle = '#000';
  for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c)) ctx.fillRect(Math.floor(x + (c + 4) * cell), Math.floor(y + (r + 4) * cell), Math.ceil(cell), Math.ceil(cell));
}
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('ছবি খোলা যায়নি')); i.src = src; }); }
const fileToDataUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
// decode a QR from an image (photo/screenshot of the merchant QR). Tries a few sizes; returns text or null.
async function decodeImage(src) {
  await load('vendor/jsQR.min.js');
  const img = await loadImage(src);
  for (const max of [1200, 800, 1600, 500, 360]) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * k), h = Math.round(img.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
    const r = jsQR(x.getImageData(0, 0, w, h).data, w, h, {inversionAttempts: 'attemptBoth'});
    if (r && r.data) return r.data;
  }
  return null;
}
async function shrinkImage(src, max = 600, q = 0.82) {
  const img = await loadImage(src); const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

/* ---------- payment card (canvas): official QR with amount, or a labelled info card ---------- */
function wrap(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(' '); let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; } else line = t; }
  if (line) ctx.fillText(line, x, y); return y + lh;
}
// returns {canvas, payable: bool, payload}
async function card(method, amount, {partyName} = {}) {
  try { await Promise.all([document.fonts.load('30px "Hind Siliguri"'), document.fonts.load('bold 30px "Hind Siliguri"')]); } catch (e) { /* system font */ }
  const W = 720, H = 1000, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), pr = profile(), font = s => `${s}px "Hind Siliguri","Noto Sans Bengali",sans-serif`;
  const accent = method.kind === 'mfs' ? (PROVIDERS[method.provider] || {}).color || '#0b6e4f' : '#0b6e4f';
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  x.fillStyle = accent; x.fillRect(0, 0, W, 150);
  x.fillStyle = '#fff'; x.textAlign = 'center';
  x.font = 'bold ' + font(40); x.fillText(pr.shopName || 'dFaster Note', W / 2, 62);
  x.font = font(30); x.fillText(title(method), W / 2, 112);
  let payload = null, payable = false;
  if (method.kind === 'qr') { payload = withAmount(method.payload, amount); payable = true; }
  else if (method.kind === 'mfs') payload = [`${(PROVIDERS[method.provider] || {}).en || method.provider} ${TYPES[method.type] ? '(' + method.type + ')' : ''} ${method.number}`.replace(/\s+/g, ' ').trim(), pr.shopName, 'BDT ' + fmtAmount(amount || 0)].filter(Boolean).join(' | ');
  else if (method.kind === 'bank') payload = [method.bank, method.accName, 'A/C ' + method.accNo, method.branch, method.routing && 'Routing ' + method.routing, 'BDT ' + fmtAmount(amount || 0)].filter(Boolean).join(' | ');
  const qs = 440, qx = (W - qs) / 2, qy = 180;
  if (method.kind === 'qrimg') { const img = await loadImage(method.img); const k = Math.min(qs / img.width, qs / img.height); x.drawImage(img, (W - img.width * k) / 2, qy + (qs - img.height * k) / 2, img.width * k, img.height * k); }
  else drawQr(x, await qrMatrix(payload), qx, qy, qs);
  x.fillStyle = '#111'; x.font = 'bold ' + font(54);
  x.fillText(amount > 0 ? '৳' + U.bn(Number(fmtAmount(amount)).toLocaleString('en-IN')) : 'টাকার পরিমাণ লিখে পেমেন্ট করুন', W / 2, 700);
  x.font = font(28); x.fillStyle = '#333';
  let y = 750;
  if (partyName) { x.fillText('প্রাপক দোকান: ' + (pr.shopName || '') + ' · প্রদানকারী: ' + partyName, W / 2, y); y += 44; }
  if (method.kind !== 'qr' && method.kind !== 'qrimg') { x.font = 'bold ' + font(34); x.fillText(detail(method, true).replace(/ · /g, '  '), W / 2, y); y += 48; }
  x.font = font(26);
  if (payable) { x.fillStyle = '#0b6e4f'; y = wrap(x, 'যেকোনো ব্যাংক/MFS অ্যাপে Bangla QR স্ক্যান করে পেমেন্ট করুন', W / 2, y, W - 80, 36); }
  else if (method.kind === 'qrimg') { x.fillStyle = '#9a6700'; y = wrap(x, 'দোকানের সেভ করা QR — স্ক্যান করে ওপরের টাকার পরিমাণ নিজে লিখুন', W / 2, y, W - 80, 36); }
  else { x.fillStyle = '#b42318'; y = wrap(x, 'এটি শুধু তথ্য কার্ড — পেমেন্ট QR নয়। এই নম্বরে Send Money / পেমেন্ট করুন।', W / 2, y, W - 80, 36); }
  x.fillStyle = '#888'; x.font = font(22); x.fillText('dFaster Note · পেমেন্ট পেলে দোকানদার খাতায় "পেলাম" লিখবেন', W / 2, H - 30);
  return {canvas: c, payable, payload};
}

// one SMS-friendly line with MFS numbers (bank accounts only if the owner opted in for that account)
function smsLine() {
  const ms = methods().filter(m => (m.kind === 'mfs' && m.number) || (m.kind === 'bank' && m.inSms && m.accNo));
  if (!ms.length) return '';
  const parts = ms.slice(0, 3).map(m => m.kind === 'mfs' ? `${(PROVIDERS[m.provider] || {name: m.provider}).name}${m.type === 'merchant' ? ' মার্চেন্ট' : m.type === 'agent' ? ' এজেন্ট' : ''} ${U.bn(m.number)}`
    : `${m.bank} ${m.accName ? m.accName + ' ' : ''}হিসাব ${U.bn(m.accNo)}${m.routing ? ' রাউটিং ' + U.bn(m.routing) : ''}`);
  return 'পেমেন্ট: ' + parts.join(', ');
}

window.Pay = {PROVIDERS, TYPES, methods, save, title, detail, mask, crc16, crcOk, parseTLV, parseEmv, withAmount, fmtAmount,
  qrMatrix, decodeImage, shrinkImage, fileToDataUrl, card, smsLine, pay};
})();
