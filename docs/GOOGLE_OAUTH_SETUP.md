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
| 503 `GOOGLE_NOT_CONFIGURED` | Production backend without `GOOGLE_CLIENT_ID`. |
