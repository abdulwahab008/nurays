# Security

The controls that exist in the code today, with where to find them, and the gaps worth knowing about. Deployment
settings that matter for security are in [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

## Authentication

Code: `backend/src/services/auth.service.ts`, `utils/jwt.ts`, `middleware/auth.middleware.ts`.

- **Tokens.** Login returns a JWT access token (`JWT_EXPIRES_IN`, default 24h) and a refresh token
  (`JWT_REFRESH_EXPIRES_IN`, default 30d), signed with `JWT_SECRET`. Each carries a `typ` claim, so a refresh token
  is rejected as an API credential and an access token cannot mint refresh tokens. `POST /auth/refresh` issues a
  new pair.
- **Every request re-checks the user.** `authenticate` loads the user from the database on each call: the account
  must exist and be `active` (suspended gives 403), and the role used is the current one, not the one in the token.
  Socket.IO connections run the same check (`config/socket.ts`).
- **Session revocation.** `User.tokensValidAfter`: any token issued before it is refused (401 `SESSION_REVOKED`),
  access and refresh alike. It is set on password reset, when a phone number is taken over by its proven owner,
  when an unverified-email account is claimed through Google sign-in, when an admin suspends a user, and when a
  user's role changes (hub manager assigned or removed, `admin-people.service.ts`).
- **Passwords.** bcrypt, cost 10. Login for an unknown email still runs a bcrypt comparison against a dummy hash, so
  timing does not reveal whether an account exists; the error is the same for both cases.
- **Email verification.** A random 32-byte token, valid 24 hours, mailed as a link. Password-reset tokens are random,
  single-use, valid for a limited time, and only their SHA-256 hash is stored; the reset endpoint answers
  identically for unknown emails.
- **Phone verification and OTP** (`services/otp.service.ts`): 6-digit code from `crypto.randomInt`, valid 10
  minutes. At most 5 wrong guesses per code (the attempt is claimed atomically before comparing, so parallel
  guesses cannot exceed it), one resend per minute, and at most 5 codes per phone number per hour regardless of IP.
  A code is single-use. If the SMS cannot be sent the code is withdrawn.
- **Phone numbers are not trusted on signup.** A number is marked verified only with a valid OTP. An unverified claim
  on a number loses it to whoever proves ownership, and unverified numbers cannot be used to sign in.
- **Google sign-in** (`services/google-auth.service.ts`): the frontend sends the Google *access token*. The server
  asks Google's `tokeninfo` endpoint which client it was issued to and rejects it unless that is `GOOGLE_CLIENT_ID`
  (so a token a victim granted to another app cannot be replayed), then reads the profile and requires
  `verified_email`. In production an unset `GOOGLE_CLIENT_ID` makes Google sign-in answer 503; in development the
  audience check is skipped when it is unset. If the matching account's email was never verified, its password is
  dropped and its sessions are voided, so someone who pre-registered a victim's email cannot keep access.
- **Privileged roles** (`admin`, `hub_manager`) cannot be self-registered: the register schema only accepts
  `customer`, `seller` and `rider`. Admins are created with `backend/scripts/create-admin.js`; hub managers are
  assigned by an admin.

## Roles and authorization

Roles: `customer`, `seller`, `rider`, `admin`, `hub_manager`.

- **Middleware** (`middleware/auth.middleware.ts`): `authenticate`, `authorize(...roles)` (403
  `INSUFFICIENT_PERMISSIONS`), `requireSeller` (approved and active seller), `blockSuspendedSeller`. Whole routers
  are locked at the top: `admin.routes.ts` and `admin-order.routes.ts` (`authorize('admin')`), `rider.routes.ts`
  (`authorize('rider')`), `seller-order.routes.ts` (`authorize('seller','admin')` plus `blockSuspendedSeller`).
  Riders must also be approved before they can act (`rider.service.ts` `requireRider`).
- **Ownership is checked in services, by querying with the caller's id**, not only by role:
  - Orders are looked up with `customerId: userId` for customer actions (`order.service.ts`, `payment.service.ts`,
    `online-payment.service.ts`); order messages are open only to the customer, the order's sellers, its assigned
    rider, or an admin.
  - A manual transfer can only be confirmed or disputed by the seller the customer was told to pay (the order's
    first item's seller), not by other sellers on a multi-seller order (`confirmManualPayment`).
  - **Hub access**: `hubService.assertHubAccess` lets a hub manager operate only the hub assigned to them (admins any
    hub); a hub with no manager is admin-only. Applied to every `/hubs/:id/...` operation route.
  - **Uploaded-file ownership**: `assertOwnDocument` / `assertOwnPublicImage` (`utils/documents.ts`) require that a
    CNIC, licence, kitchen photo or cover image referenced in an application is a file *this user* uploaded through
    the upload API, never a link to someone else's file or an external URL. Payment receipts get the same check.
  - Socket.IO: joining an order room (`join:order`) is allowed only to parties of that order, and a user removed from
    an order (for example a rider unassigned) is taken out of its room.

## Rate limiting

`backend/src/middleware/rateLimiter.ts`. Counters are in Redis when `REDIS_URL` is set (shared by all instances),
otherwise in memory. If Redis is unreachable, requests are let through rather than refused. The rest of the table
is the production setting; development relaxes some.

| Limiter | Limit | Applied to |
|---|---|---|
| API flood | 1200 / minute / IP | everything under `/api` except health |
| Login | 10 / 15 min / IP | login, Google, reset-password, phone verify |
| OTP | 5 / 15 min / IP | OTP request, forgot-password, phone request |
| Register | 10 / hour / IP | registration |
| Promo validation | 20 / minute / IP | promo codes |
| Uploads | 60 / 10 min / user | all uploads |
| Orders | 20 / 10 min / user | order placement |
| Messages | 60 / 5 min / user | chat and support replies |
| Submissions | 30 / hour / user | reviews, tickets, payment receipts, payment start, wallet top-up |
| Location | 90 / minute / user | rider position updates |

`trust proxy` is set to 1, so deploy with exactly one proxy hop in front, or IP-based limits can be spoofed or
misattributed.

## Input validation

- Request bodies are validated with Zod schemas in `backend/src/validators/` through `validate`, `validateQuery`
  and `validateParams` (`middleware/validation.middleware.ts`); unknown fields are stripped for `validate` and the
  parsed values replace the raw ones. Errors come back as 400 `VALIDATION_ERROR`.
- Database access goes through Prisma (parameterised); the few raw queries use tagged templates with bound values.
- Bodies are limited to 10 MB of JSON; oversized or malformed bodies get 413 / 400 instead of a 500.
- Uploads are held in memory and never written as sent (`services/media.service.ts`). Images are decoded and
  re-encoded with sharp, which rejects non-images and strips EXIF including GPS (input capped at 40 megapixels);
  audio and PDF are checked by magic bytes. Size limits: 8 MB images, 5 MB receipts and chat media, 10 MB
  documents.

## Private files and signed URLs

`backend/src/storage/`. Public images (key prefix `p/`) are served from the CDN. Private files (prefix `x/`:
receipts, CNIC and licence documents, chat media) are never public: the database stores `private:<key>`, and only
code that has already authorised the viewer converts it to a link valid for 10 minutes (`presentFile`). For the
local driver the link is an HMAC-SHA256 signature over key and expiry (`FILE_URL_SECRET`, or derived from
`JWT_SECRET`), checked with a constant-time comparison; served with `Cache-Control: private, no-store`,
`X-Content-Type-Options: nosniff` and a locked-down CSP. For S3 the private bucket must not be publicly readable
(see the deployment guide).

## Payment security

Full flows are in [PAYMENT_GATEWAY_INTEGRATION.md](PAYMENT_GATEWAY_INTEGRATION.md). The controls:

- **Safepay return and webhook are signed.** The customer's return is accepted only with a valid HMAC-SHA256 of the
  tracker using the secret key; the webhook only with a valid `X-SFPY-SIGNATURE` (HMAC-SHA512 of the event data
  using the webhook secret). Both use constant-time comparison; an invalid webhook gets 401 and is logged.
- **Amount and purpose come from our own record.** Each checkout session is stored (`PaymentAttempt`) with its
  order and amount before the customer is sent to Safepay. A confirmation can only settle that session, once
  (row lock), so it cannot be replayed onto another order or amount. A payment smaller than the order total, or for
  an order already paid, is not applied to the order; the money is credited to the customer's wallet instead.
- **A client can never mark an order paid.** `POST /payments/verify` is read-only. The Safepay API lookup is
  diagnostic only and never returns "completed".
- **Fail closed.** The JazzCash and EasyPaisa adapters are stubs that refuse every request and report themselves
  unconfigured; the bank aggregator adapter returns `completed` only after an authenticated server-to-server call
  says paid, and treats errors and unknown states as not paid. Without Safepay keys, online payment is not
  offered.
- **Atomic state changes.** Wallet payment claims the order and debits the wallet in one transaction; wallet debits
  use a conditional update so concurrent requests cannot overdraw; CHECK constraints in the database stop stock and
  wallet balances going negative. Order placement takes an `Idempotency-Key`, so a double tap creates one order.
  Refunds are capped at what was paid under a row lock.
- **Transfers to the kitchen** only move forward from `payment_submitted` by the right party, and the receipt must be
  a private file the customer uploaded.
- **Production config validation** (`config/env.ts`) refuses to start with Safepay keys but no webhook secret, an
  http `BASE_URL`, or an unset `SAFEPAY_SANDBOX`.

## Handover PIN

`services/handover.service.ts`. Every order has a 4-digit code shown only to the customer (the Prisma client omits it
unless selected). The rider, self-delivering kitchen or pickup counter must enter it to complete the handover.
Comparison is constant-time; wrong guesses are counted on the order inside a locked transaction, and after 5 the
code locks (423) and an admin has to complete the handover.

## Audit log

`middleware/audit.ts`, applied to `admin.routes.ts` and `admin-order.routes.ts`. Every non-GET request there is
written to `audit_logs` after the response: user, action (`admin:METHOD /path`), entity id, IP, user agent, the
request body (secret-looking fields such as passwords, tokens and codes redacted; strings truncated; nested depth
and key counts capped) and the response status, including failed attempts. Reads are not logged. Admin actions
exposed elsewhere (for example hub-manager assignment, `PUT /hubs/:id/manager`) are not part of this log. Admins can
read it in the admin area.

## Secrets and configuration

`config/env.ts` runs before anything else and exits with a list of problems in production: missing or short or
placeholder `JWT_SECRET`, missing Redis, email, SMS decision or storage settings, non-https URLs, and
`SMS_PROVIDER=console` (which would print OTP codes). Any `NODE_ENV` other than `development` or `test`
counts as production, so a typo cannot silently enable development fallbacks. The login, register and order limits
are likewise relaxed only in development and test. Secrets are read from the environment only. The full list is in
the deployment guide.

## HTTP hardening

`backend/src/index.ts`: `helmet` with defaults (cross-origin resource policy set to `cross-origin` so images load
from the CDN); CORS limited to the single `CORS_ORIGIN` with credentials, listed methods and headers; the same
origin is used for Socket.IO. Error responses never include stack traces outside `NODE_ENV=development`, and 500s
return a generic message plus a request id. The frontend sends the JWT in the `Authorization` header, not a cookie
(the API reads only that header), which avoids CSRF on the API.

## Logging and error tracking

- Logs are structured (pino), one line per request with a request id. Authorization and cookie headers, passwords,
  OTP codes, tokens and handover codes are redacted by field name (`utils/logger.ts`).
- Sentry (`config/sentry.ts`), when `SENTRY_DSN` is set: reports only 5xx errors and crashes, tagged with request
  id and user id; user info, cookies, headers, request bodies and query strings are not collected, and a
  `beforeSend` hook deletes any that slip through. Browser Sentry is a separate, opt-in DSN.

## Data retention

The `purge-expired-secrets` job (every 6 hours, `order-maintenance.service.ts`) deletes OTP records older than 24
hours and password-reset tokens that expired more than 24 hours ago or were used more than 24 hours ago. The
stale-order sweep cancels unaccepted and unpaid orders (see the deployment guide). There is no automatic deletion of
anything else: orders, ledger entries, chat, uploaded documents and receipts are kept until removed manually.

## Known limitations

- **Refresh tokens are not rotated or revocable one by one.** `/auth/refresh` mints a new pair but the old refresh
  token stays valid until it expires, and `POST /auth/logout` is a no-op on the server. The only way to kill a
  session is `tokensValidAfter` (password reset, suspension, role change); there is no "log out everywhere"
  action for users.
- **OTP codes and email-verification tokens are stored in plain text** in the database (reset tokens are hashed).
  They are short-lived and purged, but a database read exposes live ones.
- **Weak password policy.** Minimum 6 characters, no complexity or breached-password check. There is no
  change-password endpoint for signed-in users; changing it goes through the reset email.
- **Email verification does not gate login or ordering.** A user can sign in unverified; it only affects whether
  email notifications are delivered.
- **Login lockout is per IP only.** There is no per-account lockout for password guessing (the limit is 10 attempts
  per 15 minutes per IP).
- **Legacy public files.** Receipts and chat media uploaded before the storage layer sit under `/uploads` and are
  public by URL; new ones are private. `backend/scripts/migrate-private-uploads.ts` exists for moving them.
- **`create-admin.js` prints the password it was given** and, for an existing email, resets that account's password.
- **The audit log covers the two admin routers only**, not other privileged actions.
- **The frontend stores tokens in browser storage** like most SPAs, so an XSS bug would expose them.
