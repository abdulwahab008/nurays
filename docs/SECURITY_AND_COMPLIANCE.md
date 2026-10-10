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
  access and refresh alike. It is set on logout, password reset and password change, when a phone number is taken
  over by its proven owner, when an unverified-email account is claimed through Google sign-in, when an admin
  suspends a user, and when a user's role changes (hub manager assigned or removed, `admin-people.service.ts`).
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
  A native app sends a Google *ID token* instead, which the server verifies itself (`utils/google-id-token.ts`):
  RS256 only (never `none`, never a symmetric algorithm), the signature against Google's published keys, Google as
  issuer, an audience in `GOOGLE_CLIENT_ID` or `GOOGLE_NATIVE_CLIENT_IDS`, not expired, e-mail verified. With no client
  id configured an ID token is always refused, development included.
- **Privileged roles** (`admin`, `hub_manager`) cannot be self-registered: the register schema only accepts
  `customer`, `seller` and `rider`. Admins are created with `backend/scripts/create-admin.js`; hub managers are
  assigned by an admin.

## Roles and authorization

Roles: `customer`, `seller`, `rider`, `admin`, `hub_manager`. Admin accounts carry a staff role (`super_admin`, `admin`, `support`), see Admin accounts.

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
| API flood | 1200 / minute / account (signed in) or / IP (anonymous) | everything under `/api` except health |
| Login | 10 failed attempts / 15 min / IP + account, and 100 failed attempts / 15 min / IP across accounts | login, Google, reset-password, phone verify (a successful sign-in is not counted, so a shared mobile-network address never runs out) |
| OTP code | 30 / 15 min / IP, and 3 / 15 min / phone number | OTP request (the database also caps each number: 60 s apart, 5 an hour). The number's key is the number as normalised, hashed |
| Phone verification | 5 / hour / account, and 3 / 15 min / phone number | phone request (signed in) |
| Reset link | 20 / 15 min / IP, and 3 / hour / e-mail address | forgot-password (answers the same whether or not the address has an account). A link made in the last minute is not replaced by a new request |
| Verification e-mail | 3 / hour / account (resend); 3 / hour / inbox (also for e-mail changes: `+tags` and Gmail dots count as the same inbox) | resend-verification, changing the e-mail |
| E-mail change | 3 / hour / account | `PATCH /users/me` with a new `email` |
| Password re-check | 5 wrong passwords / 15 min / account | changing the e-mail (accounts with a password), changing the password and closing the account. Only wrong answers are counted; five stop even the right password until the window ends. A wrong password is a 400 `INVALID_PASSWORD` (a 401 would look like an expired session to the web app) and is written to the audit log (`auth:REAUTH_FAILED`) |
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

## Browser security headers and the Content-Security-Policy

The web app (`frontend-web/next.config.ts`) sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` (camera and location only for the site
itself) and a Content-Security-Policy. HSTS is set at the TLS terminator (see the deployment guide). Fonts and map
assets ship with the build, so the only third-party origins the policy names are Google sign-in, Safepay's
checkout and the configured API, realtime and error-reporting hosts.

The policy is **report-only** until it has been seen to be clean: a browser that meets something the policy would
block still loads it, and posts a report to `/api/csp-report` (`app/api/csp-report/route.ts`). Each violation
becomes one JSON log line, `"type":"csp-violation"`, with the directive, what was blocked and the page, where every
address is cut to origin and path (a password-reset link carries its token in the query string), the script
sample is dropped, and the body and the number of reports per minute are capped. `tests/e2e/csp.spec.ts` checks
the header, both report formats and the redaction, and loads the public pages to prove they report nothing.

To enforce it:

1. Run the report-only build on staging or the soft launch, using every role's screens, for about a week.
2. Search the frontend logs for `"type":"csp-violation"`. A legitimate origin goes into the policy in
   `next.config.ts`; reports whose blocked address is a browser extension (`chrome-extension`, `moz-extension`) are noise.
3. When a week is clean, rebuild the frontend with the build argument `CSP_ENFORCE=true` (in the publish workflow:
   the repository variable `CSP_ENFORCE`). The header becomes `Content-Security-Policy`; reports keep coming, so
   keep the same search saved.

`'unsafe-inline'` stays in `script-src` and `style-src` for now (Next.js's inline bootstrap script and inline
styles); replacing it with per-request nonces is a separate decision.

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

`middleware/audit.ts`. Every non-GET request on the admin routers, and on the other routes an admin can use
(categories, category requests, hub operations and hub manager assignment, deleting product images, and an admin
acting as a kitchen on `/seller/orders/*`), is written to `audit_logs` after the response: user, action
(`admin:METHOD /path`, or `hub:`, `admin-as-seller:`), entity id, IP, user agent, the request body (secret-looking
fields such as passwords, tokens and codes redacted; strings truncated; nested depth and key counts capped) and the
response status, including failed attempts.

Also recorded:

- **Refused access** to the admin area (no token, bad token, or not an admin): `admin:DENIED METHOD /path`, with the
  user if there was one.
- **Admin sign-in events**: `auth:LOGIN`, `auth:LOGIN_FAILED`, `auth:LOGIN_LOCKED`, `auth:LOGIN_REFUSED_OTP`,
  `auth:LOGOUT`.
- **Exports of the audit log itself** (`admin:EXPORT audit-logs`).

**Append-only.** A database trigger (migration `audit_log_append_only`) refuses every UPDATE and DELETE on
`audit_logs`, including from the application's own database user. The one allowed change is detaching an account's
rows (`user_id` set to NULL) when that account is deleted. Rows are written after the response, outside the
mutation's transaction, so a crash in between can lose a row. Reads are not logged.

Admins read and filter it (area, record id, date range, result) and export a CSV (at most 5,000 rows) from the admin
area.

## Admin accounts

Admin accounts are never created through registration. The first one (the super admin) is made with
`scripts/create-admin.js`; every other staff member is added by the super admin at `/admin/staff`. They sign in with
**email and password only**: SMS-code login and Google sign-in are refused (`ADMIN_PASSWORD_ONLY`). After **5 wrong
passwords** the account is locked for 15 minutes (`ACCOUNT_LOCKED`, counted from the audit log). **Logging out ends
every session** the account has, on every device (`tokensValidAfter`; the same is true for every account type, see
Sessions below). Second approvals and two-factor codes do not exist yet (see
Limitations).

### Staff roles

Staff are users with `user_type = 'admin'` and a `staff_role` (database CHECK keeps the two in step):

| Role | How many | What it can do |
|---|---|---|
| `super_admin` | exactly one (partial unique index `users_one_super_admin`) | everything, and only this role adds, changes, suspends or removes staff, edits settings or corrects a rider balance by hand |
| `admin` | any | day to day operations: approvals, orders, people, refunds, payouts, settling with riders, places, promo codes, complaints, reads the audit log |
| `support` | any | the customer support person: looks things up and handles complaints (reply, internal notes, resolve). Cannot move money, approve anyone, change orders, or see applicants' ID documents, settings, analytics or the audit log |

Enforcement is on the server, table driven (`utils/permissions.ts`, `middleware/staff.ts`): every `/admin` request is
matched to a permission; a write no rule names needs `ops.write`, a read no rule names needs `read.core`, so a route
added later is closed to support staff by default. A refusal is 403 `INSUFFICIENT_STAFF_ROLE` and is written to the
audit log. Changing a role, suspending or removing staff ends their sessions at once (millisecond-exact `iatMs` check).
The super admin account cannot be changed through the app. The admin menu and pages only show what a role may use,
but that is convenience, not the security boundary.

## Sessions, email changes and account closure

- Access tokens live **1 hour** by default (`JWT_EXPIRES_IN`), refresh tokens 30 days. The web client renews the
  access token transparently and only signs the person out when the server refuses the refresh token (a dropped
  connection or a server error keeps the session). The realtime connection presents the current token on every
  reconnect.
- **Logout ends every session** of the account (`tokensValidAfter`) and closes its live Socket.IO connections; so
  do suspension, a staff role change, a password reset, a password change and account closure
  (`socketManager.disconnectUser`). Logout also **forgets the account's push subscriptions**, so a browser or phone
  that someone else uses next is not told about the previous account's orders; the web app drops its own
  subscription on sign-out and registers it again for whoever signs in on that browser (`lib/push.ts`,
  `components/AuthProvider.tsx`). A session that simply expired keeps its subscription until the next person signs
  in on that browser, who takes it over.
- **Changing the password while signed in** (`POST /auth/change-password`) asks for the current password again (the
  re-check budget above), judges the new one first so that a weak one costs no attempt, refuses the same password,
  and ends every session of the account; the session that made the change is handed fresh tokens, so the person
  stays signed in. An account with no password cannot be given one by a token alone (400 `NO_PASSWORD_SET`): it
  sets one through "forgot password", which writes only to a verified address. The change is audited
  (`auth:PASSWORD_CHANGED`) and the owner is e-mailed.
- **The owner hears of a change they may not have made.** A password change e-mails the account's verified address,
  and so does an e-mail change, to the address the account *leaves*, naming the new one only in part (never in full)
  and the time (Pakistan time). Both are queued (a mail server that is down neither undoes nor delays the change)
  and neither is sent to an address nobody has proven (it may be a stranger's). There is no link to undo a change
  in the notice yet: it points to the help page, where the person can write to support.
- **Changing the email address** on an account that has a password requires the current password
  (`PATCH /users/me` with `currentPassword`, else 400 `PASSWORD_REQUIRED`), and the new address is unverified until
  its owner confirms it. **Password-reset links are only ever sent to a verified address**, so a copied token cannot
  be turned into a permanent takeover by re-pointing the account.
- New passwords must be **at least 8 characters** (staff: 12), not one of the ~9,000 most common passwords (SecLists
  top 10,000 plus a few local ones; "Password123!" counts as the common word with a tail), and not contain the
  person's own e-mail name, phone number, name or "Nuray" (`utils/password-rules.ts`, refused with 400
  `WEAK_PASSWORD` and the reason in `details.reason`; a password that is too short is turned away earlier by the request schema, as 400 `VALIDATION_ERROR`, on the sign-up, reset and staff-management routes, and as `WEAK_PASSWORD` with `TOO_SHORT` and `minLength` on a staff member's own reset link). This applies when a password is chosen: sign-up, reset and a
  staff member's first password (`create-admin.js` and `reset-admin-password.js` too). Sign-in does not check it,
  so existing accounts keep working. Staff passwords are held to twelve characters on every path, including the
  public reset link.
- **Account closure** is self-service (`DELETE /users/me`, the Delete account button on the profile, and the public
  page `/delete-account` the app stores link to): personal details, addresses, cart, favourites, push subscriptions
  and ID documents are removed or replaced, the account is marked `deleted` and signed out everywhere; orders,
  payments, the ledger and the audit trail are kept without identifying details. It is refused while an order is in
  progress, the wallet holds money, a rider has cash or pay unsettled, or a kitchen has open orders or a pending
  payout; staff accounts are removed by the super admin.
- A rider carrying an order sees the order without the customer's bank-transfer details, receipt, the kitchen's fee
  breakdown or internal keys; raw product variants (cost prices) are only readable by the kitchen that owns them.

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

What to keep, for how long, and what to alert on is in [OPERATIONS_AND_LOGGING.md](OPERATIONS_AND_LOGGING.md).

The `purge-expired-secrets` job (every 6 hours, `order-maintenance.service.ts`) deletes OTP records older than 24
hours and password-reset tokens that expired more than 24 hours ago or were used more than 24 hours ago. The
stale-order sweep cancels unaccepted and unpaid orders (see the deployment guide). There is no automatic deletion of
anything else: orders, ledger entries, chat, uploaded documents and receipts are kept until removed manually.

## Known limitations

- **Refresh tokens are not rotated or revocable one by one.** `/auth/refresh` mints a new pair but the old refresh
  token stays valid until it expires or the account's sessions are ended as a whole (`tokensValidAfter`: logout,
  password reset, password change, suspension, role change, account closure). There is no per-device session list.
- **OTP codes and email-verification tokens are stored in plain text** in the database (reset tokens are hashed).
  They are short-lived and purged, but a database read exposes live ones.
- **No breached-password lookup.** Passwords are checked against a bundled list of common ones, not against a live
  breach database (that would send part of a hash to an outside service). There is no change-password endpoint for
  signed-in users; changing it goes through the reset email.
- **Email verification does not gate login or ordering.** A user can sign in unverified; it only affects whether
  email notifications are delivered.
- **Customer, kitchen and rider logins have no per-account lockout.** Password guessing is limited per address and
  account together (10 failures / 15 min) and per address (100 / 15 min), not per account across addresses, because a
  hard per-account limit would let anyone lock a stranger out. Staff accounts do lock (see Admin accounts).
- **Legacy public files.** Receipts and chat media uploaded before the storage layer sit under `/uploads` and are
  public by URL; new ones are private. `backend/scripts/migrate-private-uploads.ts` exists for moving them.
- **`create-admin.js` resets the password** of an account that already has the email (and signs it out everywhere); it no longer prints the password.
- **All admins are equal.** There are no separate roles (finance, support), no limits or second approval on refunds, payouts and rider corrections, and no two-factor sign-in. Reading screens (customer details, payment proofs, rider money) is not logged.
- **The frontend stores tokens in browser storage** like most SPAs, so an XSS bug would expose them.
