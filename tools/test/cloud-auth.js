// Login + full cloud restore, against mocked @capacitor-firebase plugins (Auth + Firestore) driving the REAL cloud.js/app.js.
// The mock backend lives in localStorage so it survives "fresh install" (IndexedDB wipe + reload), like Firebase would.
// The mock Firestore also enforces the shape checks of firebase/firestore.rules (owner-only paths, allowed keys).
const p = require('/workspace/shotkit/node_modules/puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8231/app/';
const OUT = process.env.OUT || '/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '✔' : '✘', m); };
const PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(3000);

(async () => {
  const b = await p.launch({executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox']});
  const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.setViewport({width: 390, height: 844, deviceScaleFactor: 2, isMobile: true});
  await pg.evaluateOnNewDocument(() => {
    const K = '__mockfb', load = () => JSON.parse(localStorage.getItem(K) || '{"users":{},"docs":{},"cur":null,"seq":0,"log":[]}');
    const save = st => localStorage.setItem(K, JSON.stringify(st));
    const err = (code, message) => Object.assign(new Error(message || code), {code});
    const L = {};
    const pub = (st, uid) => { const u = st.users[uid]; return u && {uid, phoneNumber: u.phone || null, email: u.email || null, displayName: u.name || null,
      providerData: u.providers.map(providerId => ({providerId}))}; };
    const auth = {
      addListener: async (ev, fn) => { L[ev] = fn; return {remove() { delete L[ev]; }}; },
      signInWithPhoneNumber: async ({phoneNumber}) => { const st = load(); st.pendingPhone = phoneNumber; st.log.push('sms:' + phoneNumber); save(st); setTimeout(() => L.phoneCodeSent({verificationId: 'vid-' + phoneNumber}), 30); },
      confirmVerificationCode: async ({verificationId, verificationCode}) => {
        const st = load(); if (verificationId !== 'vid-' + st.pendingPhone || verificationCode !== '123456') throw err('auth/invalid-verification-code');
        let uid = Object.keys(st.users).find(u => st.users[u].phone === st.pendingPhone);
        if (!uid) { uid = 'uid-' + (++st.seq); st.users[uid] = {phone: st.pendingPhone, providers: ['phone']}; }
        st.cur = uid; save(st); return {user: pub(st, uid)};
      },
      signInWithEmailAndPassword: async ({email, password}) => {
        const st = load(); const uid = Object.keys(st.users).find(u => st.users[u].email === email);
        if (!uid || st.users[uid].password !== password) throw err('auth/invalid-credential', 'The supplied auth credential is incorrect');
        st.cur = uid; save(st); return {user: pub(st, uid)};
      },
      signInWithGoogle: async () => {
        const st = load(); let uid = Object.keys(st.users).find(u => st.users[u].google === 'robin@gmail.com');
        if (!uid) { uid = 'uid-' + (++st.seq); st.users[uid] = {google: 'robin@gmail.com', email: 'robin@gmail.com', name: 'Robin', providers: ['google.com']}; }
        st.cur = uid; save(st); return {user: pub(st, uid)};
      },
      linkWithEmailAndPassword: async ({email, password}) => {
        const st = load(); if (!st.cur) throw err('auth/no-current-user');
        if (Object.keys(st.users).some(u => u !== st.cur && st.users[u].email === email)) throw err('auth/email-already-in-use');
        Object.assign(st.users[st.cur], {email, password}); st.users[st.cur].providers.push('password'); save(st); return {user: pub(st, st.cur)};
      },
      updatePassword: async ({newPassword}) => { const st = load(); st.users[st.cur].password = newPassword; save(st); },
      getCurrentUser: async () => { const st = load(); return {user: st.cur ? pub(st, st.cur) : null}; },
      signOut: async () => { const st = load(); st.cur = null; save(st); },
    };
    // ---- Firestore + the checks firestore.rules makes ----
    const STORES = ['parties', 'entries', 'txns', 'cash', 'products'];
    function allow(st, path, data) {
      const seg = path.split('/'); if (seg[0] !== 'users' || seg[1] !== st.cur) throw err('permission-denied', 'not owner: ' + path);
      if (seg.length === 2 && data) { const bad = Object.keys(data).filter(k => !['profile', 'settings', 'updatedAt'].includes(k)); if (bad.length) throw err('permission-denied', 'keys ' + bad); }
      if (seg.length === 4) { if (!STORES.includes(seg[2])) throw err('permission-denied', 'store ' + seg[2]);
        if (data && (data.id !== seg[3] || typeof data.updatedAt !== 'number' || ![0, 1].includes(data.deleted) || 'dirty' in data)) throw err('permission-denied', 'row ' + path); }
      if (seg.length !== 2 && seg.length !== 4 && seg.length !== 3) throw err('permission-denied', path);
    }
    const fsP = {
      getCollection: async ({reference, compositeFilter}) => { const st = load(); allow(st, reference + '/x'); const since = compositeFilter.queryConstraints[0].value;
        return {snapshots: Object.keys(st.docs).filter(k => k.startsWith(reference + '/') && k.split('/').length === reference.split('/').length + 1 && st.docs[k].updatedAt > since).map(k => ({data: st.docs[k]}))}; },
      writeBatch: async ({operations}) => { const st = load(); operations.forEach(o => allow(st, o.reference, o.data)); operations.forEach(o => st.docs[o.reference] = o.data); save(st); },
      setDocument: async ({reference, data, merge}) => { const st = load(); allow(st, reference, data); st.docs[reference] = merge ? {...(st.docs[reference] || {}), ...data} : data; save(st); },
      getDocument: async ({reference}) => { const st = load(); allow(st, reference); return {snapshot: {data: st.docs[reference] || null}}; },
    };
    window.Capacitor = {isNativePlatform: () => false, Plugins: {FirebaseAuthentication: auth, FirebaseFirestore: fsP}};
  });
  const mock = () => pg.evaluate(() => JSON.parse(localStorage.getItem('__mockfb') || '{}'));
  const freshInstall = async (keepBackend = true) => {   // "uninstall + reinstall": local DB and Firebase session gone, server data stays
    await pg.evaluate(k => { const st = JSON.parse(localStorage.getItem('__mockfb') || 'null'); localStorage.clear(); if (k && st) { st.cur = null; localStorage.setItem('__mockfb', JSON.stringify(st)); } }, keepBackend);
    await pg.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('bakikhata'); q.onsuccess = q.onerror = q.onblocked = r; }));
    await pg.reload({waitUntil: 'networkidle0'});
  };
  const toast = () => pg.$eval('#toast', e => e.textContent);
  const typeIn = async (sel, v) => { await pg.$eval(sel, e => { e.value = ''; }); await pg.type(sel, v); };

  await pg.goto(BASE, {waitUntil: 'networkidle0'});
  await freshInstall(false);
  ok(await pg.evaluate(() => Cloud.enabled()), 'cloud enabled with plugins present');
  ok(await pg.$eval('#aLogin', e => !e.classList.contains('hidden')) && !!(await pg.$('#aGoogle')), 'auth screen: phone+password login and Google button');
  await pg.screenshot({path: OUT + '/auth-login.png'});

  // ---------- 1. registration: shop + phone + password → OTP → linked ----------
  await pg.click('#aTabs [data-tab="reg"]');
  await typeIn('#oShop', 'রহিম স্টোর'); await typeIn('#oOwner', 'রহিম'); await typeIn('#oPhone', '01811111111');
  await typeIn('#rPw', 'abc12'); await typeIn('#rPw2', 'abc12'); await pg.click('#rGo'); await sleep(200);
  ok((await toast()).includes('৬ অক্ষর'), 'password shorter than 6 rejected');
  await typeIn('#rPw', 'secret12'); await typeIn('#rPw2', 'secret13'); await pg.click('#rGo'); await sleep(200);
  ok((await toast()).includes('মেলেনি'), 'mismatched confirmation rejected');
  await pg.click('[data-eye="rPw"]'); ok(await pg.$eval('#rPw', e => e.type === 'text'), 'show/hide toggle reveals password');
  await typeIn('#rPw2', 'secret12'); await pg.click('#rGo'); await sleep(500);
  await pg.screenshot({path: OUT + '/auth-otp.png'});
  ok((await mock()).log.includes('sms:+8801811111111'), 'OTP SMS requested for +8801811111111');
  await pg.type('#otpC', '১২৩৪৫৬'); await pg.click('#otpOk'); await sleep(1500);
  let m = await mock();
  const uidA = Object.keys(m.users).find(u => m.users[u].phone === '+8801811111111');
  ok(m.users[uidA].email === '8801811111111@phone.dfaster.com' && m.users[uidA].password === 'secret12' && m.users[uidA].providers.join() === 'phone,password',
    'password linked to the phone account (same uid, synthetic email)');
  ok(await pg.$eval('#onboard', e => e.classList.contains('hidden')) && (await pg.$eval('#shopTitle', e => e.textContent)) === 'রহিম স্টোর', 'registered and inside the app');

  // ---------- 2. use every feature, then sync ----------
  const counts = await pg.evaluate(async photo => {
    const c = await Book.saveParty({type: 'customer', name: 'জামাল', phone: '01911111111', photo});
    const s = await Book.saveParty({type: 'supplier', name: 'করিম ট্রেডার্স', phone: '01711111111'});
    await Book.saveEntry({partyId: c.id, kind: 'gave', amount: 2500, note: 'চাল'});
    await Book.saveEntry({partyId: c.id, kind: 'got', amount: 500});
    await Book.saveTxn({type: 'sale', mode: 'due', partyId: c.id, items: [{name: 'ডাল', qty: 2, price: 120}], paid: 40});
    await Book.saveTxn({type: 'sale', mode: 'cash', items: [{name: 'তেল', qty: 1, price: 180}]});
    await Book.saveTxn({type: 'purchase', mode: 'due', partyId: s.id, items: [{name: 'চিনি', qty: 10, price: 95}], paid: 0});
    await Book.saveCash({kind: 'expense', category: 'বিদ্যুৎ', amount: 800, note: 'বিল'});
    await Book.saveCash({kind: 'in', category: 'অন্যান্য', amount: 1000});
    await DB.put('products', {name: 'আটা', price: 60, unit: 'কেজি'});
    const gone = await Book.saveParty({type: 'customer', name: 'মুছে ফেলা কাস্টমার'}); await Book.deleteParty(gone.id);
    await DB.meta.set('settings', {...(DB.meta.get('settings') || {}), theme: 'dark', openingCash: 5000, smsPrompt: false, pinHash: 'h', pinSalt: 's', lastBackup: 1});
    await DB.meta.set('profile', {...DB.meta.get('profile'), address: 'মিরপুর, ঢাকা'});
    await Cloud.sync();
    const n = {}; for (const st of DB.SYNCED) n[st] = DB._mem[st].size;
    return {n, totals: Book.totals(), cash: Book.cashInHand()};
  }, PHOTO);
  m = await mock();
  const remoteN = {}; for (const st of ['parties', 'entries', 'txns', 'cash', 'products']) remoteN[st] = Object.keys(m.docs).filter(k => k.startsWith(`users/${uidA}/${st}/`)).length;
  ok(JSON.stringify(remoteN) === JSON.stringify(counts.n), 'every collection uploaded ' + JSON.stringify(remoteN));
  const acct = m.docs['users/' + uidA];
  ok(acct.profile.address === 'মিরপুর, ঢাকা' && acct.settings.theme === 'dark' && acct.settings.openingCash === 5000, 'profile + settings uploaded');
  ok(!('pinHash' in acct.settings) && !('pinSalt' in acct.settings) && !('lastBackup' in acct.settings), 'PIN hash/salt never leave the phone');
  ok(Object.keys(m.docs).every(k => k.startsWith('users/' + uidA)), 'all writes under users/{own uid}');

  // ---------- 3. full wipe → login with phone + password → everything back ----------
  await freshInstall();
  ok(await pg.$eval('#aLogin', e => !e.classList.contains('hidden')), 'after wipe: login screen');
  await typeIn('#aPh', '01811111111'); await typeIn('#aPw', 'wrongpw'); await pg.click('#aGo'); await sleep(400);
  ok((await toast()).includes('পাসওয়ার্ড ভুল'), 'wrong password → Bangla error');
  ok((await mock()).log.filter(x => x.startsWith('sms:')).length === 1, 'login sends no SMS');
  await typeIn('#aPw', 'secret12'); await pg.click('#aGo'); await sleep(1500);
  const after = await pg.evaluate(() => { const n = {}; for (const st of DB.SYNCED) n[st] = DB._mem[st].size;
    const c = Book.parties('customer').find(x => x.name === 'জামাল');
    return {n, totals: Book.totals(), cash: Book.cashInHand(), photo: c && c.photo, profile: DB.meta.get('profile'), settings: DB.meta.get('settings'),
      dark: document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark', deletedHidden: !Book.parties('customer').some(x => x.name === 'মুছে ফেলা কাস্টমার'),
      dirty: DB.SYNCED.reduce((s, st) => s + DB.dirty(st).length, 0)}; });
  ok(JSON.stringify(after.n) === JSON.stringify(counts.n), 'all collections restored ' + JSON.stringify(after.n));
  ok(JSON.stringify(after.totals) === JSON.stringify(counts.totals) && after.cash === counts.cash, `balances identical (পাবো/দেবো ${JSON.stringify(after.totals)}, cash ${after.cash})`);
  ok(after.photo === PHOTO, 'customer photo restored');
  ok(after.profile.shopName === 'রহিম স্টোর' && after.profile.address === 'মিরপুর, ঢাকা' && after.profile.verified, 'shop profile restored');
  ok(after.settings.theme === 'dark' && after.settings.openingCash === 5000 && after.settings.smsPrompt === false && !after.settings.pinHash, 'settings restored (PIN not)');
  ok(after.deletedHidden, 'deleted customer stays deleted (tombstone)');
  ok(after.dirty === 0, 'nothing re-uploaded after restore');
  ok((await pg.$eval('#shopTitle', e => e.textContent)) === 'রহিম স্টোর', 'header shows restored shop');
  await pg.screenshot({path: OUT + '/auth-restored-home.png'});

  // ---------- 4. forgot password: OTP → new password ----------
  await freshInstall();
  await pg.click('#aForgot'); await sleep(250);
  await typeIn('#fPh', '01811111111'); await typeIn('#fPw', 'newpass9'); await typeIn('#fPw2', 'newpass9'); await pg.click('#fGo'); await sleep(400);
  await pg.type('#otpC', '123456'); await pg.click('#otpOk'); await sleep(1500);
  m = await mock();
  ok(m.users[uidA].password === 'newpass9' && Object.keys(m.users).length === 1, 'forgot password: same account, password updated');
  ok(await pg.evaluate(() => DB._mem.parties.size === 3), 'forgot password flow also restored the data');
  await pg.evaluate(async () => { await Cloud.signOut(); });
  await freshInstall();
  await typeIn('#aPh', '01811111111'); await typeIn('#aPw', 'secret12'); await pg.click('#aGo'); await sleep(400);
  ok((await toast()).includes('ভুল'), 'old password no longer works');
  await typeIn('#aPw', 'newpass9'); await pg.click('#aGo'); await sleep(1200);
  ok(await pg.$eval('#onboard', e => e.classList.contains('hidden')), 'new password works');

  // ---------- 5. logout → local data cleared, data still on server ----------
  await pg.goto(BASE + '#/settings', {waitUntil: 'networkidle0'}); await sleep(400);
  await pg.screenshot({path: OUT + '/auth-settings.png'});
  await pg.click('#sOut'); await sleep(250); await pg.click('#cfOk'); await sleep(1500);
  ok(await pg.$eval('#aLogin', e => !e.classList.contains('hidden')) && await pg.evaluate(() => DB._mem.parties.size === 0), 'logout clears this phone and shows login');

  // ---------- 6. Google: new account → shop form → own data, separate uid ----------
  await pg.click('#aGoogle'); await sleep(1200);
  ok(!!(await pg.$('#onboard:not(.hidden) #oShop')) && (await pg.$eval('#oOwner', e => e.value)) === 'Robin', 'Google new user: asked for shop info (owner prefilled)');
  await typeIn('#oShop', 'রবিন শপ'); await typeIn('#oPhone', '01611111111'); await pg.click('#oGo'); await sleep(300);
  await pg.evaluate(async () => { await Book.saveParty({type: 'customer', name: 'গুগল কাস্টমার'}); await Cloud.sync(); });
  m = await mock(); const uidG = Object.keys(m.users).find(u => m.users[u].google);
  ok(uidG && uidG !== uidA && m.docs['users/' + uidG].profile.shopName === 'রবিন শপ' && Object.keys(m.docs).some(k => k.startsWith(`users/${uidG}/parties/`)), 'Google account syncs under its own uid');
  await pg.evaluate(async () => { await Cloud.signOut(); });
  await freshInstall();
  await pg.click('#aGoogle'); await sleep(1500);
  ok(await pg.$eval('#onboard', e => e.classList.contains('hidden')) && (await pg.$eval('#shopTitle', e => e.textContent)) === 'রবিন শপ' && await pg.evaluate(() => Book.parties('customer').some(x => x.name === 'গুগল কাস্টমার')), 'Google login on a new phone restores everything');

  // ---------- 7. "use without login" still works ----------
  await pg.evaluate(async () => { await Cloud.signOut(); }); await freshInstall();
  await pg.click('#aLocal'); await sleep(200);
  await typeIn('#oShop', 'লোকাল'); await typeIn('#oOwner', 'ক'); await typeIn('#oPhone', '01511111111'); await pg.click('#oGo'); await sleep(400);
  ok(await pg.$eval('#onboard', e => e.classList.contains('hidden')) && !!(await pg.$('#hLogin')), 'local-only mode works and home suggests login');

  ok(errs.length === 0, 'no JS errors ' + JSON.stringify(errs));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
