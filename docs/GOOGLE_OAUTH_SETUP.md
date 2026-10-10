# Google sign-in setup

Nuray can offer "Continue with Google" on the login and register pages. It is optional: without a client ID the
button is shown disabled and email/phone sign-in keeps working.

## How it works

1. The browser (`frontend-web/components/GoogleSignInButton.tsx`, using `@react-oauth/google`) opens Google's
   consent popup with `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and receives an access token.
2. The frontend posts it to `POST /api/v1/auth/google` with body `{ "accessToken": "..." }`
   (`frontend-web/lib/services/auth.service.ts`).
3. The backend (`backend/src/services/google-auth.service.ts`) checks with Google's `tokeninfo` that the token was
   issued to `GOOGLE_CLIENT_ID`, loads the profile, and requires a verified Google email.
4. An account with that email is signed in; if none exists, a new `customer` account is created with the email
   already verified and no password. Suspended accounts are refused. Response: the usual user plus access and
   refresh tokens.

Sellers and riders cannot be created through Google; they register by email and then apply. A Google-only account
can set a password later with "forgot password".

### A native app sends an ID token instead

The popup above does not work inside a phone app's web view, and a native Google sign-in (the Android and iOS
Google SDKs, through a Capacitor plugin) produces an **ID token** (a signed JWT) rather than an access token. The same
endpoint takes it as `{ "idToken": "..." }`: send either `accessToken` or `idToken`, never both (400). The backend
does not call Google to check an ID token; it verifies it itself (`backend/src/utils/google-id-token.ts`):

- the signature is RS256 and matches one of Google's published keys (`https://www.googleapis.com/oauth2/v3/certs`,
  cached for as long as Google says, fetched again when an unknown key id appears); every other algorithm, including
  `none`, is refused;
- the issuer is Google, the audience (`aud`) is one of the client IDs below, the token has not expired (a minute of
  clock drift is allowed), and it carries a verified email.

From there it is the same sign-in as with an access token. Set `GOOGLE_NATIVE_CLIENT_IDS` to the extra client IDs your
apps' tokens are issued to, comma separated (the **Android** and **iOS** OAuth clients you create next to the web one,
unless the app asks Google for a token for the web client, in which case the web client ID is all that is needed).
Unlike the access-token path there is no development shortcut: with no client ID set at all, an ID token is refused
with 503 `GOOGLE_NOT_CONFIGURED`. Nothing in the web app changes. The native shell itself (the plugin that produces the
token) does not exist yet.

## Create the client ID

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or pick a project.
2. APIs & Services, OAuth consent screen: set the app name to Nuray, add a support email, and add the `email`,
   `profile` and `openid` scopes. Leave it in Testing (add test users) until you publish it.
3. Credentials, Create credentials, OAuth client ID, type **Web application**.
4. Authorized JavaScript origins: the site's origin exactly as users see it, for example
   `http://localhost:3000` for development and `https://www.yourdomain.pk` for production. No redirect URIs are
   needed (the popup flow does not use them).
5. Copy the Client ID.

## Configure Nuray

| Where | Variable | Value |
|---|---|---|
| `backend/.env` | `GOOGLE_CLIENT_ID` | the client ID |
| `backend/.env` (native apps only) | `GOOGLE_NATIVE_CLIENT_IDS` | the Android and iOS client IDs, comma separated |
| `frontend-web/.env.local` (or build arg) | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | the same client ID |

They must be identical, or the backend rejects the token ("Google token was not issued for this app").
`NEXT_PUBLIC_*` values are baked in at build time, so rebuild the frontend after changing it (Docker: build arg
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`, or the repository variable of the same name for the publish workflow). Restart the
backend after changing `GOOGLE_CLIENT_ID`.

In production the backend answers 503 `GOOGLE_NOT_CONFIGURED` if `GOOGLE_CLIENT_ID` is unset. In development, with
it unset, the audience check is skipped, which is convenient locally but not something to rely on.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Button is greyed out | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` was empty when the frontend was built. |
| Popup error "origin_mismatch" | The page's origin is not in the client's Authorized JavaScript origins. |
| "Access blocked" for some users | The consent screen is in Testing and the user is not a listed test user. |
| 401 "Google token was not issued for this app" | Backend and frontend client IDs differ. |
| 401 "Your Google email is not verified" | Google reports the email as unverified. |
| 503 `GOOGLE_NOT_CONFIGURED` | Production backend without `GOOGLE_CLIENT_ID`; or an ID token sent to a backend with no Google client ID at all. |
| 401 `INVALID_GOOGLE_TOKEN` on an ID token | Not signed by Google, expired, or issued to a client ID that is not `GOOGLE_CLIENT_ID` or in `GOOGLE_NATIVE_CLIENT_IDS`. |
| 503 `GOOGLE_UNAVAILABLE` | Google's keys could not be fetched (and none are cached) or Google was too slow. Try again. |
