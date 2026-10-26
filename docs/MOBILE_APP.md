# The Nuray store apps (Android and iOS)

`mobile/` holds one Capacitor app for both stores. It opens the deployed Nuray website (Capacitor's server URL mode),
so one web build serves browsers and both apps; the website talks to the phone through the native plugins the app
exposes (`window.Capacitor.Plugins`), wired up in `frontend-web/components/NativeBridge.tsx` and
`frontend-web/lib/native-shell.ts`. In a browser none of that code does anything.

- App id `pk.nuray.app`, name **Nuray**.
- Android: `mobile/android` (target API 36, minimum 24). iOS: `mobile/ios` (Swift Package Manager, no CocoaPods).
- CI builds the Android debug app on every push and keeps the APK for a week ("Android app (debug build)").

## What the app does today

| | |
|---|---|
| Opens the website | `NURAY_APP_URL` (built in at sync time). Until it is set a placeholder address stands, and a release build refuses it. |
| No connection | A page in the app (`mobile/www/offline.html`, English and Urdu) with "Try again". |
| Payments | Safepay's pages open inside the app, so a payment comes back to the app's /payment/return page. Other sites open in the in-app browser (links) or the phone's own app (maps, phone numbers): `lib/open-external.ts`. |
| Sign-in | Tokens are also kept in the phone's Keychain (iOS) or Keystore (Android) and come back from there if the WebView's storage was cleared. Android cloud backup is off, so tokens are not copied to Google Drive. |
| Links into the app | `https://<site>/...` (Android App Links; iOS Universal Links once the Associated Domains entitlement is added, see below) and `pk.nuray.app://...` open the page in the app. |
| Android back button | Goes back; on the first page it closes the app. |
| Permissions | Camera (documents and receipts), location while in use (address pin, rider position). |
| Google sign-in | The phone's own Google sign-in (Android's account picker, Google's iOS sheet) instead of the web button, which Google refuses inside an app. It shows only once the client ids below are set. |
| Push notifications | Order and delivery alerts on the phone: the app asks for permission when the person turns them on (Notification settings, or the kitchen's prompt), and a tapped alert opens its page. Android through Firebase (FCM), iPhones through Apple's push service (APNs). Each is on once its settings below are in. |
| Sign in with Apple | On iPhones (App Store rule 4.8 asks for it next to Google). Apple's sheet hands back a signed token that the server checks against Apple's keys (`POST /auth/apple`). |

Still to come: the rider's location in the background during a job.

## Building

```bash
cd mobile
npm ci
NURAY_APP_URL=https://your-site npm run sync      # writes the address into both apps
npm run build:android:debug                       # needs the Android SDK and Java 21
npm run open:ios                                  # needs a Mac with Xcode
```

A store build: `NURAY_APP_URL=https://your-site npm run build:android:release` (an AAB; refuses the placeholder
address), and an Archive from Xcode for iOS.

## What you need before submitting

- **Accounts**: Google Play Console (one-time fee) and Apple Developer Program (yearly).
- **Signing**: an upload key for Play (Play App Signing keeps the app key) and an Apple distribution certificate.
  Put the app's SHA-256 signing fingerprint in `ANDROID_SHA256_CERT_FINGERPRINTS` and the Apple Team ID in
  `IOS_APP_IDS` (`TEAMID.pk.nuray.app`) on the web server, so the site serves the files that let its links open the app.
- **Phone sign-in** and **push** (see below).
- **iOS Universal Links**: in Xcode, add the Associated Domains capability with `applinks:<your-site>` (it needs the
  Team ID, so it is not in the project yet).
- **Icons and screenshots**: the app still has Capacitor's default icon and splash screen; store screenshots and the
  Play feature graphic are needed (MOBILE-12).
- The store questionnaires (data safety, privacy labels, content rating) can be filled from Deliverable 8 of
  `docs/PRODUCTION_READINESS_AUDIT.md`.

## Setting up phone sign-in

Each value is a client id, not a secret. Until it is set, its button does not show, and the server refuses that sign-in
(503) without looking at the token.

**Google** (Google Cloud Console, Credentials, in the same project as the website's Google client):

1. The website's **Web** client id is already `GOOGLE_CLIENT_ID` (server) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (web
   build). Android uses this one too: that is how Google's Android sign-in works.
2. Make an **Android** client for `pk.nuray.app` with the SHA-1 of every key that signs the app: the debug key while
   testing, the upload key, and the Play App Signing key (Play Console, App integrity). A missing SHA-1 shows as a
   cancelled sign-in.
3. Make an **iOS** client for `pk.nuray.app`. Put its id in `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID` (web build), and in
   `mobile/ios/App/App/Info.plist` add its reversed form (`com.googleusercontent.apps.<number>-<id>`) as a URL scheme
   next to `pk.nuray.app`.
4. On the server, `GOOGLE_NATIVE_CLIENT_IDS` lists the Android and iOS client ids (comma-separated).

**Apple** (Apple Developer, needs the paid account):

1. On the App ID `pk.nuray.app`, turn on Sign in with Apple. The app already asks for it (`App.entitlements`).
2. On the server, set `APPLE_CLIENT_IDS=pk.nuray.app`.
3. Apple gives the person's name only at their first sign-in; the app sends it then, to name a new account. Apple may
   give a private relay address (`...@privaterelay.appleid.com`) instead of their e-mail: it works, but e-mail to it
   only arrives once the site's sending domain is registered under Sign in with Apple's e-mail settings.

Check both on real phones before submitting; the tests here use a stand-in for the phone's sign-in sheet.

## Setting up push

Until these are in, the app offers no push for that kind of phone (Notification settings say it is not set up yet),
and the server sends to browsers only.

**Android** (Firebase, free):

1. In the Firebase console, add an Android app `pk.nuray.app` to a project (the same Google Cloud project as sign-in is
   simplest). Download its `google-services.json` into `mobile/android/app/`. The build picks it up by itself.
2. In Project settings, Service accounts, generate a private key. Put the JSON in `FCM_SERVICE_ACCOUNT` on the server
   (as it is, or base64). It is a secret: keep it out of the repository, like the other keys.
3. Set both together. The app asks for a token only when the server says it can reach Android: an app built without
   `google-services.json` cannot make one.

**iPhone** (needs the paid Apple Developer account):

1. On the App ID `pk.nuray.app`, turn on Push Notifications. The app already asks for it (`aps-environment` in
   `App.entitlements`; Xcode switches it to production for App Store builds).
2. In Keys, make a key with Apple Push Notifications service. Put its Key ID in `APNS_KEY_ID`, your Team ID in
   `APNS_TEAM_ID`, and the `.p8` file's text in `APNS_PRIVATE_KEY` on the server. One key serves every app of the team.
3. `APNS_SANDBOX=true` only while testing a build run from Xcode. TestFlight and the App Store use the default (false).

Check on real phones: turn alerts on, place an order to the account's kitchen, and tap the alert.
