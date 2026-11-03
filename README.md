# বাকি খাতা (Baki Khata)

A Bangla digital ledger app for shopkeepers, in the style of TallyKhata. It is an Android app (Capacitor) that keeps all data on the phone and works fully offline.

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
- **SMS.** A Bangla SMS after each transaction.
  - Default: opens the SMS app with the text pre-filled, so no permission is needed.
  - Optional **অটো SMS**: sends directly with the `SEND_SMS` runtime permission.
  - **তাগাদা** reminders can go out by SMS or WhatsApp.
- **Shop profile.** Shop name, owner and phone, used in SMS and PDFs.
- **Backup/restore.** A JSON file goes to the share sheet; restore it with the file picker, including from the first-run screen.
- **PIN lock.** Re-locks after 60 s in the background.
- Dark/light mode, Bangla numerals throughout, and a bottom navigation bar with Back.
- No ads, no tracking, no PWA install prompt.

## Phone login and cloud sync
The data layer is ready for Firebase phone OTP login with per-user Firestore sync, offline-first. It is **switched off** until a Firebase project exists. See [CLOUD.md](CLOUD.md).

## Layout
```
index.html            landing page (GitHub Pages → dfaster.com/bakikhata/)
app/                  the app (HTML/CSS/JS, bundled into the APK)
  js/util.js          Bangla numbers, money, dates, helpers
  js/db.js            IndexedDB store with in-memory cache, soft deletes, dirty flags
  js/book.js          accounting: balances, ledger, sale/purchase posting, cash, reports
  js/native.js        SMS / WhatsApp / share via the BakiNative plugin (browser fallbacks)
  js/cloud.js         phone OTP + sync engine (inactive until firebase-config.js enables it)
  js/pdf.js           HTML → PDF (html2canvas + jsPDF, vendored)
  js/app.js           screens and router
android-app/          Capacitor 8 Android project (com.dfaster.bakikhata)
  android/app/src/main/java/com/dfaster/bakikhata/BakiNativePlugin.java
tools/                icon renderer and the headless-Chrome end-to-end test
```

## Build
```bash
source /workspace/android-env.sh          # JDK 21 + Android SDK
cd android-app && npm install
./sync-web.sh && npx cap sync android
cd android && ./gradlew assembleRelease bundleRelease
```
Releases are signed with a keystore that is kept outside the repo. The paths come from `BAKI_KEYSTORE` and `BAKI_KEYSTORE_PASS_FILE`.

## Test
```bash
python3 -m http.server 8231 &          # from the repo root
node tools/test/e2e.js                  # 35 checks: registration, parties, দিলাম/পেলাম, sales, cash, report+PDF, backup/restore, sync engine, PIN
node tools/test/otp-mock.js             # 8 checks: OTP registration + restore through the real Firebase adapter with mocked plugins
```

## Notes
- Google Play only allows `SEND_SMS` for apps whose core function is SMS. To publish on Play, remove the অটো SMS mode; the default compose-in-SMS-app mode needs no permission.
- A Bangla SMS is billed per 70 characters (67 per part when the message is split).

Fonts: Hind Siliguri (SIL OFL). PDF libraries: jsPDF and html2canvas (MIT).

Powered by Robin · [dFaster.com](https://dfaster.com)
