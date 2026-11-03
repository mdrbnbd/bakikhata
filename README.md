# dFaster Note

A Bangla digital ledger (বাকি খাতা) app for shopkeepers, in the style of TallyKhata. It is an Android app (Capacitor) that works fully offline and, after login, keeps every record safely in the user's own cloud account, so a new phone gets everything back.

(The package id `com.dfaster.bakikhata`, this repo name and the `bakikhata.apk` file name are kept from the original "Baki Khata" name.)

- **Download APK:** <https://github.com/mdrbnbd/bakikhata/releases/latest/download/bakikhata.apk>
- **Landing page:** <https://dfaster.com/bakikhata/> (mirror: <https://dfaster.github.io/bakikhata/>)
- **Browser demo of the UI:** <https://dfaster.com/bakikhata/app/> (data stays in that browser)

## Features
- **Customers and suppliers.** Name, phone, address, photo and opening balance. Search, and sort by due.
- **Per-party ledger.** দিলাম/পেলাম entries with a running balance. Entries can be edited and deleted. A cash entry can also update the cashbox.
- **ক্রয়/বিক্রয়.** Each is নগদ or বাকি and can be part-paid, with an optional item list. The due part posts to the party's ledger automatically; the paid part posts to the cashbox.
- **ক্যাশবক্স.** Cash in/out, খরচ by category, today's and this month's totals, and cash in hand (with an opening cash amount).
- **Dashboard.** মোট পাবো/দেবো, today's sale, purchase and cash, and quick-add buttons.
- **Reports.** Any date range: sales, purchases, dues, cash, expenses, top dues and an estimated profit. Reports export as **PDF** (rendered as an image, so Bangla text shapes correctly) to the share sheet. Each party's statement also exports as PDF.
- **অটো SMS (v1.2, on by default).** A Bangla SMS goes out automatically after every দিলাম/পেলাম, due or cash sale, supplier purchase and edit ("সংশোধিত"), plus a cancellation SMS when an entry is deleted.
  - Sent from the phone's own SIM with Android `SmsManager` (multipart for long Bangla text). Dual SIM: choose the SIM in Settings.
  - `SEND_SMS` is asked the first time, after a Bangla explanation. If it is denied, the SMS app opens with the text instead.
  - A toast shows "SMS পাঠানো হয়েছে" or why it failed. Every SMS has a status (গেছে / যায়নি / SMS অ্যাপে / নম্বর নেই) on the ledger row, in the entry form and in **SMS লগ** (resend from there).
  - Parties without a phone are skipped. Turn অটো SMS off in Settings to get the old "ask first" sheet.
  - **তাগাদা** reminders can go out by SMS or WhatsApp.
- **Notifications (v1.2).** Asked on first launch (Android 13+) with a Bangla explanation; if they are off (e.g. Xiaomi/HyperOS), the app shows a note and a button to the system notification settings. Channels: SMS sent, SMS failed, sync, daily due reminder (time set in Settings).
- **Payment methods and QR (v1.2).** In Profile → পেমেন্ট পদ্ধতি: any number of bKash/Nagad/Rocket/Upay (personal/merchant/agent) and bank accounts (bank, account name, number, branch, routing), one default.
  - Scan or upload the shop's official Bangla QR (EMVCo). When collecting a due, the QR is regenerated **with the due amount** (tag 54, CRC recomputed): from the ledger's **পেমেন্ট QR**, automatically after a due sale, and from তাগাদা. Share it as an image to WhatsApp or by SMS.
  - Without an official QR, an info card (number + amount) is shown and clearly labelled "not a payment QR".
  - The default method is added to the automatic SMS. Bank account numbers are never put in SMS unless the owner turns that on per account.
  - Payment is not confirmed automatically: the owner taps পেলাম when the money arrives.
- **Profile (v1.2).** Photo, owner name, phone, email, shop name/type/address, payment methods, login method and account creation date; change password, link Google, log out, delete account (removes the cloud data and the login). Opened from the header avatar or the প্রোফাইল tab.
  - **First-login setup wizard:** after registration or Google login (or the first offline start), a 4-step wizard asks for photo/name, shop details, payment methods and shows a summary. Every step can be skipped ("পরে করব"); Profile shows a completion bar and the missing items.
- **Backup/restore.** A JSON file goes to the share sheet; restore it with the file picker, including from the first-run screen.
- **PIN lock.** Re-locks after 60 s in the background.
- Dark/light mode, Bangla numerals throughout, bundled SVG icons (Lucide) with coloured tiles, and a 6-tab bottom navigation bar (হোম, খাতা, বেচাকেনা, ক্যাশবক্স, রিপোর্ট, প্রোফাইল). The Android back button still works.
- No ads, no tracking, no PWA install prompt.

- **Login and cloud sync (v1.1).** Register with mobile number + password (one SMS OTP to verify the number), then log in with number + password on any phone; or log in with Google. Forgot password works with an OTP. Customers, suppliers, photos, ledger entries, sales, purchases, cash, expenses, products, shop profile and settings sync to Firebase (Firestore, per-user rules) and all come back after login on a new phone. See [CLOUD.md](CLOUD.md).

## Layout
```
index.html            landing page (GitHub Pages → dfaster.com/bakikhata/)
app/                  the app (HTML/CSS/JS, bundled into the APK)
  js/util.js          Bangla numbers, money, dates, helpers
  js/db.js            IndexedDB store with in-memory cache, soft deletes, dirty flags
  js/book.js          accounting: balances, ledger, sale/purchase posting, cash, reports
  js/native.js        SMS / WhatsApp / share via the BakiNative plugin (browser fallbacks)
  js/pay.js           payment methods, EMVCo/Bangla QR parse + amount + CRC, QR image decode/generate
  js/notify.js        local notifications (channels, permission, due reminder)
  js/icons.js         Lucide SVG sprite + Ic() helper
  js/cloud.js         login (phone+password, OTP, Google) + Firestore sync engine (Android app only)
  js/pdf.js           HTML → PDF (html2canvas + jsPDF, vendored)
  js/app.js           screens and router
android-app/          Capacitor 8 Android project (com.dfaster.bakikhata)
  android/app/src/main/java/com/dfaster/bakikhata/BakiNativePlugin.java
firebase/             firebase.json, Firestore rules (deploy with firebase-tools)
tools/                icon renderer, headless-Chrome tests, Firestore rules test
```

## Build
```bash
source /workspace/android-env.sh          # JDK 21 + Android SDK
cd android-app && npm install
./sync-web.sh && npx cap sync android
cd android && ./gradlew assembleRelease bundleRelease
```
Releases are signed with a keystore that is kept outside the repo. The paths come from `BAKI_KEYSTORE` and `BAKI_KEYSTORE_PASS_FILE`. `sync-web.sh` copies `google-services.json` from outside the repo (`BAKI_GOOGLE_SERVICES`, default `/workspace/keys/bakikhata-google-services.json`); it is git-ignored.

## Test
```bash
python3 -m http.server 8231 &          # from the repo root
node tools/test/e2e.js                  # 47 checks: setup wizard, parties, দিলাম/পেলাম, sales, cash, report+PDF, backup/restore, sync, PIN, nav/icons, payment QR
node tools/test/cloud-auth.js           # 53 checks: register, login, forgot password, Google, wizard, profile, change password, link, logout, delete account, wipe → restore
node tools/test/pay-qr.js               # 14 checks: CRC16, EMVCo parse, tag 54 amount, decode-back of generated and photographed QR, info card, SMS line
node tools/test/sms-auto.js             # 38 checks against a mocked Android bridge: permissions, auto send, SIM, multipart, edit/delete, failure, resend, notifications
cd firebase && npx -y firebase-tools@latest emulators:exec --only firestore --project demo-bk "node ../tools/test/rules.test.js"   # 21 rules checks
```

## Notes
- Google Play treats `SEND_SMS` (and `READ_PHONE_STATE`, used only for the SIM list) as restricted: a ledger app would need an approved Permissions Declaration, which is unlikely. The APK from GitHub is not affected. For a Play build, remove those two permissions; the app then falls back to opening the SMS app.
- Auto SMS is sent from the shop's SIM and costs the normal operator SMS rate.
- A Bangla SMS is billed per 70 characters (67 per part when the message is split).

Fonts: Hind Siliguri (SIL OFL). PDF libraries: jsPDF and html2canvas (MIT). Icons: Lucide (ISC). QR: jsQR (Apache-2.0), qrcode-generator (MIT).

Powered by Robin · [dFaster.com](https://dfaster.com)
