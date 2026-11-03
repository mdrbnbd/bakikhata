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
- **SMS.** A Bangla SMS after each transaction.
  - Default: opens the SMS app with the text pre-filled, so no permission is needed.
  - Optional **অটো SMS**: sends directly with the `SEND_SMS` runtime permission.
  - **তাগাদা** reminders can go out by SMS or WhatsApp.
- **Shop profile.** Shop name, owner and phone, used in SMS and PDFs.
- **Backup/restore.** A JSON file goes to the share sheet; restore it with the file picker, including from the first-run screen.
- **PIN lock.** Re-locks after 60 s in the background.
- Dark/light mode, Bangla numerals throughout, and a bottom navigation bar with Back.
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
node tools/test/e2e.js                  # 35 checks: registration, parties, দিলাম/পেলাম, sales, cash, report+PDF, backup/restore, sync engine, PIN
node tools/test/cloud-auth.js           # 33 checks: register (OTP+password), login, wrong password, forgot password, Google, logout,
                                        #   and a full wipe → login → restore of every collection, photo, profile and settings
cd firebase && npx -y firebase-tools@latest emulators:exec --only firestore --project demo-bk "node ../tools/test/rules.test.js"   # 21 rules checks
```

## Notes
- Google Play only allows `SEND_SMS` for apps whose core function is SMS. To publish on Play, remove the অটো SMS mode; the default compose-in-SMS-app mode needs no permission.
- A Bangla SMS is billed per 70 characters (67 per part when the message is split).

Fonts: Hind Siliguri (SIL OFL). PDF libraries: jsPDF and html2canvas (MIT).

Powered by Robin · [dFaster.com](https://dfaster.com)
