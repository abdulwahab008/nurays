# Nuray Food & Frost

A community-based food marketplace for Pakistan. Nuray is the bridge between home kitchens (sellers) and the people
in their neighbourhoods (buyers): orders are organised around **communities** such as Askari 11, DHA Phase 5 or
Gulshan-e-Iqbal, and every seller decides, community by community, whether they deliver there and what it costs.

## What it does

- **Buyers** browse kitchens and dishes for their community, fill a cart (one cart can hold several sellers), pay by
  COD, wallet or manual bank/mobile transfer, and follow the order live.
- **Sellers** run a kitchen: products and variants, stock, orders, earnings, promotions, payouts, and their
  **delivery terms per community** (see below).
- **Riders** pick up platform-delivered orders and confirm delivery with a customer OTP.
- **Hub centers** hold cold-chain stock (batches with expiry dates, temperature logs) for products fulfilled from a hub.
- **Admins** approve sellers, riders and products, handle refunds and payouts, and manage hubs and communities.

### Community delivery model

- Every seller belongs to a home community and can fix a **fee, a free-delivery threshold and a minimum order for
  each community** they serve (Seller studio → Delivery). Once a seller has switched on any community, only those
  communities are deliverable.
- "Deliver to other communities" turns cross-community delivery on or off. Nearby communities are suggested.
- A buyer's address is resolved to a community (chosen on the address, GPS position, or the area name). An address
  that matches no community cannot order from a seller with community rules until the buyer picks one.
- The seller picks **who delivers**: the Nuray rider fleet (the delivery fee is platform revenue) or **self-delivery**
  (the seller keeps the fee they charged; no rider job is created). Items fulfilled from a hub are always delivered by
  the platform.
- In a multi-seller order, each seller's fee is stored in `Order.deliveryFeeBreakdown`, and the ledger splits platform
  and seller delivery money from it.

### Money, in short

- Orders, stock and promo discounts are written inside database transactions with atomic stock decrements.
- Cancelling a paid order creates a **refund record**: wallet refunds are instant, manual ones stay `pending` until an
  admin marks them sent (or dismisses them) on the admin order page. Refunds are capped at what was paid.
- Completing an order writes immutable ledger entries (customer payment, seller earning, commission, delivery fees).

## Tech stack

| Layer | What |
|---|---|
| Backend | Node.js 20, Express 5, TypeScript, Prisma 6, PostgreSQL, Redis (ioredis), Socket.IO, Zod |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, Zustand, React Hook Form, Leaflet, Socket.IO client |
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
- PostgreSQL 15+ and Redis 7+ running locally (or reachable by URL)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env        # then edit it (see "Environment variables")
npx prisma generate
npx prisma db push          # create the tables from schema.prisma
npm run seed:e2e            # optional: communities, 13 kitchens, products, a test seller
npm run dev                 # http://localhost:3001  (API: /api/v1, health: /api/v1/health)
```

`.env` needs at least `DATABASE_URL`, `REDIS_URL` and `JWT_SECRET` (32+ characters). Without Redis the health check
reports it unhealthy.

> **Schema changes:** a fresh database is created with `npx prisma db push`. The migration history under
> `prisma/migrations` is incomplete (early tables were created by `db push`), so `prisma migrate dev` will not build a
> database from nothing. On an existing database, apply the migration files you have not run yet, in order. The
> `20261001300000_indexes_uniques_integrity` migration also adds CHECK constraints (non-negative stock and balances)
> that `db push` does not create; it cleans up legacy duplicates and negative values first, backing them up, and is
> safe to re-run. Its index builds are not concurrent, so use a maintenance window on a large live database.

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
| Rider | register at `/register` | needs admin approval at `/admin/riders` |
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

Backend (`backend/.env`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `REDIS_URL` | PostgreSQL and Redis connections |
| `JWT_SECRET` (required), `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | token signing and lifetimes |
| `PORT` (3001), `API_VERSION` (v1), `NODE_ENV` | server |
| `FRONTEND_URL` | links in emails (verification, password reset) |
| `CORS_ORIGIN` | allowed browser origin (default `http://localhost:3000`) |
| `BASE_URL` | public base URL of the backend, used for upload URLs |
| `EMAIL_SERVICE`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | outgoing email (Gmail or SMTP); without it emails are not sent |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | SMS for phone OTP |
| `GOOGLE_CLIENT_ID` | Google sign-in (see `docs/GOOGLE_OAUTH_SETUP.md`) |
| `JAZZCASH_*`, `EASYPAISA_*`, `SAFEPAY_*`, `BANK_*` | payment gateway credentials (all optional; unconfigured gateways show as `not_configured`) |

Frontend (`frontend-web/.env.local`):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | backend API base, e.g. `http://localhost:3001/api/v1` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | optional, Google sign-in |
| `NEXT_PUBLIC_SAFEPAY_SANDBOX` | optional, payment sandbox mode |
| `NEXT_PUBLIC_ENABLE_DEMO_LOGIN` | set `true` to show the demo-account shortcuts in a production build (shown automatically in development) |

## Background jobs

The backend runs two in-process timers (no separate worker): a stock-alert sweep every 6 hours and an hourly sweep that
marks hub batches past their expiry as `expired`.

## Testing

```bash
# Backend unit tests
cd backend && npm test

# Money-flow verification against a REAL throwaway PostgreSQL (concurrency can't be tested with mocks)
cd backend
export DATABASE_URL=postgresql://postgres@localhost:5432/scratch JWT_SECRET=<32+ chars>
npx prisma db push --skip-generate
psql "$DATABASE_URL" -f prisma/migrations/20261001300000_indexes_uniques_integrity/migration.sql   # adds the CHECK constraints
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
