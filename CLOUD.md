# dFaster Note: login and cloud sync (Firebase)

**Status in v1.2.0: on.** Firebase project `baki-khata-7e633` (Spark plan, no billing). Package `com.dfaster.bakikhata`.

## What is set up (done from the CLI, see `firebase/`)

| Piece | State |
|---|---|
| Android app `1:15272438227:android:505007090249ce7952a726` | registered, release SHA-1 + SHA-256 added |
| `google-services.json` | fetched with `apps:sdkconfig`, kept at `/workspace/keys/bakikhata-google-services.json` (not in git); `android-app/sync-web.sh` copies it into `android/app/` on every build |
| Auth: Email/Password | enabled (`firebase deploy --only auth`) |
| Auth: Google | enabled, support email md.rbnbd@gmail.com, brand name "dFaster Note" |
| Auth: Phone | **must be enabled in the console** (no CLI/API switch available to us) |
| Firestore | `(default)`, Standard edition, `asia-south1` (Mumbai), delete protection on |
| Firestore rules | `firebase/firestore.rules`, deployed; tested on the emulator (`tools/test/rules.test.js`, 21 checks) |

## Accounts (one uid per person)

- **Register:** shop name, owner, phone, password (≥ 6, typed twice, show/hide 👁) → one SMS OTP (Firebase Phone Auth) → the password is attached to the same account with `linkWithEmailAndPassword` using a synthetic email `8801XXXXXXXXX@phone.dfaster.com` (never shown, never mailed; set in `app/firebase-config.js`, do not change after launch).
- **Login:** phone + password → `signInWithEmailAndPassword(synthetic email)`. **No SMS** is used for normal logins.
- **Forgot password:** phone → OTP → new password (`updatePassword`).
- **Change password (v1.2):** Profile → পাসওয়ার্ড বদলান → current password (re-authentication, no SMS) → new password twice.
- **Google:** "Google দিয়ে লগইন" (`signInWithGoogle`, native Credential Manager).
- **First-login setup (v1.2):** after registration or a Google login, if the profile is incomplete, a 4-step wizard (photo + owner name + phone → shop name, type, address → payment methods → summary) runs. Each step can be skipped; `setupDone` / `setupSkippedAt` are stored in the profile so it is not shown again, and Profile shows the completion percentage.
- **Link the other login (v1.2):** Profile → Google যুক্ত করুন links Google to a phone+password account (`linkWithGoogle`); a Google account can add a phone + password (needs Phone auth, i.e. an OTP). Accounts that were created separately stay separate.
- **Delete account (v1.2):** Profile → একাউন্ট মুছে ফেলুন → confirm, type "মুছুন", password (or Google) re-authentication → all `users/{uid}` data and the Auth user are deleted, then the phone is cleared.
- **লগইন ছাড়া চালান:** still possible; data stays on the phone and the home screen keeps suggesting login. Logging in later uploads it.
- **Logout:** syncs first, then clears the phone (so the next person who logs in on that phone does not see or merge it).

## Data (everything a user has)

- `users/{uid}` → `{profile, settings, updatedAt}`: profile = photo (256 px JPEG), owner, phone, email, shop name/type/address, payment methods (MFS numbers, bank accounts, the uploaded QR payload or a ≤600 px QR image), setup state; settings = theme, auto-SMS, notification and reminder options, opening cash. Only the owner can read this doc (rules). PIN hash/salt, the chosen SIM, permission flags and the last-backup time stay on the phone; the SMS log stays on the phone too.
- `users/{uid}/{parties|entries|txns|cash|products}/{id}`: customers & suppliers (with photo, a ≤160 px JPEG inside the row), ledger entries, sales & purchases, cash in/out & expenses, products.
- Offline first: the UI reads IndexedDB; changes sync 4 s later, at start-up, and when the network comes back. Rows resolve last-writer-wins on `updatedAt`, deletes travel as tombstones; profile/settings resolve last-writer-wins on `_at`.
- **New phone / reinstall:** log in → full pull of the account doc and all five collections. `tools/test/cloud-auth.js` tests a complete wipe → login → restore (counts, balances, cash in hand, photo, profile, settings, tombstones).

## What Robin must click (once)

1. **Enable Phone sign-in.** <https://console.firebase.google.com/project/baki-khata-7e633/authentication/providers> → **Add new provider → Phone → Enable → Save**.
2. **Billing for real SMS.** Since September 2024 Firebase sends real SMS only for projects linked to a Cloud Billing account (Blaze). On Spark:
   - real numbers get an error at the OTP step (the app says "এই মুহূর্তে SMS যাচাই চালু নেই — Google দিয়ে লগইন করুন"), so **phone registration and forgot-password need Blaze**;
   - phone + password **login** needs no SMS, and **Google login works fully on Spark**;
   - **test numbers** work without billing: same page → Phone → *Phone numbers for testing* → add up to 10 fictional numbers in the 01XXXXXXXXX shape, e.g. `+8801999000111` with code `123456` (pick hard-to-guess numbers and codes; they must not belong to real people).
   Blaze pricing is per SMS sent (see <https://cloud.google.com/identity-platform/pricing>). That is Robin's decision; nothing was upgraded.
3. If Blaze is enabled: **Authentication → Settings → SMS region policy → Allow only → Bangladesh**, to block SMS-pumping fraud.
4. Recommended: **App Check → Play Integrity** for the Android app, then enforce it for Firestore (stops scripts that sign in and fill the free quota).
5. If the app is ever published through Google Play with Play App Signing, add Play's app-signing SHA-1 and SHA-256 in Project settings → Your apps (Google sign-in needs them).

## Limits (Spark, free)

- Firestore: 1 GiB stored, 50 000 reads / 20 000 writes / 20 000 deletes per day for the whole project. A typical shop day is a few dozen writes; a fresh-phone restore reads each row once.
- Auth: Email/Password and Google are free with no practical limit (50 000 monthly active users).
- Phone auth: no free SMS without billing (see above).

## Rebuild after changing Firebase settings

```bash
npx -y firebase-tools@latest apps:sdkconfig ANDROID 1:15272438227:android:505007090249ce7952a726 \
  --project baki-khata-7e633 --out /workspace/keys/bakikhata-google-services.json   # only if providers / SHAs changed
cd android-app && ./sync-web.sh && npx cap sync android && cd android && ./gradlew assembleRelease bundleRelease
cd firebase && npx -y firebase-tools@latest deploy --only firestore:rules,auth --project baki-khata-7e633
```
