// অটো SMS + notifications, against a mocked Android bridge (BakiNative + LocalNotifications) driving the REAL app code.
const p = require('/workspace/shotkit/node_modules/puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8231/app/';
const OUT = process.env.OUT || '/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✔' : '✘', m); };
(async () => {
  const b = await p.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.emulateTimezone('Asia/Dhaka');
  await pg.setViewport({width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true});
  await pg.evaluateOnNewDocument(() => {
    const M = window.__m = {calls: [], sms: 'prompt', smsGrant: false, notif: 'prompt', notifGrant: 'denied', sysOn: false, fail: false, ...JSON.parse(sessionStorage.__m || '{}')};
    const rec = (n, a) => { M.calls.push({n, a: JSON.parse(JSON.stringify(a || {}))}); };
    const BakiNative = {
      checkPermissions: async () => (rec('checkPermissions'), {sms: M.sms, phone: 'granted'}),
      requestPermissions: async a => { rec('requestPermissions', a); if (M.smsGrant) M.sms = 'granted'; else M.sms = 'denied'; return {sms: M.sms}; },
      sendSms: async a => { rec('sendSms', a); if (M.sms !== 'granted') throw Object.assign(new Error('no'), {code: 'NO_PERMISSION'});
        const parts = a.body.length <= 70 ? 1 : Math.ceil(a.body.length / 67);
        return M.fail ? {status: 'failed', parts, code: 'RADIO_OFF'} : {status: 'sent', parts}; },
      composeSms: async a => rec('composeSms', a),
      listSims: async () => (rec('listSims'), {sims: [{subId: 3, slot: 0, name: 'GP', carrier: 'Grameenphone'}, {subId: 7, slot: 1, name: 'Robi', carrier: 'Robi'}], defaultSubId: 3}),
      notificationsEnabled: async () => ({enabled: M.sysOn}),
      openNotificationSettings: async () => rec('openNotificationSettings'),
      openAppSettings: async () => rec('openAppSettings'),
      openUrl: async a => rec('openUrl', a), shareFile: async a => rec('shareFile', {filename: a.filename, mime: a.mime, text: a.text}),
    };
    const LocalNotifications = {
      createChannel: async a => rec('createChannel', a),
      checkPermissions: async () => ({display: M.notif}),
      requestPermissions: async () => { rec('notifRequest'); M.notif = M.notifGrant; if (M.notif === 'granted') M.sysOn = true; return {display: M.notif}; },
      schedule: async a => rec('schedule', a), cancel: async a => rec('cancel', a),
    };
    window.Capacitor = {isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {BakiNative, LocalNotifications}};
  });
  const calls = n => pg.evaluate(n => __m.calls.filter(c => c.n === n), n);
  const setM = o => pg.evaluate(o => { Object.assign(__m, o); sessionStorage.__m = JSON.stringify({...JSON.parse(sessionStorage.__m || '{}'), ...o}); }, o);
  const txt = s => pg.$eval(s, e => e.textContent.trim());
  const click = async s => { await pg.waitForSelector(s, {visible: true}); await pg.click(s); await sleep(150); };
  const type = async (s, v) => { await pg.waitForSelector(s, {visible: true}); await pg.click(s, {clickCount: 3}); await pg.type(s, v); };
  const toast = () => pg.$eval('#toast', e => e.textContent);
  const sheetOpen = () => pg.$eval('#sheet', e => !e.classList.contains('hidden'));
  const log = () => pg.evaluate(() => DB.meta.get('smslog') || []);
  await pg.goto(BASE, {waitUntil: 'networkidle0'});
  await pg.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('bakikhata'); q.onsuccess = q.onerror = q.onblocked = r; }));
  await pg.reload({waitUntil: 'networkidle0'});

  // ---- setup + notification permission on first launch (HyperOS: denied → open system settings) ----
  ok((await calls('createChannel')).map(c => c.a.id).sort().join() === 'due,sms,sms_fail,sync', 'notification channels created: sms, sms_fail, sync, due');
  await type('#wName', 'রবিন'); await type('#wPhone', '01712345678'); await click('#wNext');
  await type('#wShop', 'রবিন স্টোর'); await click('#wSkip'); await sleep(1700);
  ok(await sheetOpen() && (await txt('#sheetCard')).includes('নোটিফিকেশন চালু করুন'), 'first launch: Bangla explanation before the notification permission');
  await pg.screenshot({path: OUT + '/notif-ask.png'});
  await click('#cfOk'); await sleep(400);
  ok((await calls('notifRequest')).length === 1, 'POST_NOTIFICATIONS requested');
  ok(await sheetOpen() && (await txt('#sheetCard')).includes('এখনও বন্ধ'), 'denied → offers the system notification settings');
  await click('#cfOk'); await sleep(200);
  ok((await calls('openNotificationSettings')).length === 1, 'opens app notification settings');
  await sleep(300);
  ok(!!(await pg.$('#hNotif')), 'home shows "notifications off" note');
  // user turns them on in system settings and comes back
  await setM({notif: 'granted', sysOn: true});
  await pg.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await sleep(500);
  ok(!(await pg.$('#hNotif')), 'back from settings with notifications on → note disappears');
  await pg.reload({waitUntil: 'networkidle0'}); await sleep(1300);
  ok(!(await sheetOpen()), 'no repeated notification prompt on next launch');

  // ---- customer with phone; first দিলাম → SMS explanation → permission denied → SMS app fallback ----
  await click('#quick [data-q=customer]'); await type('#pname', 'করিম'); await type('#pphone', '01711000000'); await click('#psave'); await sleep(300);
  await click('#bGave'); await type('#eamt', '1200'); await click('#esave'); await sleep(500);
  ok(await sheetOpen() && (await txt('#sheetCard')).includes('অটো SMS-এর অনুমতি'), 'first transaction: Bangla explanation for SEND_SMS');
  await pg.screenshot({path: OUT + '/sms-perm-ask.png'});
  await click('#cfOk'); await sleep(500);
  ok((await calls('requestPermissions')).length === 1, 'SEND_SMS requested once');
  let c = await calls('composeSms'); let l = await log();
  ok(c.length === 1 && c[0].a.body.includes('৳১,২০০') && l[0].status === 'opened', 'permission denied → SMS app opened with the text (logged "opened")');
  await click('#bGot'); await type('#eamt', '200'); await click('#esave'); await sleep(500);
  ok((await calls('requestPermissions')).length === 1 && (await calls('composeSms')).length === 2, 'denied: not asked again, falls back to SMS app');

  // ---- grant from settings, SIM picker ----
  await pg.evaluate(() => BK.go('#/settings')); await sleep(400);
  ok((await txt('#sSmsPerm')).includes('অনুমতি নেই') && await pg.$eval('#sAuto', e => e.checked), 'settings: অটো SMS ON by default, shows missing permission');
  await setM({smsGrant: true}); await click('#sSmsAsk'); await sleep(200); await click('#cfOk'); await sleep(500);
  ok((await txt('#sSmsPerm')).includes('অনুমতি আছে'), 'permission granted from settings');
  ok((await txt('#sNotif')).includes('চালু আছে'), 'notification status row: চালু আছে');
  await click('#sSim'); await sleep(300); await click('[data-sim="7"]'); await sleep(400);
  ok((await txt('#sSim')).includes('সিম ২') && (await txt('#sSim')).includes('Robi'), 'dual SIM: picked SIM 2 (Robi)');
  await pg.screenshot({path: OUT + '/settings-sms.png', fullPage: true});

  // ---- silent send ----
  await pg.evaluate(() => BK.go('#/parties/customer')); await sleep(200); await click('#plist [data-party]');
  await click('#bGot'); await type('#eamt', '300'); await click('#esave'); await sleep(700);
  c = await calls('sendSms'); l = await log();
  ok(c.length === 1 && c[0].a.subId === 7 && c[0].a.phone === '01711000000' && c[0].a.body.includes('৳৩০০'), 'পেলাম → SMS sent silently via SmsManager from SIM 2');
  ok(l[0].status === 'sent' && (await toast()).includes('SMS পাঠানো হয়েছে'), 'toast "SMS পাঠানো হয়েছে" + log sent');
  ok((await calls('schedule')).some(x => x.a.notifications[0].channelId === 'sms'), 'notification on channel sms');
  ok(!(await sheetOpen()), 'no sheet / no SMS app for auto SMS');
  ok((await pg.$$eval('#ledBody .smsb.sent', e => e.length)) >= 1, 'ledger row shows "SMS গেছে" badge');
  // edit → সংশোধিত
  let rows = await pg.$$('#ledBody tr[data-entry]'); await rows[0].click(); await sleep(250);
  ok((await txt('#sheetCard')).includes('SMS গেছে'), 'edit form shows SMS status');
  await type('#eamt', '350'); await click('#esave'); await sleep(700);
  c = await calls('sendSms'); ok(c.length === 2 && c[1].a.body.startsWith('সংশোধিত') && c[1].a.body.includes('৳৩৫০'), 'edit → "সংশোধিত হিসাব" SMS');
  // no change (note only) → no SMS
  rows = await pg.$$('#ledBody tr[data-entry]'); await rows[0].click(); await sleep(250); await type('#enote', 'নোট'); await click('#esave'); await sleep(600);
  ok((await calls('sendSms')).length === 2, 'note-only edit → no SMS');
  // delete → বাতিল
  rows = await pg.$$('#ledBody tr[data-entry]'); await rows[0].click(); await sleep(250); await click('#edel'); await click('#cfOk'); await sleep(700);
  c = await calls('sendSms'); ok(c.length === 3 && c[2].a.body.includes('বাতিল'), 'delete → cancellation SMS');
  // failure
  await setM({fail: true}); await click('#bGave'); await type('#eamt', '50'); await click('#esave'); await sleep(700);
  l = await log(); ok(l[0].status === 'failed' && (await toast()).includes('SMS যায়নি'), 'failure → toast "SMS যায়নি" + log failed: ' + l[0].error);
  ok((await calls('schedule')).some(x => x.a.notifications[0].channelId === 'sms_fail'), 'failure notification (sms_fail)');
  ok((await pg.$$eval('#ledBody .smsb.failed', e => e.length)) === 1, 'ledger badge "SMS যায়নি"');
  await setM({fail: false});
  await pg.evaluate(() => BK.go('#/smslog')); await sleep(300);
  await pg.screenshot({path: OUT + '/smslog.png'});
  await click('[data-resend]'); await sleep(700);
  l = await log(); ok(l[0].status === 'sent' && l[0].kind === 'resend', 'SMS log → আবার পাঠান works');
  // multipart: long note-less sale with many items is still one SMS body; force a long body via a long party name
  await pg.evaluate(async () => { const pp = await Book.saveParty({type: 'customer', name: 'অনেক লম্বা নামের কাস্টমার মোহাম্মদ আব্দুল করিম মিয়া সাহেব', phone: '01722000000'}); window.__pp = pp.id; });
  await pg.evaluate(() => BK.go('#/party/' + __pp)); await sleep(300);
  await click('#bGave'); await type('#eamt', '999'); await click('#esave'); await sleep(700);
  l = await log(); ok(l[0].status === 'sent' && l[0].parts >= 2, `multipart Bangla SMS (${l[0].parts} parts)`);
  // no phone → skipped
  await pg.evaluate(async () => { const pp = await Book.saveParty({type: 'customer', name: 'নম্বরহীন'}); window.__np = pp.id; });
  await pg.evaluate(() => BK.go('#/party/' + __np)); await sleep(300);
  const before = (await calls('sendSms')).length;
  await click('#bGave'); await type('#eamt', '10'); await click('#esave'); await sleep(500);
  l = await log(); ok((await calls('sendSms')).length === before && l[0].status === 'nophone' && !(await sheetOpen()), 'party without phone → skipped (logged)');
  // supplier purchase
  await pg.evaluate(() => BK.go('#/trade/purchase')); await sleep(300); await click('#tDue');
  await pg.select('#tparty', '__new'); await sleep(200); await type('#qn', 'রহমান ট্রেডার্স'); await type('#qp', '01811111111'); await click('#qs'); await sleep(200);
  await type('#ttotal', '2000'); await click('#tsave'); await sleep(800);
  c = await calls('sendSms'); ok(c[c.length - 1].a.phone === '01811111111' && c[c.length - 1].a.body.includes('কেনা'), 'purchase from supplier → SMS to supplier');
  // due sale → SMS + payment QR auto
  await pg.evaluate(() => Pay.save([{id: 'k', kind: 'mfs', provider: 'nagad', type: 'personal', number: '01712345678'}], 'k'));
  await pg.evaluate(() => BK.go('#/home')); await sleep(200);
  await click('#quick [data-q=sale-due]');
  const kid = await pg.$$eval('#tparty option', o => o.find(x => x.textContent.trim().startsWith('করিম')).value);
  await pg.select('#tparty', kid); await type('#ttotal', '400'); await click('#tsave'); await sleep(1200);
  c = await calls('sendSms'); ok(c[c.length - 1].a.body.includes('বিক্রয়') && c[c.length - 1].a.body.includes('নগদ ০১৭১২৩৪৫৬৭৮'), 'due sale → SMS with Nagad payment line');
  ok(!!(await pg.$('#pqImg')), 'due sale → payment QR opens automatically');
  await sleep(500); await click('#pqWa'); await sleep(300);
  const sh = await calls('shareFile'); ok(sh.length && sh[sh.length - 1].a.mime === 'image/png' && sh[sh.length - 1].a.text.includes('নগদ'), 'QR shared as PNG with text (WhatsApp/share)');
  await pg.evaluate(() => BK.closeSheet());
  // auto off → prompt
  await pg.evaluate(() => BK.go('#/settings')); await sleep(300); await click('#sAuto'); await sleep(300);
  await pg.evaluate(() => BK.go('#/party/' + __pp)); await sleep(300);
  const n0 = (await calls('sendSms')).length;
  await click('#bGot'); await type('#eamt', '5'); await click('#esave'); await sleep(500);
  ok((await calls('sendSms')).length === n0 && await sheetOpen() && !!(await pg.$('#smsT')), 'অটো SMS off → manual SMS prompt instead');
  await pg.evaluate(() => BK.closeSheet());
  // due reminder schedule
  await sleep(1500);
  const sc = (await calls('schedule')).filter(x => x.a.notifications[0].id === 7001);
  ok(sc.length && sc[sc.length - 1].a.notifications[0].channelId === 'due' && sc[sc.length - 1].a.notifications[0].body.includes('৳'), 'daily due reminder scheduled (id 7001, channel due): ' + (sc.length ? sc[sc.length - 1].a.notifications[0].body : ''));
  ok(errs.length === 0, 'no JS errors ' + JSON.stringify(errs));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
