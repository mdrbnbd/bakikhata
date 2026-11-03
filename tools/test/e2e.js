// End-to-end test of the web UI in headless Chrome (mobile viewport). Usage: node e2e.js [baseUrl]
const p = require('/workspace/shotkit/node_modules/puppeteer-core');
const fs = require('fs');
const BASE = process.argv[2] || 'http://127.0.0.1:8231/app/';
const OUT = process.env.OUT || '/workspace/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✔', m); } else { fail++; console.log('✘', m); } };
(async () => {
  const b = await p.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const pg = await b.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.emulateTimezone('Asia/Dhaka');
  await pg.setViewport({width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
  await pg.goto(BASE, {waitUntil: 'networkidle0'});
  await pg.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('bakikhata'); q.onsuccess = q.onerror = q.onblocked = r; }));
  await pg.reload({waitUntil: 'networkidle0'});
  const txt = s => pg.$eval(s, e => e.textContent.trim());
  const click = async s => { await pg.waitForSelector(s, {visible: true}); await pg.click(s); await sleep(150); };
  const type = async (s, v) => { await pg.waitForSelector(s, {visible: true}); await pg.click(s, {clickCount: 3}); await pg.type(s, v); };
  const shot = async f => { await pg.$eval('#toast', e => { e.style.transition = 'none'; e.classList.remove('show'); }); await sleep(400); await pg.screenshot({path: OUT + f}); await pg.$eval('#toast', e => e.style.transition = ''); };
  const sheetOpen = () => pg.$eval('#sheet', e => !e.classList.contains('hidden'));
  // capture shared files (PDF / backup) instead of downloading
  await pg.evaluate(() => { window.__files = []; Native.shareFile = async (name, mime, b64) => { window.__files.push({name, mime, b64}); }; });

  // 1. registration
  ok(await pg.$eval('#onboard', e => !e.classList.contains('hidden')), 'registration screen shown on first launch');
  // setup wizard: 1 পরিচয় → 2 দোকান → 3 পেমেন্ট (skip) → 4 done
  ok(await pg.$('#onboard .wsteps') !== null, 'profile setup wizard shown (step indicator)');
  await type('#wName', 'রবিন'); await type('#wPhone', '01712345678'); await click('#wNext'); await sleep(200);
  await type('#wShop', 'মায়ের দোয়া স্টোর'); await click('#wType [data-v="মুদি দোকান"]'); await type('#wAddr', 'কাওরান বাজার, ঢাকা'); await click('#wNext'); await sleep(200);
  ok(await pg.$('#wMfs') !== null, 'wizard step 3: payment methods');
  await click('#wMfs'); await click('#mfP [data-v=bkash]'); await click('#mfT [data-v=personal]'); await type('#mfN', '01712345678'); await click('#mfS'); await sleep(300);
  ok((await pg.$$('#onboard .pm')).length === 1, 'wizard: bKash number added in step 3');
  await click('#wNext'); await sleep(200);
  ok((await txt('#onboard h2')).includes('৮৬%'), 'wizard done: completion 86% (photo missing) — ' + await txt('#onboard h2'));
  await click('#wNext'); await sleep(300);
  ok(await pg.$eval('#onboard', e => e.classList.contains('hidden')), 'registration saved locally (cloud off)');
  ok((await txt('#shopTitle')) === 'মায়ের দোয়া স্টোর', 'shop name in header');
  ok((await pg.$$('#bottomNav button')).length === 6 && !(await pg.$('[data-nav=back]')), 'bottom nav: 6 items, no পেছনে button');
  ok((await pg.$$('#quick .tile svg use')).length === 8 && (await pg.$$('#bottomNav svg use')).length === 6, 'SVG icons in quick tiles and bottom nav');
  ok(await pg.$eval('[data-nav=home]', e => e.classList.contains('on')), 'active nav highlight on হোম');
  ok(await pg.evaluate(() => !/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(document.querySelector('#quick').textContent + document.querySelector('#bottomNav').textContent + document.querySelector('.top').textContent)), 'no emoji in quick grid, nav, header');

  // 2. customer with opening due
  await click('#quick [data-q=customer]');
  await type('#pname', 'করিম মিয়া'); await type('#pphone', '০১৭১১০০০০০০'); await type('#popen', '500');
  await click('#psave'); await sleep(300);
  ok((await txt('#pbal')).includes('৫০০'), 'customer created with opening due ৳৫০০ (Bangla digits in phone accepted)');
  // 3. দিলাম 1200 → SMS offer
  await click('#bGave'); await type('#eamt', '1200'); await type('#enote', 'চাল ও ডাল'); await click('#esave'); await sleep(300);
  ok(await sheetOpen(), 'SMS offer sheet after দিলাম');
  const sms1 = await pg.$eval('#smsT', e => e.value); console.log('   SMS:', sms1);
  ok(sms1.includes('৳১,২০০') && sms1.includes('মোট বাকি: ৳১,৭০০') && sms1.includes('মায়ের দোয়া স্টোর'), 'SMS has amount, new balance, shop name');
  await shot('bakikhata-sms.png');
  await click('#sheetCard [data-close].btn');
  // 4. পেলাম 700 (cash)
  await click('#bGot'); await type('#eamt', '৭০০');
  ok(await pg.$eval('#ecash', e => e.checked), 'পেলাম defaults to cashbox');
  await click('#esave'); await sleep(300); await click('#sheetCard [data-close].btn');
  ok((await txt('#pbal')).includes('১,০০০'), 'running balance ৳১,০০০ after দিলাম/পেলাম');
  const rows = await pg.$$eval('#ledBody tr', r => r.length); ok(rows === 3, 'ledger shows 3 entries');
  await shot('bakikhata-ledger.png');
  // 5. cash sale 350 (no party)
  await click('[data-nav=home]'); await click('#quick [data-q=sale-cash]');
  await type('#ttotal', '350'); await click('#tsave'); await sleep(300);
  ok(!(await sheetOpen()), 'cash sale without customer: no SMS prompt');
  // 6. due sale with items + partial payment
  await click('#quick [data-q=sale-due]');
  const kid = await pg.$$eval('#tparty option', o => o.find(x => x.textContent.includes('করিম')).value);
  await pg.select('#tparty', kid);
  await pg.$eval('#titems', d => d.open = true);
  await click('#iadd'); await pg.type('#irows .it:last-child [data-f=name]', 'চাল'); await pg.click('#irows .it:last-child [data-f=qty]', {clickCount: 3}); await pg.type('#irows .it:last-child [data-f=qty]', '2'); await pg.type('#irows .it:last-child [data-f=price]', '80');
  ok((await pg.$eval('#ttotal', e => e.value)) === '160', 'item list auto-totals ৳১৬০');
  await type('#tpaid', '60'); await click('#tsave'); await sleep(300);
  const sms2 = await pg.$eval('#smsT', e => e.value); console.log('   SMS:', sms2);
  ok(sms2.includes('বাকি ৳১০০') && sms2.includes('মোট বাকি: ৳১,১০০'), 'due-sale SMS: due ৳১০০, balance ৳১,১০০');
  ok(sms2.includes('পেমেন্ট') && sms2.includes('বিকাশ'), 'due SMS includes payment info (bKash)');
  await click('#sheetCard [data-close].btn'); await sleep(400);
  // a due sale auto-opens the payment QR with the new due
  ok(await pg.$('#pqImg') !== null, 'payment QR sheet opens automatically after a due sale');
  await pg.waitForFunction(() => document.querySelector('#pqImg') && document.querySelector('#pqImg').src.startsWith('data:image/png'), {timeout: 10000});
  ok((await pg.$eval('#pqAmt', e => e.value)) === '1100' && (await txt('#pqNote')).includes('তথ্য কার্ড'), 'QR card: amount ৳1100, labelled as info card (not a payment QR)');
  await shot('bakikhata-payqr.png');
  await pg.evaluate(() => BK.closeSheet()); await sleep(200);
  // 7. supplier + due purchase
  await click('[data-nav=trade]'); await click('.tabs [data-t=purchase]'); await click('#tDue');
  await pg.select('#tparty', '__new'); await sleep(200);
  await type('#qn', 'রহমান ট্রেডার্স'); await type('#qp', '01811111111'); await click('#qs'); await sleep(200);
  await type('#ttotal', '2000'); await click('#tsave'); await sleep(300);
  if (await sheetOpen()) await click('#sheetCard [data-close].btn');
  // 8. expense
  await click('[data-nav=cash]'); await click('#cAddExp'); await type('#camt', '150'); await pg.select('#ccat', 'বিদ্যুৎ বিল'); await click('#csave'); await sleep(300);
  ok((await txt('#cHand')).includes('৯৬০'), 'cash in hand ৳৯৬০ (700+350+60−150)');
  ok((await txt('#cExp')).includes('১৫০'), 'today expense ৳১৫০');
  // 9. dashboard
  await click('[data-nav=home]');
  ok((await txt('#totRec')).includes('১,১০০'), 'dashboard পাবো ৳১,১০০');
  ok((await txt('#totPay')).includes('২,০০০'), 'dashboard দেবো ৳২,০০০');
  ok((await txt('#todaySale')).includes('৫১০'), 'today sale ৳৫১০');
  await shot('bakikhata-home.png');
  // tagada
  await click('#quick [data-q=remind]'); await click('#ppl [data-party]');
  const rem = await pg.$eval('#smsT', e => e.value); console.log('   তাগাদা:', rem);
  ok(rem.includes('৳১,১০০') && rem.includes('পরিশোধ'), 'তাগাদা SMS text');
  await click('#sheetCard [data-close].btn');
  // 10. report + PDF
  await click('[data-nav=reports]');
  ok((await txt('#rSale')).includes('৫১০'), 'report sales ৳৫১০');
  ok((await txt('#rProfit')).includes('১,৬৪০'), 'report profit −৳১,৬৪০ (510−2000−150)');
  await click('#rPdf'); await pg.waitForFunction(() => window.__files.length > 0, {timeout: 30000});
  const pdf = await pg.evaluate(() => window.__files.pop());
  fs.writeFileSync(OUT + 'bakikhata-report.pdf', Buffer.from(pdf.b64, 'base64'));
  ok(pdf.mime === 'application/pdf' && Buffer.from(pdf.b64, 'base64').slice(0, 4).toString() === '%PDF', 'PDF generated: ' + pdf.name);
  await pg.evaluate(() => document.documentElement.dataset.theme = 'dark'); await sleep(200);
  await shot('bakikhata-report-dark.png');
  await pg.evaluate(() => document.documentElement.dataset.theme = 'light');
  // 11. backup export
  await click('#setBtn'); await click('#sExport'); await sleep(300);
  const bk = await pg.evaluate(() => window.__files.pop());
  const json = JSON.parse(Buffer.from(bk.b64, 'base64').toString('utf8'));
  fs.writeFileSync('/tmp/bk-backup.json', JSON.stringify(json));
  ok(json.app === 'bakikhata' && json.data.parties.length === 2 && json.data.txns.length === 3, `backup JSON: ${json.data.parties.length} parties, ${json.data.entries.length} entries, ${json.data.txns.length} txns, ${json.data.cash.length} cash`);
  // 12. sync engine with an in-memory cloud (stand-in for Firestore)
  const sync = await pg.evaluate(async () => {
    const cloud = {}; const col = (u, s) => (cloud[u + '/' + s] = cloud[u + '/' + s] || new Map());
    Cloud._setAdapter({name: 'mem', pull: async (u, s, since) => [...col(u, s).values()].filter(r => r.updatedAt > since).map(r => ({...r})),
      push: async (u, s, rows) => rows.forEach(({dirty, ...r}) => col(u, s).set(r.id, r)), putAccount: async () => {}, getAccount: async () => null,
      signOut: async () => {}});
    await DB.meta.set('cloudUser', {uid: 'u1', phone: '+8801712345678'});
    const a = await Cloud.sync();
    const dirtyLeft = DB.SYNCED.reduce((n, s) => n + DB.dirty(s).length, 0);
    // simulate a new phone: wipe local, sign in again, full pull
    await DB.wipe(); await DB.meta.set('cloudUser', {uid: 'u1'});
    const b2 = await Cloud.sync(true);
    const res = {a, dirtyLeft, b: b2, parties: DB.list('parties').length, bal: Book.totals()};
    await DB.meta.set('cloudUser', null); Cloud._setAdapter(null);
    return res;
  });
  console.log('   sync:', JSON.stringify(sync));
  ok(sync.a.pushed > 0 && sync.dirtyLeft === 0 && sync.parties === 2 && sync.bal.receivable === 1100, 'sync engine: push all, wipe, full pull restores balances (new-phone flow)');
  // 13. restore from backup file after wiping (offline path)
  await pg.evaluate(() => DB.wipe()); await pg.reload({waitUntil: 'networkidle0'});
  ok(await pg.$eval('#onboard', e => !e.classList.contains('hidden')), 'after wipe: registration again');
  const [fc] = await Promise.all([pg.waitForFileChooser(), pg.click('#oRestore')]);
  await fc.accept(['/tmp/bk-backup.json']); await sleep(800);
  ok(await pg.$eval('#onboard', e => e.classList.contains('hidden')), 'restore from backup file closes registration');
  ok((await txt('#totRec')).includes('১,১০০') && (await txt('#shopTitle')) === 'মায়ের দোয়া স্টোর', 'restored balances and shop profile');
  // 14. PIN lock
  await click('#setBtn'); await click('#sPin');
  for (const d of '2580') await pg.click(`#pad [data-n="${d}"]`); await sleep(200);
  for (const d of '2580') await pg.click(`#pad [data-n="${d}"]`); await sleep(400);
  await pg.reload({waitUntil: 'networkidle0'});
  ok(await pg.$eval('#lock', e => !e.classList.contains('hidden')), 'PIN lock shown on start');
  for (const d of '1111') await pg.click(`#pad [data-n="${d}"]`); await sleep(500);
  ok(await pg.$eval('#lock', e => !e.classList.contains('hidden')), 'wrong PIN rejected');
  for (const d of '2580') await pg.click(`#pad [data-n="${d}"]`); await sleep(500);
  ok(await pg.$eval('#lock', e => e.classList.contains('hidden')), 'correct PIN unlocks');
  // 15. edit + delete entry keeps balances consistent
  await pg.evaluate(() => BK.go('#/parties/customer')); await sleep(200); await click('#plist [data-party]');
  const before = await txt('#pbal');
  await click('#ledBody tr[data-entry]'); // newest = due sale → opens sale form
  ok(await pg.$('#ttotal') !== null, 'tapping a sale-linked ledger row opens the sale');
  await click('#sheetCard [data-close]').catch(() => {}); await pg.evaluate(() => BK.closeSheet());

  // edit দিলাম 1200 → 1000, then delete পেলাম 700 (and its cash row)
  await pg.evaluate(() => BK.go('#/parties/customer')); await sleep(200); await click('#plist [data-party]');
  let rowsE = await pg.$$('#ledBody tr[data-entry]');
  await rowsE[2].click(); await sleep(200);
  ok((await pg.$eval('#eamt', e => e.value)) === '1200', 'entry form opens with old amount');
  await type('#eamt', '1000'); await click('#esave'); await sleep(300);
  if (await sheetOpen()) await pg.evaluate(() => BK.closeSheet()); await sleep(200);
  ok((await txt('#pbal')).includes('৯০০'), 'edited entry → balance ৳৯০০');
  rowsE = await pg.$$('#ledBody tr[data-entry]'); await rowsE[1].click(); await sleep(200);
  await click('#edel'); await click('#cfOk'); await sleep(400);
  ok(await sheetOpen() && (await pg.$eval('#smsT', e => e.value)).includes('বাতিল'), 'delete → cancellation SMS offered');
  await pg.evaluate(() => BK.closeSheet()); await sleep(200);
  ok((await txt('#pbal')).includes('১,৬০০'), 'deleted পেলাম → balance ৳১,৬০০');
  await click('[data-nav=home]');
  ok((await txt('#cashHand')).includes('২৬০'), 'linked cash row removed too (cash ৳২৬০)');
  console.log('   balance before edits', before);
  console.log('errors', errs);
  ok(errs.length === 0, 'no JS errors');
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
