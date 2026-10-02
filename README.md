# Nuray Food & Frost

A community-based food marketplace for Pakistan. Nuray is the bridge between home kitchens (sellers) and the people
in their neighbourhoods (buyers): orders are organised around **communities** such as Askari 11, DHA Phase 5 or
Gulshan-e-Iqbal, and every seller decides, community by community, whether they deliver there and what it costs.

## What it does

- **Buyers** browse kitchens and dishes for their community, fill a cart (one cart can hold several sellers), pay by
  cash on delivery, online (card, JazzCash or EasyPaisa through Safepay), the Nuray wallet, or a bank/mobile transfer
  to the kitchen, and follow the order live, including the rider's position on a map while it is on the way.
- **Sellers** run a kitchen: products and variants, stock, orders, earnings, promotions, payouts, and their
  **delivery terms per community** (see below). New orders arrive live, with push, email and SMS alerts.
- **Riders** apply with their documents, claim delivery jobs, share their location while delivering, confirm delivery
  with the customer's PIN, and see their earnings and the cash they hold.
- **Hub centers** hold cold-chain stock (batches with expiry dates, temperature logs) for products fulfilled from a hub;
  each hub's assigned manager runs it from `/hub`.
- **Admins** approve kitchens and riders, settle riders' cash and pay, handle refunds, payouts and disputed transfers,
  manage people, communities, hubs, hub managers and promo codes, and read the audit log.
- **Urdu**: the customer, rider and kitchen-order screens are available in Urdu (right-to-left, Nastaliq font); the
  language switch is in the top bar and on the profile page. Admin screens are English.

### Community delivery model

- Every seller belongs to a home community and can fix a **fee, a free-delivery threshold and a minimum order for
  each community** they serve (Seller studio → Delivery). Once a seller has switched on any community, only those
  communities are deliverable.
- "Deliver to other communities" turns cross-community delivery on or off. Nearby communities are suggested.
- A buyer's address is resolved to a community (chosen on the address, GPS position, or the area name). An address
  that matches no community cannot order from a seller with community rules until the buyer picks one.
- The seller picks **who delivers**: the Nuray rider fleet or **self-delivery** (the seller keeps the fee they
  charged; no rider job is created). Items fulfilled from a hub are always delivered by the platform.
- **Nuray's delivery prices** (when a Nuray rider delivers; the fee is platform revenue): within a community, the fixed
  fee an admin sets for that community (admin → Communities); between two communities an admin has priced as a pair
  (admin → Communities → "Prices between two communities"), that price in both directions; to any other community, that community's base fee for
  other communities plus a per-km rate beyond the included km, rounded up to Rs 10, up to a maximum distance (admin →
  Settings → Nuray delivery prices). Distance is kitchen to customer, or community centre to centre when either location
  is missing. The kitchen still chooses which communities it serves and its minimum order; its own fees and free-delivery
  offers apply only to self-delivery.
- In a multi-seller order, each seller's fee is stored in `Order.deliveryFeeBreakdown`, and the ledger splits platform
  and seller delivery money from it.

### Money, in short

- Orders, stock and promo discounts are written inside database transactions with atomic stock decrements.
- Order totals are whole rupees (cash has no paisa): GST is 5% of the goods after discounts and takes the rounding,
  always under Rs 0.50, so the customer, rider and kitchen see the same amount. Checkout
  sends an idempotency key, so a double tap never creates two orders.
- **Who holds the money.** Online payments and wallet payments are collected by Nuray; the kitchen's share is paid out
  later (admin → Payouts). Bank/mobile transfers go straight to the kitchen, which confirms the receipt it was sent;
  a transfer the kitchen disputes goes to admins. Cash on delivery is collected by the rider (or by a self-delivering
  kitchen).
- **Online payments** use Safepay's hosted checkout. An order paid online is only sent to the kitchen once Safepay's
  signed webhook confirms the payment; abandoned attempts expire. Without Safepay keys, online payment is simply not
  offered.
- **Wallet**: customers top up through Safepay, refunds can land in it, and it can pay for orders.
- **Rider ledger**: every delivery adds the rider's fee; cash collected counts against them until they hand it in.
  Admins "settle up" (cash handed in, pay kept) and record payouts. Riders carrying more cash than their limit
  (`RIDER_CASH_LIMIT`, adjustable per rider) are only offered prepaid jobs.
- Cancelling a paid order creates a **refund record**: wallet refunds are instant, manual ones wait in admin → Refunds
  until marked sent. Refunds are capped at what was paid.
- Orders a kitchen doesn't accept within 30 minutes, or online payments never completed, are cancelled automatically
  (stock returned, refund created), and any delivery job is closed.
- Completing an order writes immutable ledger entries (customer payment, seller earning, commission, delivery fees).

## Tech stack

| Layer | What |
|---|---|
| Backend | Node.js 20, Express 5, TypeScript, Prisma 6, PostgreSQL, Redis (ioredis, BullMQ jobs, Socket.IO adapter, rate limits), Socket.IO, Zod, pino logs, Sentry |
| Files | local disk or any S3-compatible store (S3, R2, B2, MinIO); images resized to WebP with sharp; private files behind signed links |
| Notifications | in-app + live socket, web push (VAPID), email (SMTP/Gmail), SMS (Twilio) |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, Zustand, React Hook Form, Leaflet, Socket.IO client; English and Urdu (RTL) |
| Auth | JWT access + refresh tokens, session revocation, email verification, phone OTP (Twilio), password reset by email, Google sign-in |
| Tests | Jest (backend), Playwright (frontend E2E), a real-database money-flow script |
| CI | GitHub Actions: typecheck + build, Docker build smoke, Playwright E2E |

There is no mobile app in this repository.

## Repository layout

```
backend/
  src/
    controllers/  routes/  validators/   HTTP layer (routes mounted under /api/v1)
    services/                            business logic (orders, refunds, ledger, hubs, riders, ...)
    middleware/  utils/  config/  gateways/
  prisma/
    schema.prisma                        data model
    migrations/                          SQL migrations
    seed-e2e.ts                          sample data (communities, kitchens, products, a seller)
  scripts/                               admin helpers and verification scripts
  tests/                                 Jest tests and SQL fixtures
frontend-web/
  app/                                   pages (customer, sellers/, riders/, admin/, ...)
  components/  lib/                      UI, API client, services, hooks
  tests/e2e/                             Playwright tests
docs/                                    architecture, API, deployment and operations notes
docker-compose.yml                       backend + frontend containers
```

## Running it locally

### Prerequisites

- Node.js 20+
- PostgreSQL 15+ (with the bundled `pg_trgm` extension, as on every major managed service)
- Redis 7+: required in production, optional in development

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env        # then edit it (see "Environment variables")
npx prisma generate
npm run db:migrate          # build the schema from the migrations (prisma migrate deploy)
npm run seed:e2e            # optional: communities, 13 kitchens, products, a test seller
npm run dev                 # http://localhost:3001  (API: /api/v1, health: /api/v1/health)
```

`.env` needs at least `DATABASE_URL` and `JWT_SECRET` (32+ characters). `REDIS_URL` is required in production; in
development it is optional (without it, rate limits, live updates and background jobs stay within the one process).

> **Database schema:** `npm run db:migrate` builds a new database and deploys later changes; change the schema with
> `npx prisma migrate dev --name <change>`. A database created before the migration baseline (with `prisma db push` or
> the old migrations) is brought under migrations once with `npm run db:baseline`. Details:
> [`backend/prisma/README.md`](backend/prisma/README.md).

### 2. Frontend

```bash
cd frontend-web
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1" > .env.local
npm run dev                 # http://localhost:3000
```

### 3. Try it

After `npm run seed:e2e`:

| Role | Login | Where |
|---|---|---|
| Seller | `e2e-seller@nuray.test` / `SellerPass123!` | http://localhost:3000/login → Seller studio |
| Customer | register at `/register` | works immediately |
| Rider | register at `/register`, then fill in the rider application (vehicle, CNIC, licence photos) | needs admin approval at `/admin/riders` → Applications |
| Hub manager | an admin assigns an existing account at `/admin/hubs/manage` | `/hub` |
| Admin | none by default; create one with `node scripts/create-admin.js <email> <password> <name>` (from `backend/`) | http://localhost:3000/admin/login |

See [`docs/ACCOUNT_CREDENTIALS.md`](docs/ACCOUNT_CREDENTIALS.md) for how each role is created and approved.

A quick walk-through of the community delivery screen: log in as the seller, open **Delivery**, tick your home community
and any others you serve, set a fee for each, and press **Save Settings**. Saving with other communities switched on but
no fee for your own community is refused. Reload the page to see the saved terms.

### Docker

`docker-compose.yml` builds and runs the backend and frontend containers. PostgreSQL and Redis are expected on the host
(reached through `host.docker.internal`).

```bash
cp backend/.env.example backend/.env
docker compose up --build   # frontend :3000, backend :3001
```

## Environment variables

Backend: every variable is listed and explained in [`backend/.env.example`](backend/.env.example). The server checks
its configuration at startup and, in production, refuses to start with a list of everything missing or unsafe.

| Group | Variables | Needed |
|---|---|---|
| Core | `DATABASE_URL`, `JWT_SECRET` (32+ chars), `FRONTEND_URL`, `CORS_ORIGIN`, `BASE_URL` | always |
| Redis | `REDIS_URL` | production (optional in development) |
| Email | `SMTP_*` or `EMAIL_SERVICE=gmail` + `EMAIL_USER`/`EMAIL_PASSWORD`, `EMAIL_FROM` | production (development uses a throwaway Ethereal inbox) |
| SMS / phone OTP | `TWILIO_*`, `SMS_PROVIDER` (`twilio`, `console` in development, or `none`) | production unless `SMS_PROVIDER=none` |
| Files | `STORAGE_DRIVER` (`local` or `s3`), `UPLOADS_DIR`, `S3_*`, `ASSET_BASE_URL` (CDN), `FILE_URL_SECRET` | `s3` recommended in production |
| Online payments | `SAFEPAY_PUBLIC_KEY`, `SAFEPAY_SECRET_KEY`, `SAFEPAY_WEBHOOK_SECRET`, `SAFEPAY_SANDBOX`, `WALLET_TOPUP_MAX` | optional |
| Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (generate with `npx web-push generate-vapid-keys`), `VAPID_SUBJECT` | optional |
| Riders | `RIDER_CASH_LIMIT` | optional (default 10000) |
| Order timeouts | `ORDER_ACCEPT_TIMEOUT_MINUTES`, `ORDER_PAYMENT_TIMEOUT_MINUTES`, `PAYMENT_CONFIRM_ESCALATE_HOURS` | optional |
| Logs & errors | `LOG_LEVEL`, `LOG_FORMAT`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` | optional |
| Google sign-in | `GOOGLE_CLIENT_ID` | optional |

**Safepay setup:** set the three keys, set `BASE_URL` to the API's public https URL, and in the Safepay dashboard
(Developer → Endpoints) add the webhook `BASE_URL/api/v1/payments/safepay-webhook`. Customers come back through
`BASE_URL/api/v1/payments/safepay/return`. Set `SAFEPAY_SANDBOX=false` explicitly for live payments.

Frontend (`frontend-web/.env.local`, read at build time):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | backend API base, e.g. `http://localhost:3001/api/v1` |
| `NEXT_PUBLIC_WS_URL` | Socket.IO server, e.g. `https://api.example.pk` (defaults to the API URL's origin) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | optional, Google sign-in |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_RELEASE` | optional, browser error tracking |
| `NEXT_PUBLIC_ENABLE_DEMO_LOGIN` | set `true` to show the demo-account shortcuts in a production build (shown automatically in development) |

## Live updates, jobs and notifications

- **Live updates** go over Socket.IO: order status, new orders for kitchens, delivery jobs for riders, rider location
  for the customer, chat and notifications. With Redis, several backend instances share them.
- **Background jobs** (emails, notification delivery) run on a BullMQ queue in Redis and are retried; without Redis
  they run in the process. Timed sweeps run on whichever instance gets a Postgres advisory lock: stale orders (every
  2 minutes), abandoned online payments and ranking scores (15 minutes), hub batch expiry (hourly), stock alerts and expired codes
  (every 6 hours).
- **Notifications**: every event lands in the person's in-app list. Depending on the event it is also sent by push
  (to every device they switched on), email and SMS — SMS only for things that need acting on now, like a kitchen's new
  order. Each person chooses per kind and channel at `/notifications/settings`.

## Ranking and recommendations

The formulas are in `backend/src/utils/ranking.ts` (pure functions, unit-tested) and are fed real orders by
`backend/src/services/ranking.service.ts`; a job recomputes the stored scores every 15 minutes.

- **Trending** (kitchens and dishes): orders from the last 14 days, each counting 1 when placed and half as much every
  3 days after. One customer's orders count 1, ½, ¼ and then nothing (no gaming by repeat orders), nothing trends on a
  single customer, and cancelled, unpaid-online and a kitchen's own orders are ignored. Used by the home page's
  "Trending kitchens", the "Popular / Trending now" sort and the popular dishes row.
- **Top rated**: a Bayesian average (each rating starts as if it had 5 reviews at 4.0), so one 5★ review doesn't beat
  two hundred 4.8s.
- **Search**: name matches before description matches, names starting with the words first, Roman-Urdu/English
  synonyms (kabab/kebab, keema/qeema), and typo tolerance through trigram similarity ("biryni" finds biryani) when
  there are few exact matches.
- **Recommended for you**: item-to-item collaborative filtering (people who ordered what you ordered also ordered…),
  plus more from kitchens and kinds of food you order; trending dishes for new customers. **Order again**: your dishes,
  often-and-recent first.
- **Rider job order**: jobs on the way of the current one first, then closer pickups, longer-waiting orders and better
  pay per km; cash jobs over the rider's cash limit last.

## Languages

Screens use typed message modules in `frontend-web/lib/i18n/messages/` (`useT(messages)`; TypeScript requires an Urdu
string for every English one). The chosen language is kept in the `nuray_locale` cookie, so the server renders
`<html lang dir>` correctly. Layout classes are direction-neutral (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`), so
Urdu pages mirror automatically. Notification texts sent by the server (push, email, SMS) are English for now.

## Testing

```bash
# Backend unit tests
cd backend && npm test

# Money-flow verification against a REAL throwaway PostgreSQL (concurrency can't be tested with mocks):
# orders, refunds, payouts, online payments, wallet, rider cash and settlements, admin tools, notifications
cd backend
export DATABASE_URL=postgresql://postgres@localhost:5432/scratch JWT_SECRET=<32+ chars> NODE_ENV=test
npx prisma migrate deploy
npx ts-node scripts/verify-money-flows.ts

# Frontend end-to-end (needs the backend and frontend running with seeded data)
cd frontend-web && npm run test:e2e
```

Never point `verify-money-flows.ts` at a database you care about: it creates its own users, sellers and orders.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`: backend and frontend typecheck + build,
Docker image builds, and the Playwright suite. `docker-publish.yml` publishes images to GitHub Container Registry on
pushes to `main` and on `v*` tags.

## API overview

All routes are under `/api/v1`: `auth`, `users`, `sellers`, `seller` (order management), `products`, `product-variants`,
`categories`, `cart`, `orders`, `payments`, `communities`, `hubs`, `riders`, `reviews`, `promotions`, `favorites`,
`notifications`, `support`, `realtime`, `admin`, `upload`, `health`. Order status changes are pushed to clients over
Socket.IO. The full reference is [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md).

## More documentation

- [Architecture](docs/ARCHITECTURE.md), [system flows](docs/SYSTEM_FLOWS_AND_PROCESSES.md), [database schema](docs/DATABASE_SCHEMA.sql)
- [Account credentials and access](docs/ACCOUNT_CREDENTIALS.md), [end-to-end testing guide](docs/E2E_TESTING_GUIDE.md)
- [Deployment guide](docs/DEPLOYMENT_GUIDE.md), [hub operations manual](docs/HUB_OPERATIONS_MANUAL.md)
- [Payment gateway integration](docs/PAYMENT_GATEWAY_INTEGRATION.md), [security and compliance](docs/SECURITY_AND_COMPLIANCE.md)

Some of these documents were written early in the project and may describe plans (mobile apps, other cities) that are
not built; the code and this README are the source of truth.
