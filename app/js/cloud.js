/* dFaster Note — login (phone + password / Google) + per-user cloud sync, offline-first.
   Active only when firebase-config.js sets BK_FIREBASE.enabled AND the native Firebase plugins are in the APK
   (the web demo has no plugins, so it stays local-only).
   Accounts (Firebase Auth, one uid per person):
     • Register: phone → SMS OTP (Phone Auth) → set password = link an Email/Password credential whose email is
       synthetic: 8801XXXXXXXXX@<phoneEmailDomain>. Both providers then share the same uid.
     • Login: phone + password → signInWithEmailAndPassword(synthetic email). No SMS needed.
     • Forgot password: OTP sign-in → updatePassword.
     • Google: signInWithGoogle (native).
   Data (Cloud Firestore, rules allow only the owner): users/{uid} = {profile, settings, updatedAt};
   users/{uid}/{parties|entries|txns|cash|products}/{id} = the row (photos live inside party rows as JPEG data URLs).
   Sync = pull rows newer than the last pull, push local dirty rows; rows resolve last-writer-wins on updatedAt and
   are never hard-deleted (deleted=1 tombstones propagate). profile/settings resolve last-writer-wins on _at.
   pinHash/pinSalt/lastBackup never leave the phone. Local IndexedDB stays the source the UI reads. */
(() => {
'use strict';
const OVERLAP = 5 * 60 * 1000;   // re-pull a 5-minute window to tolerate clock skew between phones (merge is idempotent)
const LOCAL_ONLY_SETTINGS = ['pinHash', 'pinSalt', 'lastBackup'];

// keep rows inside the size limits firestore.rules enforces, so one odd row can never block a whole sync batch
const fit = d => { const o = {...d}; if (typeof o.name === 'string') o.name = o.name.slice(0, 200); if (typeof o.note === 'string') o.note = o.note.slice(0, 1000);
  if (typeof o.photo === 'string' && o.photo.length > 400000) o.photo = null; return o; };
const mapUser = u => u && {uid: u.uid, phone: u.phoneNumber || null, email: u.email || null, name: u.displayName || null,
  providers: (u.providerData || []).map(p => p.providerId)};

/* ---------- Firebase adapter (Capacitor Firebase plugins, native SDKs) ---------- */
function firebaseAdapter() {
  const Auth = U.plugin('FirebaseAuthentication'), Fs = U.plugin('FirebaseFirestore');
  if (!Auth || !Fs) return null;
  const col = (uid, store) => `users/${uid}/${store}`;
  return {
    name: 'firebase',
    sendOtp: phone => new Promise(async (resolve, reject) => {
      const hs = []; let settled = false;
      const done = (f, v) => { if (settled) return; settled = true; hs.forEach(h => h && h.remove && h.remove()); f(v); };
      hs.push(await Auth.addListener('phoneCodeSent', e => done(resolve, {verificationId: e.verificationId})));
      hs.push(await Auth.addListener('phoneVerificationCompleted', e => done(resolve, {user: mapUser(e.user)})));
      hs.push(await Auth.addListener('phoneVerificationFailed', e => done(reject, Object.assign(new Error(e.message || 'OTP পাঠানো যায়নি'), {code: e.code}))));
      Auth.signInWithPhoneNumber({phoneNumber: phone}).catch(err => done(reject, err));
    }),
    async confirmOtp(verificationId, code) { const r = await Auth.confirmVerificationCode({verificationId, verificationCode: code}); return mapUser(r.user); },
    async signInPassword(email, password) { const r = await Auth.signInWithEmailAndPassword({email, password}); return mapUser(r.user); },
    async signInGoogle() { const r = await Auth.signInWithGoogle(); return mapUser(r.user); },
    async setPassword(email, password) {
      const cur = mapUser((await Auth.getCurrentUser()).user);
      if (!cur) throw new Error('আগে OTP যাচাই করুন');
      if (cur.providers.includes('password')) await Auth.updatePassword({newPassword: password});
      else await Auth.linkWithEmailAndPassword({email, password});
      return mapUser((await Auth.getCurrentUser()).user);
    },
    async currentUser() { return mapUser((await Auth.getCurrentUser()).user); },
    signOut: () => Auth.signOut(),
    async pull(uid, store, since) {
      const r = await Fs.getCollection({reference: col(uid, store),
        compositeFilter: {type: 'and', queryConstraints: [{type: 'where', fieldPath: 'updatedAt', opStr: '>', value: since}]}});
      return (r.snapshots || []).map(s => s.data).filter(Boolean);
    },
    async push(uid, store, rows) {
      for (let i = 0; i < rows.length; i += 400) {
        await Fs.writeBatch({operations: rows.slice(i, i + 400).map(({dirty, ...d}) => ({type: 'set', reference: `${col(uid, store)}/${d.id}`, data: fit(d)}))});
      }
    },
    putAccount: (uid, data) => Fs.setDocument({reference: `users/${uid}`, data: {...data, updatedAt: Date.now()}, merge: true}),
    async getAccount(uid) { const r = await Fs.getDocument({reference: `users/${uid}`}); return (r.snapshot && r.snapshot.data) || null; }
  };
}

let adapter = null, syncing = null;
const cfg = () => window.BK_FIREBASE || null;
function enabled() {
  if (adapter) return true;
  if (!cfg() || !cfg().enabled) return false;
  adapter = firebaseAdapter();
  return !!adapter;
}
const user = () => DB.meta.get('cloudUser');
const phoneEmail = phone => U.e164(phone).replace('+', '') + '@' + ((cfg() && cfg().phoneEmailDomain) || 'phone.dfaster.com');
const who = u => u.phone ? U.bn(U.normPhone(u.phone)) : (u.email || '');

// Firebase error → short Bangla message
function errText(e) {
  const t = ((e && (e.code || '')) + ' ' + (e && e.message || '')).toLowerCase();
  if (/wrong-password|invalid-credential|invalid_login|user-not-found|no user record|password is invalid|incorrect|malformed or has expired/.test(t)) return 'নম্বর বা পাসওয়ার্ড ভুল';
  if (/invalid-verification-code|code is invalid|invalid_code/.test(t)) return 'কোড মেলেনি — আবার দেখে লিখুন';
  if (/session-expired|code-expired|expired/.test(t)) return 'কোডের মেয়াদ শেষ — আবার OTP পাঠান';
  if (/too-many-requests|blocked all requests|quota/.test(t)) return 'অনেকবার চেষ্টা হয়েছে — কিছুক্ষণ পরে আবার চেষ্টা করুন';
  if (/billing|operation-not-allowed|not enabled|region/.test(t)) return 'এই মুহূর্তে SMS যাচাই চালু নেই — Google দিয়ে লগইন করুন বা পরে চেষ্টা করুন';
  if (/network|unavailable|timeout|offline/.test(t)) return 'ইন্টারনেট সংযোগ নেই';
  if (/weak-password/.test(t)) return 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন';
  if (/credential-already-in-use|email-already-in-use|already linked|already in use/.test(t)) return 'এই নম্বরটি অন্য অ্যাকাউন্টে যুক্ত আছে — "পাসওয়ার্ড ভুলে গেছেন?" দিয়ে চেষ্টা করুন';
  if (/cancel/.test(t)) return 'বাতিল করা হয়েছে';
  return (e && e.message) || 'সমস্যা হয়েছে';
}
const wrap = async f => { try { return await f(); } catch (e) { const x = new Error(errText(e)); x.cause = e; throw x; } };

function status() {
  if (!enabled()) return {on: false, text: 'লগইন ও ক্লাউড সিঙ্ক শুধু Android অ্যাপে — এখানে সব তথ্য এই ডিভাইসেই আছে। নিয়মিত "ব্যাকআপ ফাইল" রাখুন।'};
  const u = user(), last = DB.meta.get('lastSync');
  if (!u) return {on: true, signedIn: false, text: 'লগইন করা নেই — হিসাব শুধু এই ফোনে আছে'};
  return {on: true, signedIn: true, user: u, text: `লগইন: ${who(u)}` + (last ? ` · শেষ সিঙ্ক ${U.timeBn(last)}` : '')};
}

/* ---- auth flows used by the screens ---- */
const need = () => { if (!enabled()) throw new Error('ক্লাউড চালু নেই'); };
async function loginPassword(phone, password) { need(); const u = await wrap(() => adapter.signInPassword(phoneEmail(phone), password)); await signedIn(u); return u; }
async function loginGoogle() { need(); const u = await wrap(() => adapter.signInGoogle()); await signedIn(u); return u; }
async function sendOtp(phone) { need(); return wrap(() => adapter.sendOtp(U.e164(phone))); }   // → {verificationId} | {user}
async function confirmOtp(verificationId, code) { return wrap(() => adapter.confirmOtp(verificationId, U.toAscii(code))); }   // signs in, does not sync yet
async function setPassword(phone, password) {   // after OTP: link (first time) or change the password, then finish sign-in
  if (String(password).length < 6) throw new Error('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের দিন');
  const u = await wrap(() => adapter.setPassword(phoneEmail(phone), password));
  await signedIn(u); return u;
}
async function signedIn(u) {
  await DB.meta.set('cloudUser', u);
  await sync(true);
}
async function signOut({wipe = true} = {}) {
  if (enabled() && user()) { try { await sync(); } catch (e) { console.warn('final sync', e); } }
  if (adapter) await adapter.signOut().catch(() => {});
  if (wipe) await DB.wipe(); else await DB.meta.set('cloudUser', null);
}
const unsynced = () => DB.SYNCED.reduce((n, s) => n + DB.dirty(s).length, 0);

/* ---- account doc (profile + settings) ---- */
async function syncAccount(uid) {
  const remote = (await adapter.getAccount(uid)) || {};
  const lp = DB.meta.get('profile'), rp = remote.profile;
  // a fresh, not-yet-verified registration form never overwrites the account's saved shop info
  if (rp && (!lp || !lp.verified || (rp._at || 0) > (lp._at || 0))) await DB.meta.set('profile', {...(lp || {}), ...rp, verified: true}, {fromSync: true});
  else if (lp && !lp.verified) await DB.meta.set('profile', {...lp, verified: true}, {fromSync: true});
  const ls = DB.meta.get('settings') || {}, rs = remote.settings;
  if (rs && (rs._at || 0) > (ls._at || 0)) {
    const keep = {}; LOCAL_ONLY_SETTINGS.forEach(k => { if (k in ls) keep[k] = ls[k]; });
    await DB.meta.set('settings', {...rs, ...keep}, {fromSync: true});
  }
  const p = DB.meta.get('profile'), s = DB.meta.get('settings');
  const out = {};
  if (p && (!rp || (p._at || 0) > (rp._at || 0) || !rp.verified)) out.profile = p;
  if (s && (!rs || (s._at || 0) > (rs._at || 0))) { const c = {...s}; LOCAL_ONLY_SETTINGS.forEach(k => delete c[k]); out.settings = c; }
  if (out.profile || out.settings) await adapter.putAccount(uid, out);
}

async function sync(full = false) {
  if (!enabled() || !user()) return {skipped: true};
  if (syncing) return syncing;
  syncing = (async () => {
    const uid = user().uid, marks = full ? {} : (DB.meta.get('pullMarks') || {});
    await syncAccount(uid);
    let pulled = 0, pushed = 0;
    for (const s of DB.SYNCED) {
      const since = full ? 0 : Math.max(0, (marks[s] || 0) - OVERLAP);
      const rows = await adapter.pull(uid, s, since);
      let max = marks[s] || 0;
      for (const r of rows) { if (await DB.mergeRemote(s, r)) pulled++; max = Math.max(max, r.updatedAt || 0); }
      marks[s] = max;
      const d = DB.dirty(s);
      if (d.length) { await adapter.push(uid, s, d); await DB.markClean(s, d.map(r => r.id)); pushed += d.length; }
    }
    await DB.meta.set('pullMarks', marks);
    await DB.meta.set('lastSync', Date.now());
    return {pulled, pushed};
  })();
  try { return await syncing; } finally { syncing = null; }
}
let timer;
function schedule() { if (!enabled() || !user()) return; clearTimeout(timer); timer = setTimeout(() => sync().catch(e => console.warn('sync', e)), 4000); }
// any local edit → push a few seconds later
DB.on((store, rec) => { if (!rec) return; if ((DB.SYNCED.includes(store) && rec.dirty) || (store === 'meta' && ['profile', 'settings'].includes(rec.key))) schedule(); });

window.Cloud = {enabled, status, loginPassword, loginGoogle, sendOtp, confirmOtp, setPassword, signOut, sync, schedule, user,
  unsynced, phoneEmail, errText, completeSignIn: signedIn,
  _setAdapter(a) { adapter = a; }   // tests / future backends
};
})();
