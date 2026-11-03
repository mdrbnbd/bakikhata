# বাকি খাতা: phone-number login and cloud sync (Firebase)

**Status in v1.0.0: inactive.** The app ships with `app/firebase-config.js` set to `window.BK_FIREBASE = null`. In that state:

- the first-run **registration** screen collects shop name, owner name and mobile number and saves them **on the phone only** (`verified: false`);
- every record is still stored sync-ready, so turning the cloud on later needs **no data migration**. Each row has a `uuid` id, `createdAt`, `updatedAt`, a `deleted` tombstone and a `dirty` flag;
- users move to a new phone with **Settings → ব্যাকআপ ফাইল** (JSON export/import).

## How it works once enabled

- `app/js/cloud.js` is the only module that talks to the backend. Screens call `Cloud.sendOtp / confirmOtp / sync / signOut / status`.
- **Login.** Firebase Auth phone sign-in (`+8801XXXXXXXXX`). Android can auto-read the SMS (instant verification); otherwise the user types the 6-digit code.
- **Data.** Firestore stores rows under `users/{uid}/{parties|entries|txns|cash|products}/{id}` and the shop profile under `users/{uid}`.
- **Offline first.** The UI always reads local IndexedDB.
  - Every change marks its row `dirty`.
  - Sync runs at startup, 4 s after each change, and when the network comes back. It pushes dirty rows (batched set+merge) and pulls rows whose `updatedAt` is newer than the last pull, with a 5-minute overlap to absorb clock skew.
  - Conflicts are resolved **last-writer-wins** on `updatedAt`. Deletes travel as tombstones.
- **New phone.** Install, enter the same number, enter the OTP. `completeSignIn` restores the profile, then does a full pull, and all balances come back. The headless test covers this with an in-memory adapter: push everything, wipe local data, pull everything, compare totals.

## What Robin needs to do (one time, free Spark plan, no card needed)

1. Go to <https://console.firebase.google.com> → **Add project** (for example `bakikhata`). Google Analytics is not needed and can be turned off.
2. **Add app → Android**:
   - Package name: **`com.dfaster.bakikhata`**
   - App nickname: বাকি খাতা
   - Debug signing SHA-1: you can paste the release SHA-1 below.
3. **Project settings → Your apps → Android app → Add fingerprint**. Add **both** fingerprints of the release keystore (`/workspace/keys/bakikhata-release.jks`, alias `bakikhata`):
   - SHA-1: `7F:3C:3E:D5:EF:7F:2F:13:D2:12:12:79:06:B0:ED:F9:7F:1D:75:E6`
   - SHA-256: `A9:8F:F6:1E:9B:35:9F:F9:AF:00:69:0D:41:5D:97:3F:A7:7D:3B:77:77:4A:F2:6B:AC:8F:94:AD:B8:5B:A0:52`

   If the app is ever distributed through Google Play with Play App Signing, also add Play's "App signing key" SHA-1/SHA-256 from Play Console → Setup → App integrity.
4. Download **`google-services.json`** and send it. Do **not** commit it; it is git-ignored.
5. **Build → Authentication → Get started → Sign-in method → Phone → Enable.**
   - Optional: add test numbers, for example `+8801700000000` with code `123456`, for testing without real SMS.
   - Free quota: about 10 SMS verifications a day on Spark. For more, upgrade to Blaze (pay-as-you-go). That is Robin's decision; nothing is purchased here.
6. **Build → Firestore Database → Create database**: production mode, location `asia-south1` (Mumbai) or the nearest region.
7. **Firestore → Rules**, publish:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // each shop owner can read/write only their own data
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
8. Optional but recommended: **App Check → Play Integrity** for the Android app, to stop SMS-pumping abuse of phone auth. Also set an SMS region policy that allows only Bangladesh (Authentication → Settings → SMS region policy → Allow → BD).

## What gets wired up once `google-services.json` arrives

```bash
cd android-app
npm install @capacitor-firebase/authentication @capacitor-firebase/firestore firebase
cp ~/google-services.json android/app/google-services.json   # build.gradle applies the google-services plugin when it exists
```

1. `capacitor.config.json`:

   ```json
   "plugins": { "FirebaseAuthentication": { "skipNativeAuth": false, "providers": ["phone"] } }
   ```
2. `app/firebase-config.js`:

   ```js
   window.BK_FIREBASE = { enabled: true, projectId: "<project id>" };
   ```
3. Run `./sync-web.sh && npx cap sync android`, bump `versionCode`/`versionName`, run `./gradlew assembleRelease bundleRelease`, check with `apksigner verify`, and release v1.1.0.
4. On the next start, users who registered offline see **সেটিংস → ক্লাউড ও লগইন → 📱 ফোন নম্বর দিয়ে লগইন**. After the OTP, their existing local data is pushed to their account. New installs get the OTP step inside registration.
5. Test on a real phone: OTP (real number plus a test number), auto-verification, a second phone with the same number restoring data, and offline edits syncing later.
