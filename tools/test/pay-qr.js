// Bangla QR (EMVCo) tests: build a sample merchant QR, embed the due amount (tag 54), recompute CRC,
// render it with the bundled QR generator, decode it back with jsQR and verify. Also checks the info card + image upload path.
const p = require('/workspace/shotkit/node_modules/puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8231/app/';
const OUT = process.env.OUT || '/tmp';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✔' : '✘', m); };
(async () => {
  const b = await p.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(BASE, {waitUntil: 'networkidle0'});
  const r = await pg.evaluate(async () => {
    const tlv = (t, v) => t + String(v.length).padStart(2, '0') + v;
    const body = tlv('00', '01') + tlv('01', '11') + tlv('26', tlv('00', 'bd.gov.bb') + tlv('01', '0123456789012')) + tlv('52', '5411') + tlv('53', '050') + tlv('58', 'BD') + tlv('59', 'MAYER DOA STORE') + tlv('60', 'DHAKA') + '6304';
    const sample = body + Pay.crc16(body);
    const out = {sample, sampleOk: Pay.crcOk(sample), parsed: Pay.parseEmv(sample)};
    // known vector: CRC-16/CCITT-FALSE("123456789") = 29B1
    out.vector = Pay.crc16('123456789');
    const withAmt = Pay.withAmount(sample, 1250.5);
    out.withAmt = withAmt; out.withOk = Pay.crcOk(withAmt); out.p2 = Pay.parseEmv(withAmt);
    out.tags = out.p2.fields.map(f => f.tag).join(',');
    out.again = Pay.withAmount(withAmt, 300);            // replacing an existing amount
    out.p3 = Pay.parseEmv(out.again);
    out.cleared = Pay.parseEmv(Pay.withAmount(withAmt, 0));
    const bad = withAmt.slice(0, -1) + (withAmt.slice(-1) === '0' ? '1' : '0'); out.badRejected = Pay.parseEmv(bad) === null;
    out.notEmv = Pay.parseEmv('upi://pay?pa=x') === null;
    // render: QR matrix → canvas → PNG → jsQR decode
    const c = await Pay.card({id: 'q', kind: 'qr', payload: sample, merchant: 'MAYER DOA STORE', city: 'DHAKA'}, 1250.5, {partyName: 'করিম'});
    out.payable = c.payable; out.cardPayload = c.payload;
    out.decoded = await Pay.decodeImage(c.canvas.toDataURL('image/png'));
    out.png = c.canvas.toDataURL('image/png');
    // info card for an MFS number is NOT payable and says so
    const m = await Pay.card({id: 'm', kind: 'mfs', provider: 'bkash', type: 'personal', number: '01712345678'}, 500);
    out.mfsPayable = m.payable; out.mfsDecoded = await Pay.decodeImage(m.canvas.toDataURL('image/png'));
    out.mfsPng = m.canvas.toDataURL('image/png');
    // uploaded photo of a QR (scaled, with margin) decodes too
    const mat = await Pay.qrMatrix(sample), n = mat.n, cv = document.createElement('canvas'); cv.width = cv.height = 900;
    const x = cv.getContext('2d'); x.fillStyle = '#ddd'; x.fillRect(0, 0, 900, 900); x.fillStyle = '#fff'; x.fillRect(120, 120, 660, 660); x.fillStyle = '#000';
    const s = Math.floor(500 / n), o = Math.round(450 - s * n / 2); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (mat.dark(i, j)) x.fillRect(o + j * s, o + i * s, s, s);
    out.photoDecoded = await Pay.decodeImage(cv.toDataURL('image/jpeg', 0.8));
    // SMS payment line: bank number only with inSms
    await DB.meta.set('profile', {shopName: 'X', pay: {methods: [{id: 'b', kind: 'bank', bank: 'DBBL', accNo: '1234567890123', inSms: false}, {id: 'k', kind: 'mfs', provider: 'bkash', type: 'merchant', number: '01712345678'}], defaultId: 'b'}});
    out.line1 = Pay.smsLine();
    await DB.meta.set('profile', {shopName: 'X', pay: {methods: [{id: 'b', kind: 'bank', bank: 'DBBL', accNo: '1234567890123', inSms: true}], defaultId: 'b'}});
    out.line2 = Pay.smsLine();
    return out;
  });
  const fs = require('fs');
  fs.writeFileSync(OUT + '/qr-bangla-card.png', Buffer.from(r.png.split(',')[1], 'base64'));
  fs.writeFileSync(OUT + '/qr-info-card.png', Buffer.from(r.mfsPng.split(',')[1], 'base64'));
  console.log('   sample :', r.sample); console.log('   amount :', r.withAmt);
  ok(r.vector === '29B1', 'CRC16-CCITT-FALSE known vector 123456789 → 29B1');
  ok(r.sampleOk && r.parsed && r.parsed.merchant === 'MAYER DOA STORE' && !r.parsed.dynamic, 'sample Bangla QR parses (static, merchant, CRC ok)');
  ok(r.withOk && r.p2.amount === '1250.50' && r.p2.dynamic && r.p2.currency === '050', 'tag 54 = 1250.50 embedded, tag 01 = 12 (dynamic), CRC recomputed and valid');
  ok(/,53,54,58,/.test(r.tags) && r.tags.endsWith(',63'), 'tag 54 placed after 53, CRC (63) last: ' + r.tags);
  ok(r.p3.amount === '300' || r.p3.amount === '300.00', 'existing amount replaced (' + r.p3.amount + ')');
  ok(r.cleared && !r.cleared.amount && !r.cleared.dynamic, 'amount 0 → static QR without tag 54');
  ok(r.badRejected && r.notEmv, 'corrupted CRC / non-EMVCo payloads rejected');
  ok(r.payable && r.decoded === r.cardPayload && r.decoded === r.withAmt, 'rendered QR card decodes back (jsQR) to the exact payload');
  ok(Pay_crc(r.decoded), 'decoded payload CRC verified independently in Node');
  ok(r.mfsPayable === false && r.mfsDecoded && !r.mfsDecoded.startsWith('000201'), 'MFS info card: not payable, QR is plain info text: ' + JSON.stringify(r.mfsDecoded));
  ok(r.photoDecoded === r.sample, 'uploaded QR photo (JPEG, margins) decodes to the saved payload');
  ok(!r.line1.includes('1234567890123') && r.line1.includes('বিকাশ'), 'SMS payment line hides bank account unless opted in: ' + r.line1);
  ok(r.line2.includes('১২৩৪৫৬৭৮৯০১২৩') || r.line2.includes('1234567890123'), 'bank account in SMS only when owner opts in: ' + r.line2);
  ok(errs.length === 0, 'no JS errors ' + JSON.stringify(errs));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
// independent CRC check (Node)
function Pay_crc(s) {
  const body = s.slice(0, -4); let crc = 0xFFFF;
  for (const byte of Buffer.from(body, 'utf8')) { crc ^= byte << 8; for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF; }
  return crc.toString(16).toUpperCase().padStart(4, '0') === s.slice(-4);
}
