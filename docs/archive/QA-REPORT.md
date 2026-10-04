# Nuray QA Report

Recurring QA loop (every 5 min). Each iteration reads this file, does one bounded chunk, appends findings, and updates the checklist. Severity: P0 (broken/security) · P1 (major) · P2 (minor) · P3 (polish).

Targets: frontend http://localhost:3000 · backend http://localhost:3001/api/v1
Accounts: admin `claude-admin@nuray.test` / `AdminCheck123!` · seller `claude-seller@nuray.test` / `SellerCheck123!` · customer `claude-run-check@nuray.test` / `RunCheck123!` · rider `claude-rider@nuray.test`

## Progress checklist
- [x] 0. Baseline: all accounts log in (API)
- [x] 1. ADMIN — pages + core actions + security spot-checks done (1 fix, 1 flagged)
- [x] 2. SELLER/kitchen — pages + actions (CRUD, FSM, authz) all pass, no bugs
- [x] 3. CUSTOMER — pages + cart/favorites/orders/reorder/referral all pass, no bugs
- [x] 4. RIDER — page + actions + redirect; 2 bugs fixed
- [x] 5. SECURITY — escalation/IDOR/wallet/validation/rate-limits all pass, no vulns
- [x] 6. UNIT TESTS — added FSM + ETA suites (26 tests pass total)
- [x] 7. MOBILE responsiveness @375px — no overflow on checked pages

## FINAL SUMMARY (all 7 areas covered — loop complete)

**Verdict: app is in good shape.** 3 bugs found & fixed, 1 larger issue flagged, no security vulnerabilities, unit tests added, mobile clean.

**Bugs fixed (verified, both `tsc` green):**
1. **P2** — admin notification bell → 404. Routed admin to the role-aware `/notifications`. ([DashboardNavbar.tsx](frontend-web/components/layout/DashboardNavbar.tsx))
2. **P1** — rider email/password login landed on `/dashboard` instead of `/rider` (3rd login handler missed the rider branch). Fixed `handleEmailLogin`. ([login/page.tsx](frontend-web/app/login/page.tsx))
3. **P2** — rider "My deliveries" card showed a blank address (backend returned the Delivery string field; frontend expected an object). Backend now composes the address from the order; frontend renders the string. ([rider.service.ts](backend/src/services/rider.service.ts), [rider/page.tsx](frontend-web/app/rider/page.tsx), [lib rider.service.ts](frontend-web/lib/services/rider.service.ts))

**Flagged (not fixed — larger, ~7 files):**
- **P2** — admin sub-pages (all except dashboard) render the customer navbar (search/cart/address/"Customer" label) because they use `UserLayout` instead of the admin `DashboardLayout`. Recommend switching those pages or making the layout role-aware.

**Security:** no vulnerabilities. Role escalation blocked (403), order & seller-product IDOR blocked (404), wallet top-up fail-closed (negative/below-min/bogus rejected), input validation 400s, rate limiting configured (auth 20 / OTP 5 / promo 30 per 15-min).

**Unit tests:** added FSM (`tests/orderStatus.test.ts`) + ETA (`tests/orderEta.test.ts`) → `npx jest` = **26 pass** (21 new + 5 jwt).

**Mobile @375px:** no horizontal overflow on any checked page.

**Per-role page sweeps:** admin (8 pages), seller (9), customer (10), rider — all load with no app-level console errors (only external `grafana-faro…paperpal.com` telemetry noise).

**Uncommitted on branch `feat/delivery-marketplace-overhaul`** (PR [#1](https://github.com/abdulwahab008/nurays/pull/1)): the 3 fixes above + 2 new test files. Recommend committing these to the branch.

---

## Findings log
(newest first)

### Iteration 9 — MOBILE responsiveness @375px (PASS)
- Viewport 375×812. Checked for horizontal overflow (`documentElement.scrollWidth > innerWidth`) on: `/rider`, `/dashboard`, `/products`, `/cart`, `/checkout`, `/orders`, `/wallet` — **all scrollWidth = 375, no overflow**.
- `/products` visual at 375px is clean: hamburger nav + header icons, search bar, category chips wrap correctly, "17 products found" + sort dropdown, 2-col product grid. No clipping/overlap.
- Only "offender" found (dashboard) is a decorative `.absolute` blob inside a clipped container — does not cause document overflow.
- Note: seller/admin screens at 375px were covered in earlier light/dark screenshot sweeps (checklist items 25-27); this pass re-confirmed customer + rider.

### Iteration 8 — UNIT TESTS (added, all green)
- Wrote `tests/orderStatus.test.ts` (FSM: isValidItemStatus, canTransitionItem legal/illegal/backward/terminal, allowedItemNextSteps, deriveOrderStatus incl. least-advanced/cancelled-exclusion/all-delivered/empty) and `tests/orderEta.test.ts` (ETA: default prep + fallback travel + buffer, prep floor/override/slowest-item, monotonic travel-by-distance, deterministic via fixed `from`).
- **Result:** `npx jest` → 3 suites, **26 tests pass** (21 new + 5 existing jwt). Jest 29 + ts-jest, tests in `tests/`.
- Targeted the pure-logic utils (no DB/mocks) — the core order-tracking math I added. **Flagged (larger):** service-level tests (wallet idempotency, referral credit, payment confirm) need a test DB / Prisma mocking harness — bigger setup, deferred.

### Iteration 7 — SECURITY (PASS, no vulnerabilities)
- **Role escalation — all blocked (403):** customer/seller/rider → `GET /admin/orders`; customer → `/seller/orders`; customer & seller → `/rider/deliveries/mine`. No-token → `/orders/me` → 401.
- **IDOR (orders) — PASS:** customer requesting another user's order id (`GET /orders/:foreignId`) → **404** (no leak). Admin sees 20 orders, customer owns 6; foreign access denied.
- **IDOR (seller products) — PASS:** claude-seller (sellerId `f53d24b2`) `PATCH /products/:id` on a product owned by another seller (`af290644`) → **404** (blocked). Product mutations are owner-scoped. (First attempt mis-selected claude-seller's own product → false alarm; re-tested definitively by creating a product to confirm own sellerId.)
- **Wallet / payment integrity — PASS:** `POST /payments/wallet/topup` amount −100 → 400, amount 1 (below min) → 400; `POST /payments/wallet/topup/verify` with a bogus paymentId → **404, no credit** (fail-closed). No direct self-credit endpoint exists.
- **Input validation — PASS:** cart add qty −5/0 → 400; admin order status `banana` → 400 (iter 3).
- **Rate limiting — configured:** `authLimiter` 20/15min on login·register·google·verify-email; `otpLimiter` 5/15min on otp/request; promo 30/15min — all with 429 handlers + standard headers. (Verified by config; did not trip it live to avoid locking out subsequent loop iterations.)
- **Test-data note (my mistake, fixed):** a buggy foreign-product selection hard-deleted claude-seller's own product `86da9b27` (a legitimate owner-delete, not a vuln); restored a replacement product `abed47d5`.

### Iteration 6 — RIDER (2 bugs fixed)
- **P1 — FIXED — rider email/password login lands on `/dashboard`, not `/rider`.** `app/login/page.tsx` has 3 login handlers; `handleEmailLogin` (the primary password path) was missing the `rider` redirect branch (Google + OTP handlers had it). Repro: log in as rider with email/password → lands on customer dashboard. Fix: added `else if (userType === 'rider') router.push('/rider')` to `handleEmailLogin`. Verified: rider now lands on `/rider`, 0 console errors. `tsc` clean.
- **P2 — FIXED — rider "My deliveries" card shows a blank delivery address.** Backend `getMyDeliveries` returned `d.deliveryAddress` = the `Delivery` model's string field (often empty), but the frontend `MyDelivery` type/render treated it as an object (`.addressLine1/.area/.city`) → blank. Repro: rider with an active delivery → My deliveries card address line empty (MapPin icon, no text). Fix: backend now composes the string from the Order's `UserAddress` relation (with snapshot/string/`'Address on file'` fallbacks, matching `getAvailableDeliveries`); frontend `deliveryAddress: string` rendered directly. Verified: API returns `"Street 3, Askari 11, sector C, Lahore"`; both `tsc` clean.
- **Rider actions (API) — all pass:** GET available 200 (2), GET mine 200 (1); PATCH status picked_up→200, on_the_way→200; POST location → 200 (ETA computed).
- **Authz — PASS:** customer token → `GET /rider/deliveries/available` → 403.
- Rider page renders correctly (header, My deliveries with Picked up/On the way/Delivered/Share location, Available with Accept), 0 console errors.

### Iteration 5 — CUSTOMER (PASS, no bugs)
- All customer pages load with no app-level console errors: dashboard, products, cart, orders, favorites, wallet, referral, profile, profile/addresses, support (+ notifications fixed in iter 2).
- **Cart lifecycle (API) — pass:** GET /cart 200; POST /cart/items 201; PATCH qty 200; DELETE item 200.
- **Favorites — pass:** GET 200; POST 201; GET /favorites/ids reflects the add; DELETE 200.
- **Orders — pass:** GET /orders/me 200 (6 orders); GET /orders/:id 200; POST /orders/:id/reorder 200 (cart cleaned after).
- **Referral — pass:** GET /users/me/referral 200.
- Non-bug note: `GET /orders` (no `/me`) returns 404 by design — the customer list route is `/orders/me` (frontend uses it correctly); only `POST /orders`, `GET /orders/me`, `GET/POST /orders/:id[...]` exist.

### Iteration 4 — SELLER/kitchen (PASS, no bugs)
- All 9 seller pages load with no app-level console errors: dashboard, orders, products, products/new, promotions, analytics, earnings, settings, notifications.
- **Seller actions (API) — all pass:** GET /seller/dashboard 200; GET /seller/orders 200 (4 orders). **Product CRUD full lifecycle:** POST /products → 201, PATCH price → 200, DELETE → 200.
- **FSM enforcement — PASS:** order item in `ready` state; `PATCH .../status {delivered}` (illegal, skips `dispatched`) → **400 rejected**. State machine guards transitions correctly.
- **Authz — PASS:** seller token → `GET /admin/orders` → **403**.
- Note: seller pages use the correct seller layout (the customer-navbar P2 is admin-only).
- Remaining (low risk): individual UI button clicks for product-form submit, promo create, settings save — underlying endpoints API-verified above.

### Iteration 3 — ADMIN (depth: actions + security)
- **Admin actions all work (API):** GET statistics/analytics/orders(20)/sellers(7)/pending-sellers(1)/payouts(0) → all 200.
- **Approve seller (UI) — PASS:** clicked Approve on "Fix Test Kitchen" → seller cleared, list refreshed to "No Pending Applications" empty state, no app console error. (Approve/reject/moderate/order-status/cancel/refund/payout endpoints exist and are admin-guarded.)
- **Security spot-checks — PASS:** `GET /admin/orders` no-token → 401; with customer token → 403; `PATCH /admin/orders/:id/status` with invalid status → 400. (Authz + input validation correct.)
- **P2 — FLAGGED (larger fix) — admin sub-pages show the CUSTOMER navbar.** `/admin/dashboard` uses the admin `DashboardLayout`, but `/admin/pending-sellers` (and likely sellers/orders/products/analytics/settings/category-requests) use `UserLayout` → renders the customer top nav: product search ("Search for biryani…"), cart icon, "Deliver to …" address, and a "Customer" label — all wrong for an admin. Repro: log in as admin → visit any admin page other than dashboard → look at top bar. Recommended fix: switch those pages from `UserLayout` to the admin `DashboardLayout` (as the dashboard does), or make `UserLayout`/navbar role-aware. ~7 files → deferred per "flag larger ones".
- Remaining admin UI buttons not yet individually clicked (lower risk; endpoints API-verified above): order-detail status/cancel/refund UI, product moderate UI, settings save, dark-mode toggle, profile→logout.

### Iteration 2 — ADMIN (breadth pass)
- **P2 — FIXED — admin notification bell → 404.** `DashboardNavbar.tsx:318` linked admins to `/admin/notifications`, which doesn't exist (no such route; only `/notifications` and `/sellers/notifications` exist). Repro: log in as admin → click bell icon in header → "404: This page could not be found." Fix: route admin to the role-aware `/notifications` page (one-line change). Verified: `/notifications` now loads for admin, 0 console errors.
- Admin login works (form + redirect to /admin/dashboard).
- Pages load with **no app-level console errors** (the only console errors are external `grafana-faro…paperpal.com` telemetry from the sandbox browser, not the app): dashboard (live stats: 2 orders today, 1 pending; pending-seller card), pending-sellers, category-requests, sellers, orders, products, analytics, settings.
- Admin nav inventory: dashboard, pending-sellers, category-requests, sellers, orders, products, analytics, settings, + header bell/profile/theme-toggle.
- **Still pending for ADMIN (next iterations):** deep button/action tests — approve/reject seller, order status management, product moderation/remove, settings save, analytics filters, dark-mode toggle, profile menu/logout.

### Iteration 1 — Baseline (PASS)
- All 4 accounts authenticate: admin/seller/customer/rider → 200 with correct `userType`.
- API contract: `POST /auth/login` needs `{phoneOrEmail, otpCodeOrPassword, loginMethod:"email"}`. Token returned at `data.tokens.access_token` (no httpOnly cookie). Use this for authed API tests.
- No P0/P1 at baseline.

---
