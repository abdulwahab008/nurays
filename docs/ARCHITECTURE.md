# Architecture

How Nuray is put together: what runs, how a request travels through it, what is stored where, and what changes when you run more than one backend instance. Business flows (orders, payments, delivery) are in [SYSTEM_FLOWS_AND_PROCESSES.md](SYSTEM_FLOWS_AND_PROCESSES.md). Setup and deployment are in the root [README.md](../README.md) and [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

## Overview

```
 Browser (Next.js 16 app, React 19)
   |  HTTPS  /api/v1/*  (axios, Bearer JWT)          |  WebSocket (Socket.IO, JWT in handshake)
   |  /media /files /uploads  (Next rewrites to backend, local storage driver only)
   v                                                  v
 +---------------------------- Backend (Node 20, Express 5, TypeScript) -----------------------------+
 |  middleware -> routes -> controllers -> services -> Prisma                                          |
 |  Socket.IO server (config/socket.ts)      scheduled sweeps (jobs/scheduler.ts)                      |
 |  BullMQ worker (jobs/queue.ts)            storage driver (storage/)                                 |
 +--------+----------------------+------------------------+-----------------------+------------------+
          |                      |                        |                       |
     PostgreSQL               Redis                 Local disk or            External services
  (all business data,   (rate limits, Socket.IO     S3-compatible store      Safepay, SMTP/Gmail, Twilio,
   advisory locks)       adapter, BullMQ queue)     (uploads)                web push (VAPID), Google, Sentry
```

One backend process does everything: serves the API, hosts the Socket.IO server, runs the scheduled sweeps and processes queued jobs. There is no separate worker service. The frontend is a separate Next.js app (built as a standalone server, see `frontend-web/next.config.ts`) that talks to the backend over HTTP and WebSocket. There is no mobile app in this repository.

## Backend (`backend/src`)

Layers, from the outside in:

| Layer | Folder | Job |
|---|---|---|
| Entry point | `index.ts` | Loads env, validates config, installs middleware, mounts routers under `/api/v1`, starts sweeps and workers, handles shutdown. |
| Routes | `routes/` | One file per area. Attach auth, role checks, rate limiters and validators to each path. |
| Validators | `validators/` | Zod schemas for bodies and query strings. |
| Controllers | `controllers/` | Thin: read the request, call a service, shape the response (`{ success, data }`). |
| Services | `services/` | All business rules and database access. |
| Utils | `utils/` | Pure helpers: pricing, delivery fees, ranking formulas, payment custody rules, JWT, logging. |
| Gateways | `gateways/` | Payment provider adapters (Safepay, and bank/JazzCash/EasyPaisa adapters behind `getGateway`). |
| Jobs | `jobs/` | Queue (`queue.ts`), scheduler (`scheduler.ts`), job handlers (`email.jobs.ts`, `notify.jobs.ts`). |
| Storage | `storage/` | Upload driver (local or S3) and file serving. |
| Config | `config/` | `env.ts` (startup checks), `database.ts` (Prisma client), `redis.ts`, `socket.ts`, `sentry.ts`. |

### Modules by area

| Area | Services (in `services/`) |
|---|---|
| Accounts and auth | `auth.service`, `otp.service`, `google-auth.service`, `user-profile.service`, `admin-people.service` |
| Kitchens | `seller.service`, `availability.service` (open/closed from schedule, in Pakistan time), `category-request.service`, `promotion.service`, `stock-alert.service`, `profit-loss.service` |
| Catalog | `product.service`, `product-variant.service`, `category.service`, `ranking.service` (search, trending, recommendations), `favorite.service`, `review.service`, `media.service` |
| Communities | `community.service`, `admin-places.service`, `delivery-pricing.service` |
| Cart and orders | `cart.service`, `order.service`, `seller-order.service`, `admin-order.service`, `order-maintenance.service`, `handover.service` |
| Payments and money | `payment.service`, `online-payment.service` (Safepay), `wallet.service`, `refund.service`, `ledger.service`, `seller-balance.service`, `rider-ledger.service` |
| Delivery | `rider.service`, `delivery-lifecycle.service` |
| Hubs | `hub.service`, `hub-allocation.service` |
| Messaging | `notify.service`, `notification.service`, `push.service`, `email.service`, `sms.service`, `realtime-order.service`, `support.service` |
| Admin | `admin.service` (approvals, payouts, settings), `admin-order.service` |

### Notification channels

`notify()` in `services/notify.service.ts` is the single entry point. For each call it:

1. Inserts a row in `notifications` (a repeated `dedupeKey` is ignored, so retries never notify twice).
2. Emits `notification:new` to the user's Socket.IO room.
3. For each extra channel the event asked for (`push`, `email`, `sms`), checks the user's per-category preferences (`orders`, `payments`, `deliveries`, stored on `users.notification_preferences`) and whether the channel is available at all (VAPID keys set, SMS provider not `none`), then queues a `notify.deliver` job.

The job (`jobs/notify.jobs.ts`) loads the notification and the user's current contact details, and sends: push through `push.service` (web push, dead subscriptions are removed on 404/410), email only if the address is verified, SMS only if the phone is verified. It never throws out of `notify()`; a failed notification must not fail the action that caused it.

Account emails (verification, password reset) use the `email.verification` and `email.password-reset` jobs. Their payloads carry ids only, never tokens, because queue payloads sit in Redis.

### Background work

Two mechanisms, both started from `index.ts`:

**BullMQ queue** (`jobs/queue.ts`, queue name `nuray-jobs`). Jobs: `email.verification`, `email.password-reset`, `email.send`, `notify.deliver`. Up to 5 attempts with exponential backoff from 15 s, concurrency 5, finished jobs kept (last 1000 completed, 5000 failed). Without `REDIS_URL` a job runs in-process right after it is enqueued (3 attempts) and is lost if the process stops. If Redis is configured but unreachable, `enqueue` waits 3 s, then runs the job in-process.

**Scheduled sweeps** (`jobs/scheduler.ts`, registered at the bottom of `index.ts`). Plain `setInterval` timers; each also runs once about 5 s after boot.

| Name | Every | What it does |
|---|---|---|
| `stale-orders` | 2 min | Cancels unaccepted and unpaid orders, escalates unconfirmed transfers (`order-maintenance.service`). |
| `expire-payment-attempts` | 15 min | Marks Safepay checkout sessions older than 2 h as `expired`. |
| `ranking-scores` | 15 min | Recomputes trending and rating scores (`ranking.service`). |
| `hub-expiry` | 1 h | Marks hub batches past their expiry. |
| `stock-alerts` | 6 h | Safety-net low/out-of-stock alerts. |
| `purge-expired-secrets` | 6 h | Deletes OTP rows and reset tokens older than a day. |

Timeouts are configurable: `ORDER_ACCEPT_TIMEOUT_MINUTES` (30), `ORDER_PAYMENT_TIMEOUT_MINUTES` (60), `PAYMENT_CONFIRM_ESCALATE_HOURS` (6). See `backend/.env.example`.

### Realtime (Socket.IO)

`config/socket.ts`. A connection must present a valid access token (`auth.token` or `Authorization` header); the user is re-read from the database on connect, so suspended accounts and revoked sessions are refused, and the current role (not the token's) is used. Rooms:

| Room | Who joins |
|---|---|
| `user:<id>` | Every connection of that user. |
| `role:<type>` | Everyone of that role (`rider`, `admin`, ...). |
| `order:<id>` | Joined on request (`join:order`), only for the order's customer, a kitchen on it, its rider, or an admin. |

Events emitted by services: `notification:new`, `order:new`, `order:status:update`, `order:item:status:update`, `order:message`, `order:messages:read`, `order:delivery:tracking` (rider position), `delivery:new`, `delivery:assigned`, `delivery:removed`, `delivery:cancelled`. Payloads are small signals; clients reload the data they show (`frontend-web/lib/hooks/use-live-refresh.ts`), so payloads never carry anything a viewer may not see.

### Storage

`storage/index.ts` picks the driver from `STORAGE_DRIVER` (`local` or `s3`).

- Public objects (key prefix `p/`: product images, avatars, covers) are served from `ASSET_BASE_URL` (or `/media` with the local driver) with immutable cache headers. Images are decoded and re-encoded to WebP in three sizes by sharp (`services/media.service.ts`).
- Private objects (prefix `x/`: payment receipts, CNIC and licence photos, chat media) are never public. The database stores `private:<key>`; an API that has checked the viewer turns it into a signed link valid for 10 minutes (`presentFile`). With the local driver the link is served by `/files/...` (HMAC-signed).
- Files uploaded before the storage layer are still served from `/uploads/products`.

### i18n

Frontend only. English and Urdu (RTL). Strings live in `frontend-web/lib/i18n/messages/*.ts`, one module per area, written with `defineMessages({ en, ur })` so Urdu must have every English key. The chosen language is in the `nuray_locale` cookie; `app/layout.tsx` reads it so `<html lang dir>` is right on first paint. Admin screens are English only. The backend stores Urdu fields on some records (`nameUrdu`, `descriptionUrdu`, ...) but API messages are English.

## Request lifecycle

Order of middleware in `index.ts`:

1. `helmet`, `cors` (single origin from `CORS_ORIGIN`, credentials on, `Idempotency-Key` and `X-Request-Id` allowed).
2. `requestId`: uses a sane incoming `X-Request-Id` or makes one; returns it in the response header; runs the rest of the request inside an async log context carrying it.
3. `httpLogger` (pino-http): one line per request with method, path, status, duration. Health checks are not logged.
4. `express.json` / `urlencoded` (10 MB limit).
5. File routes (`/media`, `/files`, `/uploads`).
6. `/api/v1/health` (outside the flood limit), then `apiLimiter` for everything else under `/api`.
7. The router for the path. Per route, in this order:
   - Route-specific rate limiter (`middleware/rateLimiter.ts`).
   - `authenticate` (or `optionalAuthenticate`): verifies the access JWT, then reads the user from the database; rejects missing, suspended or revoked sessions. The role used afterwards is the database's, not the token's.
   - `authorize(...roles)`; sellers also pass `blockSuspendedSeller` (and `requireSeller` where approval is required).
   - `validate(schema)` / `validateQuery(schema)` (Zod). Failures become `400 VALIDATION_ERROR` with field details.
   - Controller, then service.
   - Admin routers also pass `auditWrites('admin')`: every non-GET request is written to `audit_logs` after the response (who, action, entity, sanitized body with secrets redacted, status).
8. `notFoundHandler`, then `errorHandler`.

### Auth

Access and refresh JWTs share one secret but carry a `typ` claim, so one cannot stand in for the other (`utils/jwt.ts`). Defaults: access 24 h, refresh 30 d (`JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`). `users.tokens_valid_after` revokes every older token (set on password reset, suspension, hub-manager role changes, and when a verified phone number is taken over by another account). The frontend keeps tokens in browser storage, retries a 401 once after a single shared refresh call (`frontend-web/lib/api-client.ts`), and sends the `Idempotency-Key` header on checkout.

### Rate limits

Counters live in Redis when configured (shared by all instances) and in memory otherwise. If Redis fails, requests are let through rather than refused. Production values:

| Limiter | Window | Limit | Keyed by |
|---|---|---|---|
| API (all `/api`) | 1 min | 1200 | IP |
| Login, Google sign-in, reset password, phone verify | 15 min | 10 | IP |
| OTP request, forgot password | 15 min | 5 | IP |
| Register | 1 h | 10 | IP |
| Promo validate | 1 min | 20 | IP |
| Uploads | 10 min | 60 | user |
| Orders | 10 min | 20 | user |
| Messages | 5 min | 60 | user |
| Submissions (reviews, tickets, receipts, payments) | 1 h | 30 | user |
| Rider location | 1 min | 90 | user |

Development and test relax some of these. The server trusts exactly one proxy hop (`trust proxy 1`), so run it behind a reverse proxy or load balancer.

### Errors, logs, Sentry

Services throw `AppError(message, status, code)`. `errorHandler` also maps Prisma unique/FK/not-found errors, oversized or malformed bodies and multer errors to 4xx. Every error response looks like `{ success: false, error: { code, message, details? }, requestId, timestamp }`. Expected 4xx errors log at `warn`. Anything else logs at `error` with the stack, is reported to Sentry when `SENTRY_DSN` is set (tagged with request id and user id; no bodies, cookies, headers or query strings are sent), and the client only gets a generic message outside development. Unhandled rejections are logged and reported; an uncaught exception reports and then shuts the process down cleanly.

### Startup checks

`config/check-env.ts` runs `validateConfigOrExit()` from `config/env.ts` before anything else. Any `NODE_ENV` other than `development` or `test` (including unset) is treated as production. In production it refuses to start unless: `DATABASE_URL`, `JWT_SECRET` (32+ chars, not a placeholder), `REDIS_URL`, an https `FRONTEND_URL`, an email provider and `EMAIL_FROM`, SMS configured (or `SMS_PROVIDER=none`), storage settings for the chosen driver are present, and, if Safepay keys are set, `BASE_URL`, `SAFEPAY_WEBHOOK_SECRET` and an explicit `SAFEPAY_SANDBOX`. All problems are listed at once.

## Data model

Source of truth: [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma). Migrations in `backend/prisma/migrations` build the database (they also add CHECK constraints and the `pg_trgm` extension used by search). [`docs/DATABASE_SCHEMA.sql`](DATABASE_SCHEMA.sql) is generated from the schema for reading; do not edit it (the command to regenerate it is at its top). Statuses are plain strings, not database enums; the allowed values are documented in comments in the schema and enforced in services.

Main entities and how they relate:

```
User 1-1 UserProfile      User 1-n UserAddress (-> Community)     User 1-1 Wallet 1-n WalletTransaction
User 1-1 Seller           User 1-1 Rider (by user_id)             User 1-n Notification, PushSubscription
Community 1-n Seller / UserAddress     Community n-n Community (CommunityPairFee)
Seller n-n Community (SellerCommunityDelivery: fee, free-above, minimum)
Seller 1-n Product 1-n ProductVariant / ProductImage       Category (tree) 1-n Product; CategoryRequest -> Category
Cart 1-n CartItem                       Promotion 1-n PromotionUsage
Order 1-n OrderItem (-> Seller, Product, Variant)           Order 1-n OrderStatusHistory
Order 1-1 Delivery (-> Rider)           Order 1-n Refund, PaymentAttempt, OrderMessage, Review
Rider 1-n RiderLedgerEntry, RiderDocument                   Seller 1-n SellerPayout, SellerDocument
Order 1-n LedgerEntry (immutable accounting rows)
HubCenter 1-n HubInventory / HubBatchAllocation / HubTemperatureLog
AuditLog, SystemSetting (key/value), SupportTicket 1-n SupportMessage
```

Notes worth knowing:

- Order and order item rows copy prices, product names, commission rate and the delivery address at order time, so later edits never change history. `Order.deliveryFeeBreakdown` (JSON) records each seller's fee and provider.
- `Order.handoverCode` and `Delivery.deliveryOtp` are omitted from every Prisma query unless explicitly selected (`config/database.ts`), so they cannot leak into a response by accident.
- `Order` has a unique `(customer_id, idempotency_key)` for checkout retries, and `paymentCollectedBy` (`platform`, `seller`, `rider`) records who holds the money.
- `RiderLedgerEntry` has a unique `(delivery_id, type)` so a delivery earns its fee, bonus and cash entry at most once.
- Money columns are `Decimal(10,2)`; order totals are whole rupees (see `utils/pricing.ts`).

## Running several instances

What Redis makes shared (`REDIS_URL`, required in production):

| Concern | With Redis | Without Redis (dev only) |
|---|---|---|
| Rate-limit counters | Shared across instances, survive restarts. | Per process, in memory. |
| Socket.IO events | Redis adapter: an event emitted on any instance reaches clients on every instance; room operations apply everywhere. | Only clients on the same process. |
| Background jobs | One durable queue; any instance's worker takes jobs; retries survive restarts. | Run in the process that enqueued them. |

What is not in Redis: sessions (JWTs are stateless), caches other than a one-minute in-memory cache of delivery pricing (`delivery-pricing.service.ts`, dropped on admin edit, so another instance can serve the old price for up to a minute), and Socket.IO's per-process `userSockets` map (used only for a connected-users count).

Scheduled sweeps run on every instance but are coordinated in Postgres: each run is a transaction holding `pg_try_advisory_xact_lock(hashtext('job:<name>'))`. If another instance holds the lock, the run is skipped; an overlapping run on the same instance is skipped too. The lock disappears with the transaction (10 minute ceiling), so a crashed instance never blocks the others.

Correctness under concurrency does not depend on the sweeps or on sticky sessions. State changes use conditional updates (`updateMany` with the expected status), row locks (`SELECT ... FOR UPDATE` on the order, rider or seller row, always order first), unique constraints (idempotency key, one ledger entry per delivery and type, one review per item) and atomic stock decrements, so two instances racing on the same order cannot double-apply a transition.

Uploads with `STORAGE_DRIVER=local` live on one machine's disk, so more than one instance needs `s3` (or a shared volume).

## Health, readiness and shutdown

| Endpoint | Meaning |
|---|---|
| `GET /api/v1/health/live` | Process is up. Restart only if this fails. |
| `GET /api/v1/health/ready` | `200` when the database answers; `503` while shutting down or without the database. Use for load-balancer routing. |
| `GET /api/v1/health` | Detail: database, Redis (`healthy`, `unhealthy` or `not_configured`) and payment gateway status. `503` only if the database is down; a Redis outage reports `degraded` but stays `200`, because it affects every instance alike. |

Graceful shutdown (`SIGTERM`, `SIGINT`, or after an uncaught exception): mark not ready, stop the schedulers, wait `SHUTDOWN_DRAIN_MS` (5 s in production, 0 otherwise) so the load balancer stops routing, close the HTTP listener, disconnect sockets (clients reconnect to another instance), let running queue jobs finish, then close Prisma, Redis and Sentry. If this takes longer than `SHUTDOWN_GRACE_MS` (25 s) the process exits with code 1.

## Frontend (`frontend-web`)

Next.js 16 App Router, React 19, Tailwind 4. Root `app/layout.tsx` wraps everything in `LocaleProvider`, toasts, `AuthProvider` and Google OAuth, and mounts the live new-order alerts for sellers and customers.

| Path | Contents |
|---|---|
| `app/` | Pages. Customer: `/`, `kitchens`, `products`, `cart`, `checkout`, `orders`, `payment/return`, `wallet`, `favorites`, `notifications`, `profile`, `support`. Auth: `login`, `register`, `forgot-password`, `reset-password`, `verify-email*`. Role areas: `sellers/*` (studio), `riders/*`, `hub`, `admin/*`. Legal pages. `app/api/geocode/*` are small server routes for address lookup. |
| `components/` | UI by area (`admin`, `cart`, `kitchen`, `marketplace`, `orders`, `products`, `riders`, `hubs`, `layout`, `ui`, ...). `RoleGuard` protects role areas client-side; the backend is what actually enforces access. |
| `lib/api-client.ts` | Axios instance with bearer token and one-shot refresh on 401. |
| `lib/services/` | Typed wrappers per backend area (`order.service.ts`, `payment.service.ts`, ...). |
| `lib/store/` | Zustand stores: auth, cart, community. |
| `lib/realtime/socket.ts`, `lib/hooks/` | Socket.IO client, `use-socket`, `use-live-refresh`, `use-rider-location`. |
| `lib/i18n/` | Locale config, `useT`, message modules. |
| `public/sw.js` | Service worker for web push. |
| `tests/e2e/` | Playwright specs. |

`NEXT_PUBLIC_API_URL` is baked in at build time; `NEXT_PUBLIC_WS_URL` is optional (defaults to the API's origin). With the local storage driver, Next rewrites `/media`, `/files` and `/uploads` to the backend.

## Where to find things

| I want to... | Look at |
|---|---|
| Add an endpoint | `routes/<area>.routes.ts` -> controller -> service; schema in `validators/`; mount in `index.ts` if it is a new router. |
| Change how an order is priced | `utils/pricing.ts` (`priceOrder`), `order.service.ts` `createOrder`, delivery fee in `utils/deliveryFee.ts` and `delivery-pricing.service.ts`. |
| Change who holds money / who owes whom | `utils/paymentCustody.ts`, `ledger.service.ts`, `seller-balance.service.ts`, `rider-ledger.service.ts`. |
| Change order status rules | `seller-order.service.ts`, `rider.service.ts` (`VALID_TRANSITIONS`), `admin-order.service.ts` (`ORDER_FORWARD_SEQUENCE`). |
| Change an auto-cancel timeout or add a sweep | `order-maintenance.service.ts`; register in `index.ts` with `scheduleJob`. |
| Add a notification | Call `notify()` from the service; if it needs a new category, `notify.service.ts`. |
| Add a background job | `defineJob` in `jobs/`, then `enqueue`. |
| Tune ranking or search | `utils/ranking.ts` (formulas), `ranking.service.ts` (data and SQL). |
| Add an env variable | `backend/.env.example`; add a check in `config/env.ts` if production needs it. |
| Change the schema | `backend/prisma/schema.prisma`, then `npx prisma migrate dev --name <change>`; regenerate `docs/DATABASE_SCHEMA.sql`. |
| Add a translated string | `frontend-web/lib/i18n/messages/<area>.ts` (both `en` and `ur`). |
| Tests | `backend/tests` (Jest), `backend/scripts/verify-money-flows.ts` (real Postgres), `frontend-web/tests/e2e` (Playwright), CI in `.github/workflows/ci.yml`. |
