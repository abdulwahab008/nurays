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
| Sign in with Apple | On iPhones (App Store rule 4.8 asks for it next to Google). Apple's sheet hands back a signed token that the server checks against Apple's keys (`POST /auth/apple`). |

Still to come, each in its own PR: push notifications (FCM and APNs); the rider's location in the background during a
job.

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
- **Phone sign-in** (see below).
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
