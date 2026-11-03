// Exercises the real Firebase adapter in cloud.js against mocked @capacitor-firebase plugins:
// OTP registration on a "new phone" restores the shop profile and data saved in the account.
const p = require('/workspace/shotkit/node_modules/puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8231/app/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✔' : '✘', m); };
(async () => {
  const b = await p.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.setViewport({width: 390, height: 844, deviceScaleFactor: 2, isMobile: true});
  await pg.evaluateOnNewDocument(() => {
    const now = Date.now();
    const store = {   // what Firestore already holds for this phone's account
      'users/uid-777': {profile: {shopName: 'রহিম স্টোর', ownerName: 'রহিম', phone: '01811111111', verified: true}},
      'users/uid-777/parties/p1': {id: 'p1', type: 'customer', name: 'জামাল', phone: '01911111111', createdAt: now, updatedAt: now, deleted: 0},
      'users/uid-777/entries/e1': {id: 'e1', partyId: 'p1', kind: 'gave', amount: 2500, date: new Date().toISOString().slice(0, 10), note: '', createdAt: now, updatedAt: now, deleted: 0},
    };
    window.__fs = store; const L = {};
    const auth = {
      addListener: async (ev, fn) => { L[ev] = fn; return {remove() { delete L[ev]; }}; },
      signInWithPhoneNumber: async ({phoneNumber}) => { window.__otpTo = phoneNumber; setTimeout(() => L.phoneCodeSent({verificationId: 'vid-1'}), 50); },
      confirmVerificationCode: async ({verificationId, verificationCode}) => { if (verificationId !== 'vid-1' || verificationCode !== '123456') throw new Error('bad code'); return {user: {uid: 'uid-777', phoneNumber: '+8801811111111'}}; },
      getCurrentUser: async () => ({user: null}), signOut: async () => {},
    };
    const fsP = {
      getCollection: async ({reference, compositeFilter}) => { const since = compositeFilter.queryConstraints[0].value;
        return {snapshots: Object.keys(store).filter(k => k.startsWith(reference + '/') && k.split('/').length === reference.split('/').length + 1 && store[k].updatedAt > since).map(k => ({data: store[k]}))}; },
      writeBatch: async ({operations}) => operations.forEach(o => store[o.reference] = {...(store[o.reference] || {}), ...o.data}),
      setDocument: async ({reference, data}) => { store[reference] = {...(store[reference] || {}), ...data}; },
      getDocument: async ({reference}) => ({snapshot: {data: store[reference] || null}}),
    };
    window.Capacitor = {isNativePlatform: () => false, Plugins: {FirebaseAuthentication: auth, FirebaseFirestore: fsP}};
    Object.defineProperty(window, 'BK_FIREBASE', {configurable: true, get: () => ({enabled: true, projectId: 'test'}), set() {}});
  });
  await pg.goto(BASE, {waitUntil: 'networkidle0'});
  await pg.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('bakikhata'); q.onsuccess = q.onerror = q.onblocked = r; }));
  await pg.reload({waitUntil: 'networkidle0'});
  ok(await pg.$eval('#oGo', e => e.textContent.includes('OTP')), 'cloud on: registration asks for OTP');
  await pg.type('#oShop', 'নতুন দোকান'); await pg.type('#oOwner', 'রহিম'); await pg.type('#oPhone', '01811111111');
  await pg.click('#oGo'); await sleep(300);
  await pg.click('#otpSend'); await sleep(400);
  ok(await pg.evaluate(() => window.__otpTo) === '+8801811111111', 'OTP requested for +8801811111111');
  await pg.type('#otpC', '১২৩৪৫৬'); await pg.click('#otpOk'); await sleep(1200);
  ok(await pg.$eval('#onboard', e => e.classList.contains('hidden')), 'OTP verified, registration closed');
  ok((await pg.$eval('#shopTitle', e => e.textContent)) === 'রহিম স্টোর', 'account profile restored (রহিম স্টোর)');
  ok((await pg.$eval('#totRec', e => e.textContent)).includes('২,৫০০'), 'account data restored (পাবো ৳২,৫০০)');
  // a new entry on this phone is pushed to the account
  await pg.evaluate(async () => { await Book.saveEntry({partyId: 'p1', kind: 'got', amount: 500}); await Cloud.sync(); });
  const pushed = await pg.evaluate(() => Object.keys(window.__fs).filter(k => k.startsWith('users/uid-777/entries/')).length);
  ok(pushed === 2, 'new entry pushed to users/{uid}/entries');
  ok(await pg.evaluate(() => DB.meta.get('profile').verified === true), 'profile marked verified');
  ok(errs.length === 0, 'no JS errors ' + JSON.stringify(errs));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
