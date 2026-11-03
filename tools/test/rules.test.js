// firestore.rules against the Firestore emulator. Run from firebase/:
//   npx -y firebase-tools@latest emulators:exec --only firestore --project demo-bk "node ../tools/test/rules.test.js"
// (deps: npm i @firebase/rules-unit-testing firebase in RT, default /workspace/rules-test)
const RT = process.env.RT || '/workspace/rules-test/node_modules/';
const {initializeTestEnvironment, assertSucceeds, assertFails} = require(RT + '@firebase/rules-unit-testing');
const {doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch} = require(RT + 'firebase/firestore');
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const t = async (m, p) => { try { await p; pass++; console.log('✔', m); } catch (e) { fail++; console.log('✘', m, e.message); } };
(async () => {
  const env = await initializeTestEnvironment({projectId: 'demo-bk', firestore: {rules: fs.readFileSync(path.join(__dirname, '../../firebase/firestore.rules'), 'utf8')}});
  const now = Date.now(), row = (id, x = {}) => ({id, createdAt: now, updatedAt: now, deleted: 0, ...x});
  const alice = env.authenticatedContext('alice').firestore(), bob = env.authenticatedContext('bob').firestore(), anon = env.unauthenticatedContext().firestore();
  await t('owner writes account doc', assertSucceeds(setDoc(doc(alice, 'users/alice'), {profile: {shopName: 'A', _at: now}, settings: {theme: 'dark'}, updatedAt: now}, {merge: true})));
  await t('owner reads account doc', assertSucceeds(getDoc(doc(alice, 'users/alice'))));
  await t('other user cannot read it', assertFails(getDoc(doc(bob, 'users/alice'))));
  await t('signed-out cannot read it', assertFails(getDoc(doc(anon, 'users/alice'))));
  await t('cannot list all users', assertFails(getDocs(collection(alice, 'users'))));
  await t('account doc rejects extra keys', assertFails(setDoc(doc(alice, 'users/alice'), {profile: {}, updatedAt: now, admin: true})));
  await t('account doc needs numeric updatedAt', assertFails(setDoc(doc(alice, 'users/alice'), {profile: {}, updatedAt: 'x'})));
  const b = writeBatch(alice);
  b.set(doc(alice, 'users/alice/parties/p1'), row('p1', {type: 'customer', name: 'জামাল', phone: '01911111111', photo: 'data:image/jpeg;base64,AAAA'}));
  b.set(doc(alice, 'users/alice/entries/e1'), row('e1', {partyId: 'p1', kind: 'gave', amount: 2500, date: '2026-11-03', note: ''}));
  b.set(doc(alice, 'users/alice/txns/t1'), row('t1', {type: 'sale', mode: 'due', partyId: 'p1', items: [{name: 'ডাল', qty: 2, price: 120}], total: 240, paid: 40, date: '2026-11-03'}));
  b.set(doc(alice, 'users/alice/cash/c1'), row('c1', {kind: 'expense', category: 'বিদ্যুৎ', amount: 800, date: '2026-11-03'}));
  b.set(doc(alice, 'users/alice/products/x1'), row('x1', {name: 'আটা', price: 60, unit: 'কেজি'}));
  await t('owner batch-writes all 5 stores (real row shapes)', assertSucceeds(b.commit()));
  await t('owner tombstones a row', assertSucceeds(setDoc(doc(alice, 'users/alice/parties/p1'), row('p1', {name: 'জামাল', deleted: 1, updatedAt: now + 1}))));
  await t('owner reads own rows', assertSucceeds(getDocs(collection(alice, 'users/alice/entries'))));
  await t('other user cannot read rows', assertFails(getDocs(collection(bob, 'users/alice/entries'))));
  await t('other user cannot write rows', assertFails(setDoc(doc(bob, 'users/alice/entries/e2'), row('e2', {amount: 1}))));
  await t('other user cannot delete rows', assertFails(deleteDoc(doc(bob, 'users/alice/entries/e1'))));
  await t('unknown collection denied', assertFails(setDoc(doc(alice, 'users/alice/secrets/s1'), row('s1'))));
  await t('id must match doc id', assertFails(setDoc(doc(alice, 'users/alice/entries/e3'), row('zzz'))));
  await t('deleted must be 0/1', assertFails(setDoc(doc(alice, 'users/alice/entries/e4'), row('e4', {deleted: 5}))));
  await t('amount must be a number', assertFails(setDoc(doc(alice, 'users/alice/entries/e5'), row('e5', {amount: '100'}))));
  await t('oversized photo rejected', assertFails(setDoc(doc(alice, 'users/alice/parties/p2'), row('p2', {name: 'x', photo: 'a'.repeat(400001)}))));
  await t('oversized note rejected', assertFails(setDoc(doc(alice, 'users/alice/entries/e6'), row('e6', {note: 'a'.repeat(1001)}))));
  await t('root collections denied', assertFails(setDoc(doc(alice, 'other/x'), {a: 1})));
  await t('deeper paths denied', assertFails(setDoc(doc(alice, 'users/alice/parties/p1/x/y'), {a: 1})));
  console.log(`\n${pass} passed, ${fail} failed`); await env.cleanup(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
