# Developer onboarding

Get Nuray running on your machine, find your way around the code, and learn the conventions the code already follows.
For what Nuray does, read the root [README](../README.md) first.

## Prerequisites

- Node.js 22+
- PostgreSQL 15+ with the `pg_trgm` extension (bundled with PostgreSQL; managed services have it)
- Redis 7+: optional in development, required in production. Without `REDIS_URL`, rate limits, live updates and
  background jobs stay inside the one backend process.

## Local setup

### 1. Database

```bash
createdb nuray_dev
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`. The minimum is `DATABASE_URL` (the example's database name is `frozennuray_dev`, an old name; use the
one you created) and `JWT_SECRET` (32+ characters). Everything else is explained in `backend/.env.example`, and
`src/config/env.ts` checks it at startup (in production it refuses to start and lists what is missing). Development
defaults: email goes to a throwaway Ethereal inbox (the backend logs an "Email preview" link), SMS goes to the console,
files go to local disk (`backend/uploads`), online payment is off without Safepay keys.

```bash
npx prisma generate
npm run db:migrate        # prisma migrate deploy: builds the schema from migrations
npm run seed:e2e          # communities, 13 kitchens, a test kitchen account
npx ts-node scripts/seed-ideal-flow-users.ts   # optional: customer, kitchen, rider and admin demo accounts
npm run dev               # nodemon + ts-node on http://localhost:3001
```

Check `http://localhost:3001/api/v1/health`. Use `npm run db:migrate`, not `prisma db push`: the CHECK constraints
(stock and wallet balances never negative) exist only in the migrations.

### 3. Frontend

```bash
cd frontend-web
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1" > .env.local
npm run dev               # http://localhost:3000
```

`NEXT_PUBLIC_*` variables are read at build time. Optional: `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`,
`NEXT_PUBLIC_ENABLE_DEMO_LOGIN` (see the root README table).

### 4. Sign in

See [ACCOUNT_CREDENTIALS.md](ACCOUNT_CREDENTIALS.md): in development `/login` shows one-click demo accounts after the
seed script above. An admin needs `node scripts/create-admin.js <email> <password> "<name>"` (or the demo admin).

### Redis (optional)

```bash
docker run -d -p 6379:6379 redis:7
# in backend/.env
REDIS_URL=redis://localhost:6379
```

With Redis, the BullMQ queue (email, notification delivery) and the Socket.IO adapter run through it.

### Docker

`docker-compose.yml` builds the backend and frontend images; PostgreSQL and Redis stay on the host. See the root
README.

## Project layout

```
backend/src/
  index.ts          app setup, route mounting under /api/v1, scheduled sweeps, graceful shutdown
  routes/           URL -> middleware -> controller
  controllers/      read the request, call a service, send { success, data }
  services/         business logic and all database work (order, payment, refund, ledger, rider-ledger, hub, ...)
  validators/       zod schemas, one file per area
  middleware/       auth (authenticate, authorize, requireSeller, ...), validate, errorHandler, rate limits, audit
  utils/            pure helpers: pricing.ts, deliveryFee.ts, ranking.ts, paymentCustody.ts, jwt.ts, logger.ts
  config/           env.ts (validation), database.ts (Prisma), redis.ts, socket.ts, sentry.ts
  gateways/         payment gateways (safepay, jazzcash, easypaisa, bank)
  jobs/             queue.ts (BullMQ or in-process), scheduler.ts, email and notification jobs
  storage/          local disk or S3 drivers, signed private file links
backend/prisma/     schema.prisma, migrations/, seed scripts (see prisma/README.md)
backend/scripts/    admin helpers and verification scripts
backend/tests/      Jest tests

frontend-web/
  app/              App Router pages: customer pages at the top level, sellers/, riders/, admin/, hub/
  components/       UI by area (layout, ui, orders, riders, hubs, admin, ...)
  lib/              api-client.ts (axios, token refresh), services/ (API calls), store/ (Zustand),
                    hooks/ (socket, auth init), i18n/ (provider and messages/)
  tests/e2e/        Playwright
```

## Conventions

Backend:

- Controllers are thin; services own the logic. A controller pulls `userId` from `req.user`, calls a service, and
  answers `res.json({ success: true, data })`. Express 5 forwards rejected promises to the error handler, so most
  controllers have no try/catch.
- Validate input with zod in `validators/` and attach it in the route: `validate(schema)` for the body (also
  `validateQuery`). Failures become a 400 `VALIDATION_ERROR` listing the fields.
- Throw `AppError(message, statusCode, code)` from `middleware/errorHandler.ts` for expected failures
  (`new AppError('Not found', 404, 'NOT_FOUND')`). The handler returns `{ success: false, error: { code, message } }`
  and includes the request id.
- Log with `logger` (`utils/logger.ts`, pino). Lines carry the request id automatically. Do not log secrets, OTPs or
  tokens.
- Money lives in services, inside `prisma.$transaction`, with atomic stock decrements, and writes ledger entries.
  Order totals are whole rupees (`utils/pricing.ts`). Never compute money in a controller or in the frontend.
  `utils/paymentCustody.ts` decides who holds the money for a payment method.
- Auth: roles are `customer`, `seller`, `rider`, `admin`, `hub_manager`; guard routes with `authenticate` and
  `authorize('admin')` style middleware.
- Configuration: add new env variables to `backend/.env.example` and to `src/config/env.ts` if startup must check them.

Frontend:

- Pages call the backend through `lib/api-client.ts` (adds the token, refreshes on 401) or a function in
  `lib/services/`. Role pages are wrapped in `RoleGuard`.
- Text goes through `useT(messages)` with a module in `lib/i18n/messages/`, defined with `defineMessages({ en, ur })`;
  TypeScript fails the build if an Urdu key is missing. Admin screens are English-only by choice.
- Layout classes must be direction-neutral so Urdu mirrors: `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`,
  `text-start`/`text-end`; avoid `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left` in translated screens. Keep
  numbers, phone numbers and emails in `dir="ltr"` spans.
- Fixed and sticky bars keep clear of a notch, the status bar and the home indicator with the variables in
  `globals.css`: `pt-(--safe-top)` on a bar at the top, `top-(--header-offset)` for what sticks under the 4rem top bar,
  `pb-(--safe-bottom)` or `bottom-[calc(1.5rem+var(--safe-bottom))]` at the bottom, `--safe-start`/`--safe-end` for a
  corner pop-up or a drawer (they swap in Urdu), `--safe-left`/`--safe-right` for a bar that spans the screen (a notch
  does not mirror). Every value is 0 on a screen without insets. To see a new bar with a notch, give Chromium
  `Emulation.setSafeAreaInsetsOverride` over the DevTools protocol.
- A form never invents a city: `lib/cities.ts` has the list, the Urdu names and the matching (a map's answer to a city,
  or `''` when nothing says), and the city fields start empty. To ask the map service what is at a pin, use
  `reverseGeocode` in `lib/geocode.ts` (it never throws; it returns the area, street, house number, postcode and city,
  and the pin's own city when the service is down) instead of calling `/api/geocode/reverse` yourself.
- Sign-in tokens are read and written only through `tokenStore()` in `lib/token-store.ts` (or the API client's `getAccessToken`, `setTokens` and `clearTokens`, which use it), never with `localStorage` directly: a native shell swaps the store.
- State: Zustand stores in `lib/store/` (auth, cart, community); live updates through `lib/hooks/use-socket.ts` and
  `use-live-refresh.ts`.

## Common tasks

### Add an endpoint

1. Zod schema in `backend/src/validators/<area>.validator.ts`.
2. Logic in `backend/src/services/<area>.service.ts` (throw `AppError`; use a transaction if it writes more than one
   row or touches money or stock).
3. A function in `backend/src/controllers/<area>.controller.ts`.
4. Route in `backend/src/routes/<area>.routes.ts` with `authenticate`, `authorize(...)` and `validate(schema)`. New
   route files are mounted in `src/index.ts` under `/api/${API_VERSION}/...`.
5. A Jest test for pure logic; a check in `scripts/verify-money-flows.ts` if it moves money.
6. Update [API_DOCUMENTATION.md](API_DOCUMENTATION.md).

### Add a page

1. Create `frontend-web/app/<route>/page.tsx` (`'use client'` if it uses hooks). Wrap role pages in `RoleGuard`.
2. Add a sidebar entry in `components/layout/DashboardShell.tsx` if it needs one.
3. Strings in a `lib/i18n/messages/*.ts` module (English and Urdu), used with `useT`.
4. API calls through `apiClient` or a service in `lib/services/`.

### Add a database migration

```bash
cd backend
# edit prisma/schema.prisma, then
npx prisma migrate dev --name short_description
```

Read the generated SQL (renames come out as drop and add; a new required column needs a default or backfill), commit
schema and migration together, and make it safe for old and new code to run side by side. CI fails if the schema and
migrations disagree (`npm run db:check`). Details in `backend/prisma/README.md`.

### Add or change a translation

Add the key to both `en` and `ur` in the right module under `frontend-web/lib/i18n/messages/`. Use `{name}`
placeholders for values. For a new module, export it with `defineMessages` and call `useT(thatModule)`. Run
`npx tsc --noEmit`, then view the page in Urdu.

### Add a scheduled sweep

Register it in `backend/src/index.ts` with `scheduleJob('name', intervalMs, fn)`. The scheduler holds a Postgres
advisory lock so only one instance runs it at a time; make the function safe to repeat.

## Commands

| Where | Command | What it does |
|---|---|---|
| backend | `npm run dev` | server with reload |
| backend | `npm run build` / `npm start` | compile to `dist/`, run it |
| backend | `npm test` | Jest unit tests |
| backend | `npm run lint` | ESLint (CI fails on errors and on more warnings than the cap in `package.json`) |
| backend | `npm run api-checks` | checks over HTTP against a running API on a throwaway database, see [TESTING_STRATEGY.md](TESTING_STRATEGY.md) |
| backend | `npm run typecheck:scripts` | typecheck of the API checks and the load tooling, which the API's own `tsc` does not cover (CI does this) |
| backend | `npm run load:seed` / `load:tokens` / `load:run` | the launch load test, see [LOAD_TESTING.md](LOAD_TESTING.md) |
| backend | `npm run db:migrate` | apply migrations |
| backend | `npm run db:check` | database vs `schema.prisma` (exit code 2 on drift) |
| backend | `npm run prisma:migrate` | `prisma migrate dev` (create a migration) |
| backend | `npm run prisma:studio` | browse the data |
| backend | `npm run seed:e2e` | sample data |
| backend | `npx ts-node scripts/verify-money-flows.ts` | money flows on a scratch database |
| frontend-web | `npm run dev` / `build` / `start` | Next.js |
| frontend-web | `npm run lint` | ESLint (CI fails on errors and on more warnings than the cap in `package.json`) |
| frontend-web | `npx tsc --noEmit` | typecheck (CI does this) |
| frontend-web | `npm test` | unit tests of the pure helpers in `lib/` (Node's test runner, see [TESTING_STRATEGY.md](TESTING_STRATEGY.md)) |
| frontend-web | `npm run test:e2e` | Playwright |

Before pushing, run `npx tsc --noEmit` and `npm run lint` in both folders and `npm test` in both. Details of each test layer are in
[TESTING_STRATEGY.md](TESTING_STRATEGY.md).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Backend exits at startup listing variables | `src/config/env.ts` validation; set the listed variables (`JWT_SECRET` must be 32+ characters) |
| `JWT_SECRET` error when running scripts | export it in the shell, scripts import services that validate it |
| `P1001` can't reach database | PostgreSQL not running or wrong `DATABASE_URL` |
| `db:migrate` fails on an existing database | it was created with `db push` or old migrations; run `npm run db:baseline` once (see `backend/prisma/README.md`) |
| Missing `pg_trgm` | `CREATE EXTENSION pg_trgm;` as a superuser; search typo tolerance needs it |
| Frontend calls the wrong server or gets CORS errors | check `NEXT_PUBLIC_API_URL` (restart `next dev` after changing it) and the backend's `CORS_ORIGIN` / `FRONTEND_URL` |
| Port clash when running both | `next dev` honours a stray `PORT` variable; start the frontend with `npm run dev -- -p 3000` |
| No emails arrive | in development they go to Ethereal; open the "Email preview" link in the backend log |
| No OTP SMS | development uses `SMS_PROVIDER=console`; the code is in the backend log |
| Live updates stop after a restart | the browser reconnects on its own; with several backend instances you need `REDIS_URL` |
| Online payment option missing at checkout | Safepay keys are not set; this is intended |
| Prisma types out of date | `npx prisma generate` |
