/* dFaster Note — phone notifications (Android, @capacitor/local-notifications).
   Channels: SMS status, SMS failed, cloud sync, daily due reminder. Android 13+ needs POST_NOTIFICATIONS at runtime;
   some phones (Xiaomi/HyperOS) also switch notifications off per app, so status() checks both. In a browser: no-ops. */
(() => {
'use strict';
const LN = () => U.plugin('LocalNotifications');
const S = () => DB.meta.get('settings') || {};
const DUE_ID = 7001;
const CHANNELS = [
  {id: 'sms', name: 'SMS স্ট্যাটাস', description: 'অটো SMS কাস্টমারের কাছে গেল কি না', importance: 2},
  {id: 'sms_fail', name: 'SMS যায়নি', description: 'অটো SMS পাঠানো না গেলে জানাবে', importance: 4},
  {id: 'sync', name: 'ক্লাউড সিঙ্ক', description: 'হিসাব সার্ভারে ওঠা/ফেরত আসার খবর', importance: 2},
  {id: 'due', name: 'বাকির রিমাইন্ডার', description: 'প্রতিদিন বাকির হিসাব মনে করিয়ে দেবে', importance: 4},
];
let ready = null;
function init() {
  const p = LN(); if (!p) return Promise.resolve(false);
  return ready || (ready = (async () => { for (const c of CHANNELS) { try { await p.createChannel({...c, visibility: 1}); } catch (e) { console.warn('channel', e); } } return true; })());
}
// {available, perm: 'granted'|'denied'|'prompt'|..., enabled: bool (system switch)}
async function status() {
  const p = LN(); if (!p) return {available: false, perm: 'unavailable', enabled: false};
  let perm = 'prompt'; try { perm = (await p.checkPermissions()).display; } catch (e) {}
  let enabled = perm === 'granted';
  try { const n = U.plugin('BakiNative'); if (n) enabled = (await n.notificationsEnabled()).enabled && perm === 'granted'; } catch (e) {}
  return {available: true, perm, enabled};
}
async function request() { const p = LN(); if (!p) return 'unavailable'; await init(); try { return (await p.requestPermissions()).display; } catch (e) { return 'denied'; } }
let seq = Date.now() % 100000;
async function show(channelId, title, body) {
  const p = LN(); if (!p) return false;
  try {
    await init(); const st = await status(); if (!st.enabled) return false;
    await p.schedule({notifications: [{id: 100000 + (++seq % 800000), title, body, largeBody: body, channelId, smallIcon: 'ic_stat_note'}]});
    return true;
  } catch (e) { console.warn('notify', e); return false; }
}
// daily due reminder (default 8 pm). Text is refreshed whenever the ledger changes.
let dueT = null;
function scheduleDue() { clearTimeout(dueT); dueT = setTimeout(() => doScheduleDue().catch(e => console.warn('due', e)), 1500); }
async function doScheduleDue() {
  const p = LN(); if (!p) return;
  await init();
  try { await p.cancel({notifications: [{id: DUE_ID}]}); } catch (e) {}
  const s = S(); if (s.dueReminder === false) return;
  const st = await status(); if (!st.enabled) return;
  const t = Book.totals(); if (!t.nRec) return;
  const hour = Number.isInteger(s.dueHour) ? s.dueHour : 20;
  await p.schedule({notifications: [{id: DUE_ID, channelId: 'due', smallIcon: 'ic_stat_note',
    title: '🔔 বাকির হিসাব', body: `${U.bn(t.nRec)} জন কাস্টমারের কাছে মোট ${U.money(t.receivable)} বাকি। আজ তাগাদা দিন — খাতা খুলে "তাগাদা" চাপুন।`,
    schedule: {on: {hour, minute: 0}, allowWhileIdle: true}}]});
}
window.Notify = {init, status, request, show, scheduleDue, CHANNELS};
})();
