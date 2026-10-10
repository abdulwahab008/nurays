# Testing strategy

Nuray has five layers of checks. Each one catches a different kind of mistake, so pick by what your change can break
(see "Which layer does my change need?" at the end).

| Layer | Where | Needs | Runs in CI |
|---|---|---|---|
| Backend unit tests (Jest) | `backend/tests/*.test.ts` | nothing (no database, no network) | yes, `npm test` |
| Real-database money-flow script | `backend/scripts/verify-money-flows.ts` | a throwaway PostgreSQL | yes, the `money-flows` job |
| API checks over HTTP | `backend/scripts/api-checks/` | the running API and its (throwaway) database | yes, the last step of the `e2e` job |
| Playwright end-to-end | `frontend-web/tests/e2e/` | backend + database + frontend running | `smoke`, `rider-navigation`, `rider-location-resume`, `csp`, `geocode-proxy` and `public-pages` specs |
| Load test | `backend/scripts/load/` | a staging stack and a `*_load` database | no, run by hand before launch: [LOAD_TESTING.md](LOAD_TESTING.md); its arithmetic is in Jest (`load-engine.test.ts`) and its scripts are typechecked in CI |
| Lint, typecheck, build, schema drift, Docker | `.github/workflows/ci.yml` | GitHub Actions | yes |

A manual click-through checklist for a whole order is in [E2E_TESTING_GUIDE.md](E2E_TESTING_GUIDE.md).

## 1. Backend unit tests

```bash
cd backend
npm test                # jest
npm run test:watch
npm run test:coverage
```

Config is `backend/jest.config.js` (ts-jest, node environment, `roots: src, tests`). `backend/tests/setup.ts` sets a
dummy `JWT_SECRET` and `NODE_ENV=test`, because `utils/jwt.ts` refuses to load without a 32+ character secret. Tests
mock Prisma and other collaborators; nothing here talks to PostgreSQL or Redis. That is also the limit of this layer:
it cannot test transactions, row locks, CHECK constraints or concurrency. Use the money-flow script for those.

Suites and what each protects:

| File | Protects |
|---|---|
| `auth-hardening.test.ts` | legacy (type-less) tokens are rejected, revoked sessions (`isTokenRevoked`), upload path checks |
| `jwt.test.ts` | access/refresh token creation and verification, token types |
| `google-auth.test.ts` | Google sign-in (`authenticateWithGoogle`) |
| `reauth.test.ts` | "confirm with your password": only wrong passwords count, five stop even the right one, a 400 not a 401 |
| `change-password.test.ts` | changing the password while signed in: the current one re-checked and counted, the new one judged first, older sessions void and fresh tokens for this one, the owner told, no password given by a token alone |
| `account-notice.test.ts` | the e-mails that say the password or the e-mail address changed: the words, the time in Pakistan, the new address only in part, escaping, only a verified address is written to |
| `profile-notices.test.ts` | what `GET /users/me` says about the account (e-mail verified, has a password, never the hash) and who is told when the e-mail address changes: the address the account leaves, and nobody when the change is refused |
| `config-env.test.ts` | startup configuration validation (`config/env.ts`): what is missing or unsafe in production |
| `errorHandler.test.ts`, `observability.test.ts` | `AppError` conversion, error responses, audit logging of writes |
| `validation.middleware.test.ts` | `validateQuery` against Express 5's getter-only `req.query` |
| `health.controller.test.ts` | health, liveness and readiness, with and without Redis |
| `availability.service.test.ts` | kitchen open/closed schedules, manual override, order timing |
| `community-resolver.test.ts` | resolving an address to a community, and what happens when none matches |
| `deliveryFee.test.ts` | `getDeliveryFeeForSeller`: distance limit, postal codes, minimum order, free-delivery threshold, zones, tiers, community rules |
| `delivery-pricing.test.ts` | Nuray delivery fee and whole-rupee order totals |
| `delivery-provider.test.ts` | `ensureDeliveryForOrder`: platform vs self delivery decides whether a rider job exists |
| `deliveryEarnings.test.ts` | who owns the delivery fee, self-delivery fee sums |
| `promotion-catalog-discount.test.ts` | stacked discounts and catalogue discounts on an order |
| `rider-ledger.test.ts` | rider money, settlements, payouts, delivery ledger entries, cash limit on claim, location updates |
| `rider-approval-gate.test.ts` | an unapproved rider cannot see or claim jobs |
| `ranking.test.ts` | Bayesian rating, trending, recommendations, rider job order (`utils/ranking.ts`) |
| `notify.test.ts` | notification preferences, fan-out per channel, push delivery |
| `gateways.test.ts`, `bank-gateway-verify.test.ts` | payment gateway status and fail-closed behaviour, bank transfer verification |
| `storage.test.ts` | signed file links, local storage driver |
| `permissions.test.ts`, `audit.test.ts` | staff roles and what each may do on the admin API; the admin audit trail |
| `menu.test.ts` | fixed, weekly and daily menus (Pakistan time) |
| `dispatch.test.ts`, `post-delivery.test.ts` | which rider gets a new job and the stored notification (area only); a job taken at once is never announced to the pool |
| `delivery-status.test.ts` | the rider's delivery status machine: transitions, the order status each produces, the conditions on the order |
| `kitchen-order-view.test.ts`, `public-seller-privacy.test.ts` | what a kitchen sees of an order, and what the public kitchen endpoints return |
| `order-party-privacy.test.ts` | live events, the tracking snapshot and the chat name people by role, never by account id; the rider's view of the door; the online-payment guard |
| `address-snapshot.test.ts` | the one rule for the address an order was placed to |
| `password-policy.test.ts`, `reauth.test.ts`, `attempt-budget.test.ts`, `mail-budget.test.ts` | new-password rules; "confirm with your password" counting only wrong passwords; shared counters in Redis or memory |
| `auth-limits.test.ts`, `rate-limit-keys.test.ts` | per-phone and per-e-mail request limits over real HTTP; how limiter keys are built |
| `account-deletion.test.ts` | closing an account: what blocks it and what is scrubbed |
| `input-limits.test.ts` | numbers the database cannot hold, unreal dates and huge page numbers are refused with a 400 |

`backend/tests/fixtures/` holds a SQL fixture and a shell script (`run-migration-300000-fixture.sh`) for exercising one
specific migration against dirty data; they are not part of `npm test`.

Conventions: one file per service or util, named after it; test behaviour a user or operator would notice (an order
total, a refused request) rather than call counts.

## 2. Money-flow verification (real database)

`backend/scripts/verify-money-flows.ts` (about 1,500 lines) imports the real services and runs them against a real
PostgreSQL. Concurrency cannot be tested with mocks, and several rules (stock never negative, one refund per order,
CHECK constraints) live in the database.

Areas it covers, in file order:

- Stock: concurrent last-unit orders, duplicate lines, cancel restocking exactly once.
- Wallet and refunds: concurrent double pay, concurrent double refund, refunds on cancelled paid orders.
- Status endpoints: admin and seller generic status updates cannot cancel or refund.
- Promos: scoping, usage released on cancel, total-limit race.
- Manual (bank/mobile) payments: guards, real accounts only, private receipts.
- Payouts: payout race, who holds the money decides the payout, self-delivery fee money.
- Handover PIN: only the customer sees it, and it gates every handover.
- Rider money: pay fixed at claim, cash taken at the door, settling up.
- Cancellation sweeps: cancelled orders close their rider job, stale orders are swept.
- Idempotent checkout: a retried checkout never places a second order.
- Schema integrity, order and ticket numbers, order history paging.
- Hub batches: intake, release races, per-line allocation.
- Phone verification and OTP delivery (never in a response, resend cooldown, 5 codes per number per hour).
- Review-round money fixes: sessions, password reset, email, images.
- Online payments (Safepay stand-in) and the wallet.
- Catalogue listing (community tiers, paging), kitchen rating (one vote per order).
- Admin tools: people, places, platform codes, disputes, documents, community pair fees.
- Notifications: one per event, preferences.
- Ranking: trending, ratings, search, recommendations, rider job order.

### Running it safely

The script creates its own users, kitchens, orders and ledger rows with unique values and never cleans up. Never point
it at a database you care about, and never at production.

```bash
createdb nuray_scratch                    # or any empty throwaway database
cd backend
export DATABASE_URL=postgresql://postgres@localhost:5432/nuray_scratch
export JWT_SECRET=any-string-of-at-least-32-characters
export NODE_ENV=test
npx prisma migrate deploy                 # NOT `db push`: the CHECK constraints are only in the migrations
npx ts-node scripts/verify-money-flows.ts
dropdb nuray_scratch
```

Output is one `PASS` / `FAIL` line per check and a final `N passed, M failed`. The exit code is 1 if anything failed
and 2 if the script itself crashed. Run it when you touch orders, payments, refunds, the ledger, rider money, hubs or
anything that locks rows. When you fix a money bug, add the check that would have caught it here. CI runs it in the
`money-flows` job against its own PostgreSQL.

Other scripts in `backend/scripts/` (`verify-gap-resolutions.ts`, `run-ideal-flow.ts`, `test-order-progression.ts`,
`test-chat-features.ts`) are older, API-driven helpers that expect a running backend and seeded users. They are not
part of any pipeline.

## 2b. API checks over HTTP

`backend/scripts/api-checks/` holds checks that talk to a **running API** the way the web app does, and read its
database where they need to. They cover what the money-flow script cannot: the routes, the middleware, and the exact
JSON that leaves the API (what a rider or a kitchen is shown, what a wrong input is answered with).

| Suite | What it checks |
|---|---|
| `account-closure` | closing your own account: who may, what blocks it, what a closed account can no longer do, the wrong-password budget |
| `snapshot` | the door an order goes to is the one written down when it was placed, for the rider's job and the rider's order page |
| `security` | token lifetime, what a rider and the customer see of an order, variants private to the kitchen, logout, e-mail change, reset links |
| `validation` | bad paging, repeated keys, missing or wrong-typed bodies, oversized bodies, numbers the database cannot hold, unreal dates |
| `delivery` | map pins inside Pakistan, the door shown only while a job runs, hand-back and retry, the admin order filter, the kitchen dashboard, live position, Maps links |
| `pool` | who hears about jobs in the open pool, with real sockets: riders on duty, not those off duty or pending approval; going on or off duty, a second connection, an approval and a suspension change it without a reconnect |
| `views` | the view counter, compression, rate-limit headers |
| `small-fixes` | literal `%` and `_` in search, malformed links, token types, spreadsheet formulas in the audit export |
| `privacy` | public listings and the open pool carry no pin, door link, e-mail or phone |
| `kitchen-view` | what a kitchen may see of an order, the tracking snapshot, chat and live events |
| `sign-in` | password rules, one answer for a wrong password and an unknown account, reset links, the re-authentication budget, staff passwords, Google sign-in requests, changing the password while signed in (older sessions void, fresh tokens, no password for a Google account), the one-time code purposes |

Every suite makes its own users, kitchens, dishes and orders with unique values, so it runs on any database that has had
`prisma migrate deploy` and any number of times. It never depends on seeded accounts. Because it leaves its data
behind, use a throwaway database.

```bash
# start the API on a throwaway database with automatic rider assignment off (the checks claim delivery jobs by hand)
cd backend
export DATABASE_URL=postgresql://postgres@localhost:5432/nuray_checks
export JWT_SECRET=any-string-of-at-least-32-characters
npx prisma migrate deploy
AUTO_ASSIGN_ENABLED=false PORT=3001 npm run dev          # another terminal

# run every suite, or only those whose name contains a word
API_URL=http://localhost:3001/api/v1 npm run api-checks
API_URL=http://localhost:3001/api/v1 npm run api-checks -- security delivery
```

The output is `PASS` / `FAIL` per check and a final count; the exit code is 1 when a check failed and 2 when the API
cannot be reached or the run was refused. Every account the suites create has the same known password, so they refuse
to run when the API or the database is not on this machine; `API_CHECKS_ALLOW_REMOTE=true` overrides that for a
private test environment and for nothing else. The API runs in development mode, where the per-address, per-phone and
per-e-mail request limits are relaxed, so those limits are covered by the Jest tests instead.

**Writing one:** copy the style of `security.ts`. A check names what must be true, asserts the thing that was wrong
before the fix (not only a status code), and for "X must not appear" first puts X into the data (or has a positive
control). When a real defect turns up, leave the check failing and fix the code; the suites were written to fail on the
unfixed code, and several did (the rider's job text used the edited saved address, the kitchen dashboard counted
dishes as orders, a huge page number answered 500).

## 3. Frontend end-to-end (Playwright)

Config: `frontend-web/playwright.config.ts`. One project (`chromium`), specs in `tests/e2e/`, base URL
`PLAYWRIGHT_BASE_URL` or `http://localhost:3000`, retries and one worker in CI, screenshots on failure, trace on first
retry. The config starts the frontend itself (`npm run dev -- -p 3000` locally, reusing a running server; `npm run
start -- -p 3000` in CI after a build). The backend, PostgreSQL and (optionally) Redis must already be running on
port 3001.

```bash
# terminal 1: backend with seeded data
cd backend && npm run db:migrate && npm run seed:e2e && npm run dev
# terminal 2
cd frontend-web && npx playwright install chromium
npm run test:e2e                                  # all specs
npx playwright test tests/e2e/smoke.spec.ts       # what CI runs
npm run test:e2e:ui                               # interactive runner
```

Environment the specs read: `API_BASE` (default `http://localhost:3001/api/v1`) and `E2E_DB_URL` (a `psql`-readable
URL, used to read the email-verification token because there is no mailbox; the default points at a local
`frozennuray_dev` database, so set it to your own). Screenshot specs write into `test-results/`
(`ARTIFACT_SCREENSHOT_DIR` / `ARTIFACT_DIR` override).

| Spec | What it checks | Data it needs |
|---|---|---|
| `smoke.spec.ts` | landing page and links, `/products` lists items, product page, `/login` (OTP + Email tabs, Google), `/register` role choices, `/checkout` redirects to login, no console errors, API health | `seed:e2e` |
| `purchase.spec.ts` | API register, verify, login, address, cart, COD order; UI login and order list; add to cart | `seed:e2e` (fixed product id), `E2E_DB_URL` |
| `ideal-flow.spec.ts` | login redirects for customer, seller, rider and admin; one full order through kitchen, rider, PIN handover and ledger | runs `backend/scripts/seed-ideal-flow-users.ts` itself |
| `buyer-community-workflow.spec.ts`, `buyer-complete-spec-audit.spec.ts`, `customer-all-tabs.spec.ts` | customer screens: community discovery, cart conflicts, favourites, manual payment with TID, chat, reviews, tracking, notifications, addresses | seeded kitchens, `E2E_DB_URL` |
| `seller-complete-flow.spec.ts` | seller registration, admin reject and approve, open/closed toggle, add dish, order accept/reject/ready, earnings | `E2E_DB_URL`, admin account |
| `seller-analytics.spec.ts`, `seller-products-nav.spec.ts`, `seller-screenshots.spec.ts` | seller studio navigation and analytics; log in through `/dev-login` | seeded demo accounts |
| `rider-batching-capacity.spec.ts`, `rider-cockpit-verification.spec.ts`, `rider-geofence.spec.ts` | rider dashboard, job capacity, role checks, arrival near the customer | seeded demo accounts |

Limitations to know about:

- CI runs only `smoke.spec.ts`. The other specs are run by hand and some were written against earlier screens; a
  failure there may be a stale test rather than a bug. Check the screen before "fixing" the app.
- Several specs log in with the demo accounts created by `seed-ideal-flow-users.ts` (see
  [ACCOUNT_CREDENTIALS.md](ACCOUNT_CREDENTIALS.md)), not by `seed:e2e`.
- Specs cover English only. Urdu and RTL are checked by hand.

## 4. Continuous integration

`.github/workflows/ci.yml` runs on pull requests to `main` and pushes to `main`; a new commit cancels the previous run.

| Job | Steps |
|---|---|
| `backend` | `npm ci`, `prisma generate`, `tsc --noEmit`, `npm run typecheck:scripts` (the API checks and the load tooling), `npm run lint` (no errors, at most the warning count set in `package.json`), `npm test`, `npm run build` |
| `frontend` | `npm ci`, `tsc --noEmit`, `npm run lint` (no errors, at most the warning count set in `package.json`), `npm run build` (with placeholder `NEXT_PUBLIC_*`) |
| `e2e` (after both above) | PostgreSQL 15 and Redis 7 services, `prisma migrate deploy`, schema drift check (`npm run db:check`), `seed:e2e`, build and start the backend on 3001 (automatic rider assignment off), build the frontend, install Chromium, run the `smoke`, `rider-navigation`, `rider-location-resume`, `csp`, `geocode-proxy` and `public-pages` specs (the last with sample app-link settings in the environment), upload the Playwright report, then `npm run api-checks` against the backend |
| `money-flows` (after `backend`) | its own PostgreSQL 15, `prisma migrate deploy`, `scripts/verify-money-flows.ts` in test mode |
| `load-tooling` (after `backend`) | PostgreSQL 15 (`nuray_load`) and Redis 7 services, `prisma migrate deploy`, `npm run load:seed` at 2 % of the launch size, build and start the API (automatic rider assignment off), `load:tokens`, then each load scenario for a few seconds with `--smoke` (fails on a 5xx or an unanswered request, not on speed); see [LOAD_TESTING.md](LOAD_TESTING.md) |
| `docker-build` (after backend and frontend) | builds both images without pushing |

The drift check fails a PR that changes `schema.prisma` without a migration.

`.github/workflows/docker-publish.yml` is not a test: it publishes images to GitHub Container Registry on pushes to
`main`, on `v*` tags, and on manual dispatch.

## Which layer does my change need?

| You changed | Run |
|---|---|
| A pure function (pricing, ranking, fees, validators, env checks) | add or extend a Jest test |
| A service that only reads or maps data | Jest with mocked Prisma |
| Anything that moves money, stock, ledger rows, refunds, payouts, rider cash, or relies on a lock, transaction or CHECK constraint | `verify-money-flows.ts` on a scratch database, plus Jest where logic is pure |
| `schema.prisma` | create a migration (`npx prisma migrate dev`); CI's drift check enforces it; run the money-flow script if constraints changed |
| A frontend page or component | `npx tsc --noEmit`, `npm run build`, click through it in the browser, in English and Urdu |
| Login, registration, routing, a core public page | `smoke.spec.ts` |
| What an API answer carries or hides (a payload, a role's view, a status code for bad input) | an API check in `backend/scripts/api-checks/`, plus Jest for the pure part |
| A flow that crosses roles (checkout, kitchen accept, rider claim, handover) | the manual checklist in [E2E_TESTING_GUIDE.md](E2E_TESTING_GUIDE.md), the API checks, and the relevant Playwright spec |
| A header, the Content-Security-Policy or a Next route handler | `csp.spec.ts` / `geocode-proxy.spec.ts` style Playwright API tests |
| Translations | `npx tsc --noEmit` (a missing Urdu key is a type error), then look at the page in Urdu |
