# Deployment guide

How to run Nuray in production. For local development see the root [`README.md`](../README.md).
Every backend setting is documented in [`backend/.env.example`](../backend/.env.example); the frontend's in
[`frontend-web/.env.example`](../frontend-web/.env.example).

## What you run

| Piece | Notes |
|---|---|
| Backend (Node 22, Express) | Stateless; run one or more instances behind a load balancer. Port 3001 in the Docker image. Serves the REST API under `/api/v1` and Socket.IO on the same port. |
| Frontend (Next.js 16) | `output: "standalone"` server on port 3000. It also proxies `/uploads`, `/media` and `/files` to the backend (`frontend-web/next.config.ts`), using `NEXT_PUBLIC_API_URL` at build time. |
| PostgreSQL 15+ | Must allow `CREATE EXTENSION pg_trgm` (the baseline migration creates it; search typo tolerance uses it). |
| Redis 7+ | Required in production (see "Several instances"). |
| File storage | S3-compatible bucket plus a CDN (`ASSET_BASE_URL`) is recommended; local disk works for a single server with a persistent, backed-up volume. |
| SMTP | Required: verification and password-reset emails. |
| Twilio | Required for phone OTP, unless `SMS_PROVIDER=none`. |
| Safepay | Optional. Without keys, online payment and wallet top-ups are not offered. |
| VAPID keys | Optional. Without them there is no web push. |
| Sentry (or GlitchTip) | Optional error tracking, backend and browser. |

Put TLS in front of both services and send `Strict-Transport-Security: max-age=31536000; includeSubDomains` from
the TLS terminator once every hostname is served over https (the apps do not set it themselves, so a plain-http
staging host is never locked out). The backend trusts `TRUST_PROXY` hops (default 1), so the number of proxies
between the internet and the app must match (`backend/src/index.ts`); rate limits key on the client IP it reports.

Browser-facing hostnames: the website (`FRONTEND_URL`, also `CORS_ORIGIN`) and the API (`BASE_URL`). The backend
allows exactly one CORS origin, so serve the site from a single origin.

## Backend environment variables

Required means the server will not start in production without it (see "Startup validation").

### Core

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | set it | Only `development` and `test` relax checks. Anything else, including unset or a typo, runs with production rules. |
| `PORT` | no | The Docker image sets 3001. Without it the code falls back to 3000. |
| `API_VERSION` | no | Default `v1`. |
| `DATABASE_URL` | yes | PostgreSQL connection string. |
| `REDIS_URL` | yes (production) | |
| `JWT_SECRET` | yes | 32+ characters, not a placeholder in production. `openssl rand -hex 32`. |
| `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | no | Defaults: `1h` (the app renews it with the refresh token) and `30d`. |
| `GOOGLE_CLIENT_ID` | no | Google sign-in; see [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md). |
| `FRONTEND_URL` | yes (production) | Must be `https://`. Used in email links. |
| `CORS_ORIGIN` | yes | The one browser origin allowed for HTTP and Socket.IO, an https:// origin (normally the same as `FRONTEND_URL`). Production refuses to start without it. |
| `BASE_URL` | when Safepay is on | The API's public `https://` URL. |

### Email (one of two)

| Variable | Required | Notes |
|---|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | yes (or Gmail) | Any SMTP provider. With `SMTP_HOST` set, user and password are required. |
| `EMAIL_SERVICE=gmail`, `EMAIL_USER`, `EMAIL_PASSWORD` | alternative | Gmail with an app password. |
| `EMAIL_FROM` | yes (production) | e.g. `Nuray <noreply@yourdomain.pk>`. |

### SMS

| Variable | Required | Notes |
|---|---|---|
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | yes, or `SMS_PROVIDER=none` | |
| `SMS_PROVIDER` | no | `twilio`, `console` (refused in production: it prints OTP codes), or `none` (no phone OTP). Empty picks Twilio when all three Twilio values are set, otherwise `none` in production. |

### Storage

| Variable | Required | Notes |
|---|---|---|
| `STORAGE_DRIVER` | no | `local` (default) or `s3`. Anything else is refused in production. |
| `UPLOADS_DIR` | yes for `local` | Persistent, backed-up volume. The Docker image sets `/app/uploads`. |
| `S3_BUCKET`, `ASSET_BASE_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | yes for `s3` | `ASSET_BASE_URL` is the CDN or bucket public URL. |
| `S3_PRIVATE_BUCKET` | no | Defaults to `S3_BUCKET`. Must not be publicly readable. With one shared bucket, allow public reads only for keys starting `p/`. |
| `S3_REGION` (default `auto`), `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | no | R2, MinIO and B2 need `S3_ENDPOINT`; MinIO usually needs path style. |
| `FILE_URL_SECRET` | no | Signs private-file links for the local driver. Defaults to a value derived from `JWT_SECRET`. |

Public files (key prefix `p/`: product images, avatars) are served from the CDN. Private files (key prefix `x/`:
payment receipts, seller and rider documents, chat media) are never public; the API hands out links valid for
10 minutes (`backend/src/storage/index.ts`).

### Online payments and wallet

| Variable | Required | Notes |
|---|---|---|
| `SAFEPAY_PUBLIC_KEY`, `SAFEPAY_SECRET_KEY` | optional | Both together switch online payment on. |
| `SAFEPAY_WEBHOOK_SECRET` | yes if the keys are set | |
| `SAFEPAY_SANDBOX` | yes if the keys are set | Must be exactly `true` or `false`. `false` is live. |
| `SAFEPAY_API_URL`, `SAFEPAY_CHECKOUT_URL` | no | Override the Safepay API and hosted-checkout hosts (default: the sandbox or live pair chosen by `SAFEPAY_SANDBOX`). Only for a proxy or a test double. |
| `WALLET_TOPUP_MAX` | no | Largest single top-up, Rs. |

### Other

| Variable | Required | Notes |
|---|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional, as a pair | Setting only one of the keys stops startup. `npx web-push generate-vapid-keys`. |
| `RIDER_CASH_LIMIT` | no | Rs, default 10000; must be above 0 if set. |
| `ORDER_ACCEPT_TIMEOUT_MINUTES` (30), `ORDER_PAYMENT_TIMEOUT_MINUTES` (60), `PAYMENT_CONFIRM_ESCALATE_HOURS` (6) | no | Used by the stale-order sweep. |
| `BANK_API_URL`, `BANK_MERCHANT_ID`, `BANK_API_KEY`, `BANK_RETURN_URL` | no | Placeholder for a bank gateway that is not implemented. Leave empty. See [PAYMENT_GATEWAY_INTEGRATION.md](PAYMENT_GATEWAY_INTEGRATION.md). |
| `LOG_LEVEL`, `LOG_FORMAT` | no | Default `info`. |
| `SLOW_REQUEST_MS` | no | A request slower than this is logged as a warning, so it can be alerted on. Default 2000. |
| `AUTO_ASSIGN_ENABLED` | no | Automatic rider assignment (see "Background jobs"). Anything but `false` leaves it on; `false` keeps every job in the open pool for riders to claim by hand. |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE` | no | Sentry is off when `SENTRY_DSN` is empty. The traces rate is the share of requests traced, 0 to 1; default 0. |
| `SHUTDOWN_DRAIN_MS`, `SHUTDOWN_GRACE_MS` | no | See "Graceful shutdown". |
| `MIGRATE_ON_START` | no | Docker image only; see "Migrations". |

## Frontend variables

All `NEXT_PUBLIC_*` values are inlined into the JavaScript at build time. Changing one means rebuilding the image
(the Dockerfile takes them as build args; `docker-compose.yml` and the publish workflow pass them through).

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | Public API URL including `/api/v1`, e.g. `https://api.example.pk/api/v1`. Also decides where the Next.js rewrites send `/media`, `/files`, `/uploads`. |
| `NEXT_PUBLIC_WS_URL` | no | Socket.IO origin when it is not the API's origin. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | no | Same client ID as the backend's `GOOGLE_CLIENT_ID`. |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_RELEASE` | no | Browser error tracking; nothing loads when empty. Build time, like every `NEXT_PUBLIC_*`: the publish workflow passes them as build args (the release defaults to the commit). |
| `NEXT_PUBLIC_LEGAL_COMPANY_NAME`, `NEXT_PUBLIC_LEGAL_ADDRESS`, `NEXT_PUBLIC_SUPPORT_EMAIL` | set before launch | Shown on the Terms, Privacy and Refund pages; bracketed placeholders appear until set. |
| `NEXT_PUBLIC_LEGAL_REVIEWED` | no | Set `true` once a lawyer has reviewed the text to remove the "draft" notice. A build with it `true` and any of the three details above empty fails (`next.config.ts`), so reviewed pages never carry placeholders. In the publish workflow the repository variables of the same names are checked before the frontend image is built: a push to `main` only warns when they are missing or the pages are not marked reviewed, a `v*` release tag fails. |
| `NEXT_PUBLIC_ENABLE_DEMO_LOGIN` | no | Never `true` on a real site; it shows one-click demo accounts. |
| `ANDROID_APP_PACKAGE`, `ANDROID_SHA256_CERT_FINGERPRINTS` | when the Android app exists | Server-side, runtime (no rebuild). The app's package name (e.g. `pk.nuray.app`) and the SHA-256 fingerprints of its signing certificates, comma separated: the upload key's and, with Play App Signing, Google's. The site serves `/.well-known/assetlinks.json` from them so the app opens without a browser bar and links open the app. Both must be set and valid, or the file is a 404 (a value that is set but invalid is logged as a warning). |
| `IOS_APP_IDS` | when the iOS app exists | Server-side, runtime. The app's id or ids, `TEAMID.bundle.id`, comma separated. The site serves `/.well-known/apple-app-site-association` from it (every path opens the app except `/api/*` and `/admin/*`); 404 while unset. |
| `CSP_ENFORCE` | no | Build time. `true` enforces the Content-Security-Policy; anything else leaves it report-only, with violations logged by `/api/csp-report`. Switch after a clean week (see "Browser security headers" in [SECURITY_AND_COMPLIANCE.md](SECURITY_AND_COMPLIANCE.md)). In the publish workflow it is the repository variable `CSP_ENFORCE`. |
| `NEXT_PUBLIC_MAP_TILE_URL`, `NEXT_PUBLIC_MAP_ATTRIBUTION` | production | Build time. Map tiles default to the public OpenStreetMap server, whose policy allows only light use: set a tile provider you have an account with (its `{z}/{x}/{y}` URL and required attribution). |
| `NOMINATIM_BASE_URL` | production | Server-side. Geocoder for address search and map-pin lookups; defaults to public Nominatim (one request a second, answers cached 10 minutes). Use your own or a paid one at real traffic. |
| `NOMINATIM_USER_AGENT` | recommended | Server-side only (runtime, not build time). Contact string for OpenStreetMap's geocoder. |
| `NOMINATIM_API_KEY`, `NOMINATIM_API_KEY_PARAM` | with a paid geocoder | Server-side, runtime. The account key and the query parameter it travels in (default `key`; Geoapify uses `apiKey`). It is added to every upstream request and never to a cache key or a response. |
| `NOMINATIM_MIN_INTERVAL_MS`, `NOMINATIM_MAX_PENDING` | with a paid geocoder | Server-side, runtime. Pause between upstream calls (default 1100, the public server's one request a second; `0` for none) and how many lookups may wait their turn before the next is told to retry with 503 (default 20). Raise both only as far as the provider's plan allows. |
| `GEOCODE_PER_IP_PER_MINUTE` | no | Server-side, runtime. Address lookups one client address may make a minute before it gets 429 (default 120). Generous on purpose: many users share one mobile-network address. It reads the first address in `X-Forwarded-For`, so it only restrains clients when your proxy sets that header itself; the queue cap above still protects the geocoder either way. |

The Dockerfile and compose file also pass `NEXT_PUBLIC_SAFEPAY_SANDBOX`; nothing in the frontend code reads it.

## Startup validation

`backend/src/config/check-env.ts` runs `validateConfigOrExit()` from `backend/src/config/env.ts` before anything
else. It prints every problem and exits with code 1. In production (any `NODE_ENV` other than `development` or
`test`) it refuses to start when:

- `DATABASE_URL` or `JWT_SECRET` is missing, `JWT_SECRET` is under 32 characters, or it is a placeholder (sample
  value, `change-me`, starts with `your-`, a single repeated character, and so on).
- `REDIS_URL` or `FRONTEND_URL` is missing, or `FRONTEND_URL` is not `https://`.
- Email is not SMTP or Gmail, the chosen mode lacks its user and password, or `EMAIL_FROM` is missing.
- `SMS_PROVIDER=console`, or SMS resolves to `none` without `SMS_PROVIDER=none` being set explicitly.
- Safepay keys are set but `BASE_URL` is not `https://`, `SAFEPAY_WEBHOOK_SECRET` is empty, or `SAFEPAY_SANDBOX` is
  not `true`/`false`.
- `STORAGE_DRIVER=s3` without bucket, `ASSET_BASE_URL`, access key and secret; `STORAGE_DRIVER=local` without
  `UPLOADS_DIR`; or a driver other than `local`/`s3`.

In every mode it refuses a missing `DATABASE_URL`/`JWT_SECRET`, a short `JWT_SECRET`, a half-set VAPID pair, and a
`RIDER_CASH_LIMIT` that is not above 0. Non-fatal warnings are printed for a missing or unrecognised `NODE_ENV`, no
VAPID keys, and local storage in production.

Note that `docker-compose.yml` sets `FRONTEND_URL: http://frontend:3000` for the backend container. That is for local
use; production (`https://` required) must override it.

## Migrations

Details are in [`backend/prisma/README.md`](../backend/prisma/README.md). In short:

```bash
cd backend
DATABASE_URL=... npm run db:migrate    # prisma migrate deploy: new database, or pending migrations
DATABASE_URL=... npm run db:check      # exit 0 if the database matches schema.prisma, 2 if not
DATABASE_URL=... npm run db:baseline   # once, for a database created before the migration baseline
```

- Never use `prisma db push` on a real database: it skips the CHECK constraints (stock and wallet balances cannot
  go negative) and records no history.
- Apply migrations as a release step before rolling out, or set `MIGRATE_ON_START=true` on the container, which runs
  `prisma migrate deploy` before starting node. Prisma takes a database lock, so several instances starting together
  are safe. Write migrations that the old code can run against (add first, remove later).
- `db:baseline` is only for databases built with `db push` or the old migration set. It stops with the SQL to review
  if the database differs from the baseline schema. It uses `ts-node` (a dev dependency), so run it from a checkout
  with dev dependencies, not from the production image.

## Rollback and failed migrations

Migrations are forward-only SQL (Prisma writes no down scripts), so the safety net is a backup and the rule that
every migration is expand-only (add tables, columns and indexes; never drop or add a NOT NULL without a default
in the same release as the code that stops using the old shape).

1. **Before every release that carries a migration**, take a database snapshot (`pg_dump -Fc`, or the managed
   provider's point-in-time snapshot) and note the image tag currently running.
2. **Apply migrations as a release step** (`DATABASE_URL=... npm run db:migrate` from a checkout of the release
   commit), not only through `MIGRATE_ON_START`: a failing migration at container start crash-loops the service
   under `restart: unless-stopped` and the runtime image has no tooling to repair it.
3. **If `migrate deploy` fails**: read the `_prisma_migrations` table to see which migration is marked as failed,
   fix the cause by hand (or restore the snapshot if the migration partly applied), then mark it with
   `npx prisma migrate resolve --rolled-back <migration_name>` (or `--applied` if it did complete) from a checkout,
   and run `migrate deploy` again.
4. **Rolling the code back** is a redeploy of the previous image tag (`ghcr.io/.../backend:sha-<short>`); because
   migrations are expand-only the previous code keeps working against the newer schema. Rolling the schema itself
   back means restoring the snapshot, which loses writes made since: only do it within the release window.
5. Rehearse 3 and 4 on staging once per quarter; the go-live checklist below includes the first rehearsal.

## Docker

| File | What it does |
|---|---|
| `backend/Dockerfile` | Builds TypeScript, then a runtime image with production dependencies only, running as a non-root user. `NODE_ENV=production`, `PORT=3001`, `UPLOADS_DIR=/app/uploads`, a `HEALTHCHECK` on `/api/v1/health`. `exec node dist/index.js` keeps node as PID 1 so SIGTERM reaches it. The image contains `dist` and `prisma`, not `scripts/`. |
| `frontend-web/Dockerfile` | Next.js standalone build with the `NEXT_PUBLIC_*` build args, non-root, port 3000, healthcheck on `/`. |
| `docker-compose.yml` | Builds both images for local use. Expects PostgreSQL and Redis on the host (`host.docker.internal`), mounts a named `uploads` volume, `stop_grace_period: 30s`, and starts the frontend after the backend is healthy. It is not a full production stack: it has no database, Redis, TLS or proxy. |
| `.github/workflows/docker-publish.yml` | On pushes to `main` and `v*` tags (or manually), builds both images and pushes them to GitHub Container Registry as `ghcr.io/<owner>/nuray-backend` and `nuray-frontend`. Tags: `main` and `sha-<short>` on `main`; the version, `major.minor` and `latest` on `v*` tags. Frontend build args come from repository variables (`vars.NEXT_PUBLIC_API_URL`, and so on). Without them it bakes in `http://localhost:3001/api/v1`, so set the variables before using these images in production. |

Both runtime images take Debian's pending security updates at build time and contain `node` only: npm, npx, corepack
and yarn are removed after the build, which takes their bundled libraries out of the image scan. Run one-off Prisma
commands from a checkout of the release, or inside the backend container as `node_modules/.bin/prisma ...`
(`MIGRATE_ON_START` uses the same path).

`.github/workflows/ci.yml` (typecheck, build, Docker build with a Trivy scan of both images, Playwright) runs on pull
requests and on `main`. The scan fails on fixable high and critical vulnerabilities; accepted exceptions live in
`.trivyignore` at the repository root, each with a reason and an expiry date.

## Health and readiness

| Endpoint | Meaning | Use it for |
|---|---|---|
| `GET /api/v1/health/live` | The process is up. Always 200. | Liveness probe. |
| `GET /api/v1/health/ready` | 200 if the database answers; 503 when it does not or while shutting down. | Load balancer / readiness probe. |
| `GET /api/v1/health` | Database, Redis and payment gateway status. 503 only if the database is down; a Redis outage reports `degraded` with 200. | Monitoring and the container `HEALTHCHECK`. |

These routes sit outside the API rate limit.

## Graceful shutdown

On SIGTERM or SIGINT (`backend/src/index.ts`): readiness starts answering 503, the scheduler stops, the server waits
`SHUTDOWN_DRAIN_MS` (default 5000 in production, 0 otherwise) so the load balancer takes it out of rotation, then it
stops accepting connections, closes Socket.IO sockets (clients reconnect to another instance), finishes in-flight
requests, stops job workers and disconnects Prisma, Redis and Sentry. If that takes longer than `SHUTDOWN_GRACE_MS`
(default 25000) the process exits with code 1. Keep the orchestrator's kill timeout above the grace period
(compose uses 30s), and `SHUTDOWN_DRAIN_MS` at least your load balancer's health-check interval. An uncaught
exception also triggers this shutdown (exit code 1); unhandled promise rejections are logged and reported only.

## Several instances

Run as many backend instances as you need; they share state through PostgreSQL and Redis (`REDIS_URL` is why it is
mandatory in production):

- Rate limits: counters live in Redis (`middleware/rateLimiter.ts`, and `utils/attemptBudget.ts` for "wrong
  password" and e-mail counts). If Redis is unreachable requests are let through rather than refused, and the
  counts fall back to each instance's memory. Keys for a phone number or an e-mail address hold a hash, never the
  number or address. The per-address limits are deliberately loose (a Pakistani mobile network puts many customers
  behind one address); the tight ones are per phone number and per e-mail address (see SECURITY_AND_COMPLIANCE.md).
- Live updates: Socket.IO uses the Redis adapter so an event emitted on one instance reaches clients on any other
  (`config/socket.ts`). Clients may use WebSocket or long polling; if you rely on polling, enable sticky sessions on
  the load balancer.
- Background jobs: BullMQ queue `nuray-jobs` in Redis (emails, notification delivery, push). Jobs survive restarts and
  retry with backoff (5 attempts); every instance runs a worker. If Redis is unreachable at enqueue time the job runs
  in the process that queued it and is lost if that process dies.
- Timed sweeps (below) take a Postgres advisory lock per job, so only one instance runs a given sweep at a time.
- Files: with `STORAGE_DRIVER=local` every instance needs the same volume. Use `s3` once you run more than one.
- Behind a load balancer or CDN: `TRUST_PROXY` is the number of proxy hops in front of the API (default `1`; `2`
  behind a CDN plus a load balancer; `0` when exposed directly; or an address list such as `loopback, 10.0.0.0/8`).
  Getting it wrong either rate-limits everyone as one address or lets a client spoof its address. Idle keep-alive
  connections are held for `KEEP_ALIVE_TIMEOUT_MS` (default 65 000 ms): keep it above the balancer's idle timeout
  (60 s on AWS ALB and most nginx setups) or the balancer will hit sockets the API has just closed and answer 502.
- Database connections: Prisma opens a pool per instance, sized by default from the host's CPU count
  (`2 × cores + 1`), not from how many instances run. Set it explicitly on `DATABASE_URL`
  (`?connection_limit=10&pool_timeout=10`) and keep `instances × connection_limit + 10` below PostgreSQL's
  `max_connections` (100 by default). Beyond about five instances put PgBouncer (transaction mode) in front
  and add `&pgbouncer=true`. The load test in `docs/PRODUCTION_READINESS_AUDIT.md` showed that a larger pool
  does not make the API faster on 4 cores: the limit there is CPU, so scale instances, not the pool.

## Background jobs

Scheduled in `backend/src/index.ts` through `jobs/scheduler.ts`; each starts about 5 seconds after boot and then
repeats.

| Job | Every | What it does |
|---|---|---|
| `dispatch-waiting` | 1 min | Offers every open delivery job to the best rider on duty (a rider already going that way, then the community's own riders, then anyone with room). A job nobody fits stays in the open pool, where any rider can still claim it. Off when `AUTO_ASSIGN_ENABLED=false`. |
| `stale-orders` | 2 min | Cancels orders the kitchen did not accept, or whose online payment or transfer never completed, and returns stock; creates refunds; alerts admins to unconfirmed transfers (timeouts above). |
| `expire-payment-attempts` | 15 min | Expires abandoned online checkout sessions (a late confirmation still settles). |
| `ranking-scores` | 15 min | Recomputes trending and rating scores. |
| `hub-expiry` | 1 h | Hides expired hub batches. |
| `stock-alerts` | 6 h | Safety-net stock alert check. |
| `purge-expired-secrets` | 6 h | Deletes old OTP codes and used or expired reset tokens. |
| `ops-snapshot` | 5 min | Writes one structured log line (`metric: "ops_snapshot"`) with open deliveries and how long the oldest has waited, riders on duty, orders and cancellations in the last hour, failed payments, pending approvals, refunds, payouts and open tickets. Chart or alert on it in the log tool. |

## Logs and error tracking

- Production logs are one JSON object per line (pino), each carrying the `requestId`, and `userId` once known. The
  same id is returned to clients in the `X-Request-Id` header and in error responses, so a support report can be
  traced. Tokens, passwords and OTPs are redacted. Send stdout to your log collector.
- With `SENTRY_DSN` set, unexpected errors (500s, crashes, unhandled rejections) are reported with the request id and
  user id only; request bodies, cookies, headers and query strings are stripped. 4xx errors are not reported.

## Backups

Nuray has no backup tooling of its own; set this up on your infrastructure:

- PostgreSQL: scheduled dumps or your provider's point-in-time recovery. It holds orders, the ledger, wallets and
  payouts. Test a restore.
- Files: the object-storage bucket(s), or the `UPLOADS_DIR` volume, including private receipts and documents.
- Redis holds only rate-limit counters, queued jobs and socket fan-out; losing it loses queued jobs but no business
  records.
- Keep your environment variables (especially `JWT_SECRET`, Safepay and S3 secrets) in a secrets manager.

## Safepay webhook setup

1. Get the public and secret keys from the Safepay dashboard and set `SAFEPAY_PUBLIC_KEY`, `SAFEPAY_SECRET_KEY`.
2. Set `BASE_URL` to the API's public https URL.
3. In the dashboard (Developer, Endpoints) add `https://<api-host>/api/v1/payments/safepay-webhook`, copy its shared
   secret into `SAFEPAY_WEBHOOK_SECRET`.
4. Set `SAFEPAY_SANDBOX` explicitly: `true` while testing, `false` for live. Use matching sandbox or live keys and
   webhook secret.
5. Customers come back through `https://<api-host>/api/v1/payments/safepay/return`.

Details and the payment flows are in [PAYMENT_GATEWAY_INTEGRATION.md](PAYMENT_GATEWAY_INTEGRATION.md).

## First admin

There is no default admin. `backend/scripts/create-admin.js` creates one (or promotes and resets the password of an
existing account with that email, signing it out everywhere), already email-verified. The password needs at least 12
characters, must not be a common one and must not contain the name or email:

```bash
cd backend
DATABASE_URL=... node scripts/create-admin.js admin@yourdomain.pk '<strong password>' "Admin Name"
```

It needs `node_modules` and the generated Prisma client, so run it from a checkout, not from the runtime image
(which has no `scripts/`). It does not print the password, but your shell keeps the command: clear the history or
pass the password from a file or variable. If nobody can sign in later, `node scripts/reset-admin-password.js <email>
'<new password>'` resets one staff account the same way (and writes it to the audit log). Sign in at `/admin/login`. Other admins, hub managers and communities are managed from the admin
screens.

## Go-live checklist

- [ ] `NODE_ENV=production`; the server starts with no validation errors.
- [ ] `JWT_SECRET` is random and kept in a secrets manager.
- [ ] `FRONTEND_URL`, `CORS_ORIGIN` and `BASE_URL` match the real https hostnames; frontend was built with the
      production `NEXT_PUBLIC_API_URL`.
- [ ] Migrations applied (`db:migrate`) and `db:check` passes.
- [ ] Redis reachable; `/api/v1/health` shows database and redis `healthy`.
- [ ] Load balancer uses `/api/v1/health/ready`, and `TRUST_PROXY` equals the number of proxy hops in front of the app (default 1).
- [ ] S3 bucket and CDN configured; private bucket or prefix not publicly readable; a test image upload and a
      receipt link work.
- [ ] Test email (registration verification) and test phone OTP both arrive.
- [ ] Safepay: `SAFEPAY_SANDBOX=false`, live keys, webhook registered; one real small payment completes the order.
- [ ] VAPID keys set if you want push; Sentry DSNs set if you want error tracking.
- [ ] Legal company details and `NEXT_PUBLIC_LEGAL_REVIEWED=true` set as repository variables (a release tag is refused without them) and in the frontend build; `NEXT_PUBLIC_ENABLE_DEMO_LOGIN` not `true`.
- [ ] First admin created; communities, delivery prices (admin, Settings) and kitchens/riders approved.
- [ ] Database and file backups running, and a restore tested.
- [ ] Rollback rehearsed on staging: the previous image tag runs against the newer schema, and a deliberately failed migration was repaired with `migrate resolve` (see "Rollback and failed migrations").
- [ ] Shutdown tested: rolling a deploy drops no requests (`SHUTDOWN_DRAIN_MS` versus the balancer's check interval).
