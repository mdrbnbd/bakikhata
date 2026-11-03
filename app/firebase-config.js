/* বাকি খাতা — cloud switch.
   null  = cloud OFF (current state): registration is saved on this phone only, no OTP, no sync.
   To turn it on (after the Firebase project exists and google-services.json is in android-app/android/app/):
     window.BK_FIREBASE = { enabled: true, projectId: "<firebase project id>" };
   and install @capacitor-firebase/authentication + @capacitor-firebase/firestore in android-app/. See CLOUD.md. */
window.BK_FIREBASE = null;
