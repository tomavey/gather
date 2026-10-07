# gather

Local Nuxt app you can connect to Firebase.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app starts without Firebase credentials.

## Connect Firebase

1. In the [Firebase console](https://console.firebase.google.com/), open **Project settings → General → Your apps** and copy the web app config.
2. Copy `.env.example` to `.env` and fill in the values.
3. Restart `npm run dev`.

[VueFire](https://vuefire.vuejs.org/nuxt/getting-started.html) is included. After the config is set, `useFirebaseApp()` is available, along with the Firestore, Realtime Database, and Storage composables.

If the Firebase emulator suite is running on this machine, VueFire connects to it automatically.

Auth is off so the app can run locally without a service account. To turn it on, install `firebase-admin`, set `vuefire.auth.enabled` to `true` in `nuxt.config.ts`, and point `GOOGLE_APPLICATION_CREDENTIALS` at a service account JSON file (see `.env.example`). Do not commit `.env` or `service-account.json`.
