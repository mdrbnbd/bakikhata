/* dFaster Note — cloud switch.
   enabled:true turns on login + cloud sync, but only inside the Android app (it needs the native
   @capacitor-firebase plugins + google-services.json, which are bundled at build time). The web demo
   has no plugins, so it automatically stays local-only. See CLOUD.md.
   phoneEmailDomain: phone+password login uses a synthetic email 8801XXXXXXXXX@<domain> linked to the
   phone-verified account (never shown to the user, never receives mail). Do not change it after launch. */
window.BK_FIREBASE = { enabled: true, projectId: "baki-khata-7e633", phoneEmailDomain: "phone.dfaster.com" };
