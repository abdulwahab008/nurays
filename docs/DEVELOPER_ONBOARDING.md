# FrozenNuray Platform - Developer Onboarding Guide

## Document Information
- **Last Updated**: 2026-08-07
- **Target Audience**: Anyone setting this project up for the first time (new contributor, tester, reviewer)

> This version replaces an earlier draft that described a fictional `mobile-app/` Flutter client and had the
> backend/frontend port numbers swapped — both are fixed below. If something here stops matching reality again,
> trust the actual `package.json` scripts and `.env.example` files over this doc.

---

## 1. What is FrozenNuray?

FrozenNuray is a homemade-food marketplace connecting home-based food sellers (and small restaurants) with
customers, with its own rider/delivery layer and an admin moderation/ops panel.

### Tech stack

**Backend** (`backend/`): Node.js + Express + TypeScript, PostgreSQL via Prisma ORM, Redis, Socket.io for
realtime order updates.

**Frontend** (`frontend-web/`): Next.js (App Router) + React + TypeScript + Tailwind CSS.

There is no mobile app in this repo.

---

## 2. Prerequisites

- Node.js 20.x or higher
- PostgreSQL 15.x
- Redis 7.x
- Git

Optional: Docker & Docker Compose (see §3.5), Postman/Insomnia for manual API testing.

---

## 3. Getting Started

### 3.1 Repository structure

```
frozen-nuray/
├── backend/          # Express/TypeScript API
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── gateways/     # payment gateway integrations
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   └── validators/
│   ├── prisma/           # schema.prisma + migrations
│   ├── scripts/          # one-off admin/seed/debug scripts (node scripts/*.js)
│   └── tests/            # Jest tests
├── frontend-web/     # Next.js app
│   ├── app/              # App Router pages
│   ├── components/
│   ├── lib/               # API client, services, utils
│   └── tests/             # Playwright E2E tests
└── docs/             # This documentation
```

### 3.2 Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` — at minimum set:
```bash
DATABASE_URL=postgresql://<user>@localhost:5432/frozennuray_dev
JWT_SECRET=some-local-dev-secret
PORT=3001
```
Everything else in `.env.example` (email, SMS/OTP, payment gateways) is optional for local dev — omitted
email config falls back to Ethereal (a fake SMTP inbox, URL printed to the console); omitted SMS/OTP config
just logs the OTP to the console instead of sending it.

> **Port 5432 conflict:** if another project's Postgres/Docker container is already bound to 5432, either stop
> it or run Postgres on an alternate port and update `DATABASE_URL` accordingly — don't assume 5432 is free.

```bash
npx prisma generate
npx prisma migrate dev     # creates the DB schema
npm run dev                 # http://localhost:3001, API base http://localhost:3001/api/v1
```

There's no automatic seed on install. To load sample e2e data: `npm run seed:e2e`. To create your first admin
account (there is no default admin and none can self-register), see `docs/ACCOUNT_CREDENTIALS.md`.

### 3.3 Frontend setup

```bash
cd frontend-web
npm install
```

There's no `.env.example` for the frontend — create `.env.local` yourself with at least:
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` (Google sign-in) and `NEXT_PUBLIC_SAFEPAY_SANDBOX` are optional — the app
degrades gracefully without them (e.g. the Google sign-in button just doesn't render).

```bash
npm run dev
# http://localhost:3000
```

### 3.4 Docker (alternative)

```bash
docker-compose up -d      # from the repo root
docker-compose logs -f
docker-compose down
```
`docker-compose.yml` defines `backend` and `frontend` services with the same ports as above. This hasn't been
exercised as part of this doc's latest revision — if it doesn't match `.env` expectations, prefer the manual
setup in §3.2/3.3, which is the path actually used and verified during development.

---

## 4. Development workflow

### 4.1 Git

Branch naming: `feature/...`, `fix/...`, `refactor/...`, `docs/...`.

Commit messages, conventional-commits style:
```
feat: add product search functionality
fix: resolve cart calculation bug
docs: update API documentation
refactor: improve order processing logic
test: add unit tests for payment service
```

Adjust branch-protection/review requirements to whatever your actual team size and process calls for — there's
no fixed reviewer-count policy baked into this repo.

### 4.2 Code standards

- TypeScript throughout both backend and frontend; run `npm run lint` in either directory before committing.
- Prefer existing helpers/patterns already in the codebase over inventing new ones for the same job.
- Comment the *why*, not the *what* — code should be legible without a narration comment on every line.

### 4.3 Testing

```bash
# Backend — Jest
cd backend
npm test
npm run test:coverage

# Frontend — Playwright E2E (no separate unit-test script currently)
cd frontend-web
npm run test:e2e
npm run test:e2e:ui   # interactive UI mode
```

---

## 5. Key concepts

### 5.1 Authentication

Login supports **both** email+password and phone+OTP (`loginMethod: 'email' | 'otp'` on `POST
/auth/login`). In dev without SMS credentials configured, OTPs are logged to the backend console instead of
sent. See `docs/ACCOUNT_CREDENTIALS.md` for exact request shapes and how each of the four roles
(customer/seller/rider/admin) gets access.

### 5.2 Order lifecycle

Customer builds a cart → checkout creates an `Order` (`pending`) → seller works it through
`confirmed → preparing → ready` → (for `home_delivery` orders) a `Delivery` job is created and a rider claims
and delivers it → `dispatched → in_transit → delivered`. Cash-on-delivery orders get `paymentStatus` flipped to
`paid` automatically at the `delivered` step. See `docs/API_DOCUMENTATION.md` for the full state machine and
`docs/ACCOUNT_CREDENTIALS.md` §5 for how an admin gets involved (seller/rider approval).

### 5.3 Hub vs. direct fulfillment

Products can be fulfilled from a regional **hub** (faster) or **direct** from the seller (slower) —
independent of the rider/delivery-address system, which handles the "last mile" to the customer regardless of
which stock path was used.

---

## 6. Common tasks

**New API endpoint:** route in `routes/` → controller in `controllers/` → business logic in `services/` →
validation schema in `validators/` → test in `tests/` → note it in `docs/API_DOCUMENTATION.md`.

**New DB table/column:** edit `backend/prisma/schema.prisma` → `npx prisma migrate dev --name <description>` →
update the services/types that touch it.

---

## 7. Debugging

**Backend logs:** `npm run dev` runs via `nodemon`, so most errors surface directly in that terminal.

**Database:** `npx prisma studio` from `backend/` opens a DB GUI at http://localhost:5555.

**Frontend:** React DevTools browser extension; Next.js shows a dev-mode error overlay with source maps for
uncaught render errors.

---

## 8. Further reading

- [`docs/ACCOUNT_CREDENTIALS.md`](./ACCOUNT_CREDENTIALS.md) — every account type, how to register/approve one, and known test accounts
- [`docs/E2E_TESTING_GUIDE.md`](./E2E_TESTING_GUIDE.md) — every URL and use case to click through, by role
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — system architecture
- [`docs/API_DOCUMENTATION.md`](./API_DOCUMENTATION.md) — full API reference
- [`docs/DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md) — deploying beyond local dev
- [`docs/TESTING_STRATEGY.md`](./TESTING_STRATEGY.md) — testing process/policy (not a click-through guide — see ACCOUNT_CREDENTIALS.md for that)

**End of document**
