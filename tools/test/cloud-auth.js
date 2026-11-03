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
      providerData: u.providers.map(providerId => ({providerId})), metadata: {creationTime: u.created, lastSignInTime: u.last}}; };
    const auth = {
      addListener: async (ev, fn) => { L[ev] = fn; return {remove() { delete L[ev]; }}; },
      signInWithPhoneNumber: async ({phoneNumber}) => { const st = load(); st.pendingPhone = phoneNumber; st.log.push('sms:' + phoneNumber); save(st); setTimeout(() => L.phoneCodeSent({verificationId: 'vid-' + phoneNumber}), 30); },
      confirmVerificationCode: async ({verificationId, verificationCode}) => {
        const st = load(); if (verificationId !== 'vid-' + st.pendingPhone || verificationCode !== '123456') throw err('auth/invalid-verification-code');
        let uid = Object.keys(st.users).find(u => st.users[u].phone === st.pendingPhone);
        if (!uid) { uid = 'uid-' + (++st.seq); st.users[uid] = {phone: st.pendingPhone, providers: ['phone'], created: 1700000000000}; }
        st.users[uid].last = Date.now();
        st.cur = uid; save(st); return {user: pub(st, uid)};
      },
      signInWithEmailAndPassword: async ({email, password}) => {
        const st = load(); const uid = Object.keys(st.users).find(u => st.users[u].email === email);
        if (!uid || st.users[uid].password !== password) throw err('auth/invalid-credential', 'The supplied auth credential is incorrect');
        st.cur = uid; save(st); return {user: pub(st, uid)};
      },
      signInWithGoogle: async () => {
        const st = load(); let uid = Object.keys(st.users).find(u => st.users[u].google === 'robin@gmail.com');
        if (!uid) { uid = 'uid-' + (++st.seq); st.users[uid] = {google: 'robin@gmail.com', email: 'robin@gmail.com', name: 'Robin', providers: ['google.com'], created: 1760000000000}; }
        st.cur = uid; save(st); return {user: pub(st, uid)};
      },
      linkWithEmailAndPassword: async ({email, password}) => {
        const st = load(); if (!st.cur) throw err('auth/no-current-user');
        if (Object.keys(st.users).some(u => u !== st.cur && st.users[u].email === email)) throw err('auth/email-already-in-use');
        Object.assign(st.users[st.cur], {email, password}); st.users[st.cur].providers.push('password'); save(st); return {user: pub(st, st.cur)};
      },
      updatePassword: async ({newPassword}) => { const st = load(); st.users[st.cur].password = newPassword; save(st); },
      linkWithGoogle: async () => { const st = load(); if (!st.cur) throw err('auth/no-current-user');
        if (Object.keys(st.users).some(u => u !== st.cur && st.users[u].google === 'robin@gmail.com')) throw err('auth/credential-already-in-use');
        Object.assign(st.users[st.cur], {google: 'robin@gmail.com'}); st.users[st.cur].providers.push('google.com'); save(st); return {user: pub(st, st.cur)}; },
      deleteUser: async () => { const st = load(); if (!st.cur) throw err('auth/no-current-user'); delete st.users[st.cur]; st.cur = null; st.log.push('deleteUser'); save(st); },
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
      getCollection: async ({reference, compositeFilter}) => { const st = load(); allow(st, reference + '/x'); const since = compositeFilter ? compositeFilter.queryConstraints[0].value : -Infinity;
        return {snapshots: Object.keys(st.docs).filter(k => k.startsWith(reference + '/') && k.split('/').length === reference.split('/').length + 1 && st.docs[k].updatedAt > since).map(k => ({id: k.split('/').pop(), path: k, data: st.docs[k]}))}; },
      writeBatch: async ({operations}) => { const st = load(); operations.forEach(o => allow(st, o.reference, o.data)); operations.forEach(o => { if (o.type === 'delete') delete st.docs[o.reference]; else st.docs[o.reference] = o.data; }); save(st); },
      deleteDocument: async ({reference}) => { const st = load(); allow(st, reference); delete st.docs[reference]; save(st); },
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
  ok(!!(await pg.$('#onboard:not(.hidden) .wsteps')) && (await pg.$eval('#wShop', e => e.value)) === 'রহিম স্টোর', 'after registration: profile setup wizard (step 2, shop prefilled)');
  await pg.screenshot({path: OUT + '/setup-wizard.png'});
  await pg.click('#wType [data-v="ফার্মেসি"]'); await typeIn('#wAddr', 'বনানী'); await pg.click('#wNext'); await sleep(300);
  ok(!!(await pg.$('#wMfs')), 'wizard step 3: payment methods');
  await pg.click('#wSkip'); await sleep(600);
  ok(await pg.$eval('#onboard', e => e.classList.contains('hidden')) && (await pg.$eval('#shopTitle', e => e.textContent)) === 'রহিম স্টোর', 'skip for later → registered and inside the app');
  ok(await pg.evaluate(() => { const p = DB.meta.get('profile'); return p.shopType === 'ফার্মেসি' && p.address === 'বনানী' && !!p.setupSkippedAt; }), 'wizard answers saved (type, address) + skipped flag');

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
  // ---------- 5a. profile page ----------
  await pg.click('#meBtn'); await sleep(500);
  const prof = await pg.evaluate(() => ({methods: document.querySelector('.kv .chips').textContent, created: document.querySelector('#acCreated').textContent, done: document.querySelector('#prDone').textContent,
    pw: !!document.querySelector('#acPw'), linkG: !!document.querySelector('#acLinkG'), linkP: !!document.querySelector('#acLinkP'), nav: document.querySelector('[data-nav=profile]').classList.contains('on')}));
  console.log('   profile:', JSON.stringify(prof));
  ok(prof.methods.includes('মোবাইল + পাসওয়ার্ড') && prof.created.includes('২০২৩') && prof.pw && prof.linkG && !prof.linkP && prof.nav, 'profile: login method, created date, change password + link Google, nav highlight');
  ok(/প্রোফাইল .*% সম্পূর্ণ/.test(prof.done) && prof.done.includes('পেমেন্ট পদ্ধতি'), 'profile completion indicator lists missing items');
  await typeIn('#prName', 'রহিম উদ্দিন'); await typeIn('#prEmail', 'rahim@example.com'); await pg.click('#prSave'); await sleep(300);
  await pg.click('#pmBank'); await sleep(200);
  await typeIn('#bkB', 'ডাচ-বাংলা ব্যাংক'); await typeIn('#bkA', 'রহিম স্টোর'); await typeIn('#bkN', '1234567890123'); await typeIn('#bkBr', 'বনানী'); await pg.click('#bkS'); await sleep(300);
  await pg.click('#pmMfs'); await sleep(200); await pg.click('#mfP [data-v=nagad]'); await pg.click('#mfT [data-v=merchant]'); await typeIn('#mfN', '01811111111'); await pg.click('#mfS'); await sleep(300);
  const pms = await pg.$$eval('#pmList .pm', r => r.map(x => x.textContent));
  ok(pms.length === 2 && pms[0].includes('ডিফল্ট') && pms[0].includes('ডাচ') && !pms[0].includes('1234567890123') && !pms[0].includes('১২৩৪৫৬৭৮৯০১২৩'), 'payment methods: bank (default, account number masked) + Nagad merchant');
  await pg.click('#pmList .pm:nth-child(2) [data-pmdef]'); await sleep(300);
  ok((await pg.$eval('#pmList .pm', e => e.textContent)).includes('নগদ'), 'set Nagad as default');
  await pg.screenshot({path: OUT + '/profile.png', fullPage: true});
  await pg.click('#acPw'); await sleep(200);
  await typeIn('#cpOld', 'wrongold'); await typeIn('#cpNew', 'brandnew7'); await typeIn('#cpNew2', 'brandnew7'); await pg.click('#cpGo'); await sleep(400);
  ok((await toast()).includes('ভুল') && (await mock()).users[uidA].password === 'newpass9', 'change password: wrong current password rejected');
  await typeIn('#cpOld', 'newpass9'); await pg.click('#cpGo'); await sleep(500);
  ok((await mock()).users[uidA].password === 'brandnew7', 'change password works');
  await pg.click('#acLinkG'); await sleep(600);
  ok((await mock()).users[uidA].providers.includes('google.com'), 'link Google to the phone account (same uid)');
  await sleep(300); m = await mock();
  await pg.evaluate(() => Cloud.sync());  m = await mock();
  const ap = m.docs['users/' + uidA].profile;
  ok(ap.ownerName === 'রহিম উদ্দিন' && ap.email === 'rahim@example.com' && ap.pay.methods.length === 2 && ap.pay.methods.some(x => x.accNo === '1234567890123'), 'profile + payment methods synced to users/{uid} (bank number only in own doc)');
  ok(!JSON.stringify(m.docs['users/' + uidA].settings || {}).includes('1234567890123'), 'bank number not in settings');
  await pg.click('#acOut'); await sleep(250); await pg.click('#cfOk'); await sleep(1500);
  ok(await pg.$eval('#aLogin', e => !e.classList.contains('hidden')) && await pg.evaluate(() => DB._mem.parties.size === 0), 'logout clears this phone and shows login');
  // the Google account is now linked to uidA: undo for the next section by removing that link in the mock
  await pg.evaluate(() => { const st = JSON.parse(localStorage.getItem('__mockfb')); Object.values(st.users).forEach(u => { if (u.phone) { delete u.google; u.providers = u.providers.filter(x => x !== 'google.com'); } }); localStorage.setItem('__mockfb', JSON.stringify(st)); });

  // ---------- 6. Google: new account → shop form → own data, separate uid ----------
  await pg.click('#aGoogle'); await sleep(1200);
  ok(!!(await pg.$('#onboard:not(.hidden) #wName')) && (await pg.$eval('#wName', e => e.value)) === 'Robin', 'Google new user: setup wizard step 1 (name prefilled)');
  await typeIn('#wPhone', '01611111111'); await pg.click('#wNext'); await sleep(250);
  await pg.click('#wNext'); await sleep(200); ok((await toast()).includes('দোকানের নাম'), 'wizard: shop name required');
  await typeIn('#wShop', 'রবিন শপ'); await pg.click('#wType [data-v="other"]'); await typeIn('#wTypeO', 'মোবাইল সার্ভিসিং'); await pg.click('#wNext'); await sleep(250);
  await pg.click('#wNext'); await sleep(250);
  ok((await pg.$eval('#onboard h2', e => e.textContent)).includes('%'), 'wizard summary shows completion %');
  await pg.click('#wNext'); await sleep(400);
  ok(await pg.evaluate(() => { const p = DB.meta.get('profile'); return p.shopType === 'মোবাইল সার্ভিসিং' && p.setupDone === true && p.email === 'robin@gmail.com'; }), 'wizard: custom business type, setupDone, Google email kept');
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
  await typeIn('#wName', 'ক'); await typeIn('#wPhone', '01511111111'); await pg.click('#wNext'); await sleep(250);
  await typeIn('#wShop', 'লোকাল'); await pg.click('#wSkip'); await sleep(500);
  ok(await pg.$eval('#onboard', e => e.classList.contains('hidden')) && !!(await pg.$('#hLogin')), 'local-only mode works and home suggests login');

  // ---------- 8. delete account (Google): confirm twice → Firestore data + auth user gone ----------
  await pg.evaluate(async () => { await Cloud.signOut(); }); await freshInstall();
  await pg.click('#aGoogle'); await sleep(1500);
  m = await mock(); const uidG2 = Object.keys(m.users).find(u => m.users[u].google);
  ok(Object.keys(m.docs).some(k => k.startsWith('users/' + uidG2)), 'Google account has cloud data before delete');
  await pg.click('#meBtn'); await sleep(400); await pg.click('#acDel'); await sleep(200); await pg.click('#cfOk'); await sleep(200);
  await pg.type('#dcTxt', 'ভুল'); await pg.click('#dcGo'); await sleep(200);
  ok((await mock()).users[uidG2], 'delete needs the word মুছুন');
  await typeIn('#dcTxt', 'মুছুন'); await pg.click('#dcGo'); await sleep(1200);
  m = await mock();
  ok(!m.users[uidG2] && !Object.keys(m.docs).some(k => k.startsWith('users/' + uidG2)) && m.log.includes('deleteUser'), 'delete account: auth user and all Firestore docs removed');
  ok(Object.keys(m.docs).some(k => k.startsWith('users/' + uidA + '/')), 'other accounts untouched');
  await sleep(1500);
  ok(await pg.evaluate(() => DB._mem.parties.size === 0), 'this phone wiped after delete');
  ok(errs.length === 0, 'no JS errors ' + JSON.stringify(errs));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
