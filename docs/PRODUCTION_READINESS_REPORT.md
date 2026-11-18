# Production Readiness Report

**Audit date:** 2026-11-16 to 2026-11-17. **Code audited:** `main` at 831b844. **Fixes:** local branch `fix/audit-high-findings` (commits 3041617 and 757786e, not pushed).

This replaces the report of 2026-11-07 (in git history). Everything here was run or read during this audit; anything not tested is marked NOT VERIFIED.

## A. Executive summary

**Verdict: not ready for production today. Ready after the blocking items in section C and K are closed.**

The application works: every automated suite passes, the money rules hold against a real database, failures of the database and Redis are handled cleanly, and a crawl of every page as every role found no crashes. No critical finding was found.

What stops a launch:

1. **Nothing to run it on.** The repository has no hosting definition, no deploy step, no backup job and no metrics. Backups were shown to restore correctly by hand, but nothing takes them.
2. **20 high findings.** On the fix branch (not merged): 13 fixed, 4 partly fixed, 3 open pending the owner's decision or infrastructure (section D).
3. **Capacity is proven only to 1,000 concurrent users** on a laptop. 5,000 is degraded (p95 12 s). 10,000 fails (27 % of requests error or time out).
4. **Real phones were never tested.** Android was checked on an emulator only; iOS was not rerun in this audit.
5. **Next.js 16.4.2 has a known security advisory** (the dev server refuses to start silently and says so). Dependabot PR #106 has the upgrade; it is not applied.

## B. Scorecard

Scores come from the evidence in this report. They are judgements, not measurements.

| Category | Score | Basis |
|---|---|---|
| Architecture | 70 | Clear layering, shared state in Postgres/Redis, safe with several API instances once S3 is set. One Postgres, no replica, per-request page rendering. |
| Functionality | 74 | 153 page visits clean; 122 of 126 end-to-end tests pass; 44 functional findings (frontend areas), 6 high, all 6 fixed on the branch. |
| Business logic | 62 | 413 money checks and 535 API checks pass, but the audit found 9 high logic findings (deals, pre-orders, refunds, rider jobs). 6 fixed, 3 need decisions. |
| Security | 68 | No critical. 4 high (permission bypass, cart leak, account pre-hijack, staff gate), all fixed and re-tested live. 30+ medium remain (rate limits, OTP cost, re-auth gaps). |
| Database | 70 | Migrations build a database from empty with no drift; restore verified; constraints and locks sound. No backup tooling; cascade deletes on money tables; a few missing indexes. |
| API reliability | 74 | Clean 503s with database down, recovery after dropped connections, graceful shutdown. Some endpoints lack limits or validation (section E). |
| Performance | 62 | To 1,000 users: p95 23 ms, 0 % errors. At 5,000: p95 12 s. |
| Scalability | 35 | 10,000 concurrent users tested and FAILED on one laptop. Not tested on real servers: NOT VERIFIED there. |
| UI/UX | 72 | No overflow at 375, 768 or 1280 px on any page; redirects correct. Small touch targets on about 15 pages; several misleading controls fixed. |
| Mobile compatibility | 50 | Phone-width web verified. Android app loads on an emulator. Real devices, push, background location: NOT VERIFIED. |
| Automated testing | 72 | 1,302 backend tests (62 % statements before the fixes), 228 frontend unit tests, 20 browser specs. CI runs only 11 of the 20 specs; no browser test of buying or fulfilment runs in CI. |
| DevOps/Deployment | 35 | CI is thorough (8 jobs) and images are published. No infrastructure as code, no deploy, no rollback, no backups. |
| Monitoring | 35 | Structured logs with request ids and Sentry hooks. No metrics, no alerts; background failures never reach Sentry. |
| Code quality | 74 | Lint clean with zero warnings on the backend, strict types, no secrets in the repo. Some duplicated rules between web and server (now covered by a parity test for pricing). |

## C. Critical issues

None found in the code.

Launch blockers that are not code defects:

| # | Blocker | Evidence |
|---|---|---|
| C1 | No production infrastructure, deploy pipeline, or backups | No terraform, compose-for-production, deploy job or backup script in the repository (`git ls-files`); `docker-publish.yml` only pushes images. |
| C2 | 10,000 concurrent users fails | Section G: 26.9 % errors and timeouts at 10,000 on one laptop. Target capacity must be tested on real servers. |
| C3 | Next.js security advisory | `next dev` on 16.4.2 prints "affected by a known security vulnerability". Apply PR #106 and rerun CI. |
| C4 | Real-device testing not done | iOS and Android only on simulator/emulator; push, background location and cookie persistence on real phones NOT VERIFIED. |

## D. High-priority issues

20 high findings. Status after this audit's fixes (all fixes are on the local branch, not merged):

| ID | Finding | Status |
|---|---|---|
| API-1 / ACS-1 | Staff permission checks bypassed by URL letter case or a trailing slash (`/admin/STAFF`) | **Fixed.** Reproduced live before; 8 bypass paths now answer 403 live. |
| ACC-2 | Cart endpoints returned the dish's cost price and internal fields, and the kitchen's street address | **Fixed** for cost price and address (address only when the kitchen offers pickup). The kitchen's bank and wallet numbers are still sent, because checkout shows them for pay-by-transfer: **owner decision D1**. |
| AUTH-1 | An account registered on someone else's e-mail stayed usable (through its phone) after the real owner signed in with Google/Apple | **Fixed** for the phone path (phone and push devices are dropped). The second path, an e-mail verification link that needs no session, is **open**. |
| OPS-1 | Password-reset e-mail silently dropped after a send failure | **Fixed**, with a test. |
| OPS-3 | Published web image told search engines to index nothing; release builds could fall back to a localhost API | **Fixed** in `docker-publish.yml` (site URL passed; release tags fail without https API and site addresses). |
| ORD-1 | Kitchen deals ignored the minimum order and the maximum discount; a fixed amount could bring a dish to Rs 0 | **Fixed** (minimum and cap enforced, floor Rs 1, web and server kept equal by a 5,000-case parity test). Whether "Rs 200 off" means per dish or per order: **owner decision D2**. |
| ORD-2 / FUL-1 | Pre-orders treated as immediate: cancelled 30 minutes after placing, rider sent at once | **Partly fixed.** The accept timer and rider dispatch now wait for the delivery day. They do not yet respect the time window, and an unaccepted pre-order is cancelled at 00:30 on its day: **owner decision D3**. |
| ORD-3 | A hub-only dish ordered without a hub takes no hub stock and is delivered as a normal order | **Open.** Refusing it may block real orders if kitchens rely on the fallback: **owner decision D4**. |
| FUL-2 | An assigned rider job never timed out; admin could not take it back | **Fixed** (admin "take back" action; auto-assigned jobs with no rider movement return to the pool after `RIDER_ASSIGN_TIMEOUT_MINUTES`, default 20, counted from when the food is ready). Not checked in a browser. |
| MON-3 | Dismissing a refund created money for the kitchen | **Fixed**, with a numeric test. |
| MON-2 | Cancelling an order with a disputed transfer created no refund record | **Fixed** (a pending manual refund is queued for an admin, for full and partial cancels). |
| MON-1 | Refunds of money the kitchen collected are paid from Nuray's funds against a kitchen debt | **Open: policy, owner decision D5.** |
| FEC-2 | Home tray drawer changed only the browser copy for signed-in customers | **Fixed** (goes through the server cart with rollback). Not checked in a browser. |
| FEC-1 | Guest tray lost on registration | **Fixed** (merge and return path as on sign-in). Not checked in a browser. |
| FEK-1 | Kitchen dishes page showed only the 20 newest dishes | **Fixed** (loads all pages). Not checked in a browser. |
| FEK-2 | Open/closed switch left a permanent "open whatever the hours" | **Fixed**, verified live. |
| FEK-3 | Clearing the daily cap, store notice or closed-until date did not save | **Fixed**, verified live. |
| DB-1 | No backup tooling or tested restore procedure | **Open (infrastructure).** Manual `pg_dump -Fc` and restore verified in this audit (section H). |

### Owner decisions

| # | Decision |
|---|---|
| D1 | Show a kitchen's bank/JazzCash/EasyPaisa numbers before an order exists (today, any signed-in user can read them by adding a dish to the tray), or only after the order is placed. |
| D2 | Fixed-amount kitchen deals: per dish (reword the form), once per order, or code-only. |
| D3 | Pre-orders: when the kitchen's time to accept starts and how long before the slot a rider is sent. |
| D4 | Hub-only dishes without a hub: refuse, or keep delivering from the kitchen. |
| D5 | Who funds a refund when the kitchen holds the customer's money. |
| D6 | Apply the Next.js security upgrade (PR #106) and the other open Dependabot PRs. |
| D7 | Redis: one instance per environment. Keys have no environment prefix, so a shared Redis mixes job queues, caches and job leases (observed in this audit between two local instances). |

## E. Medium- and low-priority issues

68 medium and 82 low findings, all verified, are listed in the appendix with file locations. The medium themes:

- **Abuse and cost:** OTP SMS has no daily or global cap (paid SMS can be drained); `loginLimiter` is keyed on a body field most of its routes lack, so it is both bypassable and shared per IP; registration capped at 10 per hour per IP; `POST /orders` accepts an unbounded item list; unlimited push subscriptions per user can stall the job workers.
- **Re-authentication:** accounts without a password (Google, Apple, OTP) skip the password check before changing e-mail or payout accounts.
- **Privacy:** customer order detail returns the home kitchen's street address and map pin, per-line commission and payout; a rider can cycle claim and release to read customers' details; data that survives account deletion.
- **Money:** partial refund after delivery not recovered from the kitchen; admin "mark delivered" on a cash order with no rider; cash pause bypass; commission avoidance through the delivery fee; a kitchen can close its account while it owes money.
- **Operations:** no reconciliation with Safepay if both the return and the webhook are missed; background failures never reach Sentry; private files fall back to the public bucket when `S3_PRIVATE_BUCKET` is unset; `seed:e2e` has no production guard; 9 of 20 browser specs never run in CI.
- **Kitchen and admin screens:** new-order alert misses orders after a reconnect and holds only one order; payouts list shows 20 rows without paging; support-role staff see buttons that answer 403; "today" figures use the server's midnight, not Pakistan's.
- **Mobile:** deep-link paths not validated; a phone keeps receiving push after its session ends; the rider location watcher survives a full page load.

## F. Security report

Method: 5 security auditors over the code, each finding re-checked by a second agent that tried to refute it and reproduced it against the local API where safe; `npm audit`; secret scan; live failure and header checks.

| Area | Result |
|---|---|
| Critical vulnerabilities | None found |
| Broken access control | 2 high found and fixed (staff permission bypass; cart data leak). The access-control reviewers found no way for one customer or kitchen to read or change another's orders, addresses, notifications or tickets; the API check suites for security and privacy pass. |
| Authentication | 1 high (pre-hijack) partly fixed. Passwords: bcrypt. Refresh token: httpOnly cookie, rotated, reuse ends the session. Mediums: OTP cost, limiter keying, re-auth for passwordless accounts, lost refresh response ends the session after 30 s. |
| Injection | No SQL injection found: raw queries use tagged templates with bound values. No `dangerouslySetInnerHTML` of user data. |
| Uploads | Type and size checked; mediums: no per-user quota, unreferenced files never removed, private files can land in the public bucket by misconfiguration. |
| SSRF | Push subscription endpoint accepts any https URL (blind SSRF, medium). Geocode proxy rate guard trusts a client header (medium). |
| Headers and CSP | Helmet on the API; enforced nonce-based CSP on the web; HSTS, nosniff, frame-ancestors none confirmed live. |
| Secrets | No secrets in tracked files or history; `.env` never committed. Error responses carry no stack trace in production mode (checked on a production-mode instance). |
| Dependencies | Shipped packages: 0 critical, 0 high (4 moderate in the backend through `@sentry/node`). Dev-only: 1 critical (`handlebars` via `ts-jest`), not in the image. **Next.js 16.4.2 advisory: upgrade pending.** |
| Not tested | Penetration testing against a deployed environment, TLS and DNS configuration, cloud permissions: none exists yet. NOT VERIFIED. |

## G. Performance report

Environment: one 8-core laptop, also running the load generator, PostgreSQL 15 (`max_connections` 100) and Redis; 2 API instances in production mode, 20 connections each; fresh load database (2,000 kitchens, 10,000 dishes, 5,000 customers, 300 riders, 50,000 orders). Mixed journey: browse, cart, checkout, kitchens accept and mark ready, riders deliver; returning users with 2 % signing in. The laptop also ran the owner's desktop apps, so the numbers are approximate.

| Concurrent users | Requests/s | p50 | p95 | p99 | 5xx or no answer | Result |
|---|---|---|---|---|---|---|
| 10 | 4.9 | 14 ms | 59 ms | 203 ms | 0.00 % | pass |
| 50 | 10.6 | 16 ms | 45 ms | 73 ms | 0.00 % | pass |
| 100 | 19.6 | 14 ms | 37 ms | 58 ms | 0.00 % | pass |
| 500 | 87 | 8 ms | 24 ms | 38 ms | 0.00 % | pass |
| 1,000 | 172 | 7 ms | 23 ms | 42 ms | 0.00 % | pass |
| 5,000 (main) | 404 | 2.6 s | 12.3 s | 24.5 s | 1.15 % | degraded |
| 5,000 (fix branch) | 408 | 2.7 s | 12.0 s | 22.7 s | 0.22 % | degraded |
| 10,000 (fix branch) | 331 | 8.7 s | 30.0 s | 30.0 s | 26.91 % | **fail** |

- **Maximum tested capacity with acceptable latency: 1,000 concurrent users** (API CPU about 25 % of one core pair, 39 database connections, about 580 MB for both instances).
- At 5,000 the slowest calls were adding to the cart (p50 6.3 s), reading the cart and search; the API answered 1,032 "service busy" responses on one instance.
- At 10,000, sign-in, the kitchen's pending orders and the rider job list all sat at the 30 s timeout; only 650 orders were placed.
- The first attempt at 10,000 could not start: the generator could not reach PostgreSQL straight after the 5,000 step.
- Not measured: CPU and memory per process over time, database query latency (no metrics exist), frontend page speed (Lighthouse) and bundle analysis beyond a successful build. NOT VERIFIED.

**Do not claim 10,000 concurrent users.** It was tested and it failed on this hardware.

## H. Functional testing report

| Test | Result |
|---|---|
| Backend typecheck, scripts typecheck, lint (0 warnings), build | pass |
| Backend unit and integration tests | main: 1,256 passed. Fix branch: 1,302 passed, 0 failed (140 suites) |
| Backend coverage (main) | 62 % statements, 51 % branches |
| Frontend typecheck, lint (0 errors, 112 warnings under the allowed cap), production build (73 pages) | pass |
| Frontend unit tests | main: 211 passed. Fix branch: 228 passed |
| Mobile shell tests | 10 passed |
| API checks against a real database (security, validation, delivery, privacy, sign-in, moderation, payouts, two-factor…) | 535 passed, 0 failed (main and fix branch) |
| Money flows against a real database | 413 passed, 0 failed (main and fix branch), in a clean environment |
| Fresh database from migrations; schema drift check | 25 migrations applied; no drift |
| Backup and restore | `pg_dump -Fc` restored to a scratch database: 54 tables, 172 indexes, 81 foreign keys, 13 checks, 3 triggers, row counts and an order checksum identical; audit-log delete still refused; migrations "up to date" |
| Database unreachable | health 503, live 200, ready 503; API answers 503 `SERVICE_UNAVAILABLE` in under 25 ms; process stays up |
| Redis unreachable | health "degraded" 200; browse, search, sign-in work; a cash order placed in 88 ms with notifications written; scheduler falls back to a Postgres lock |
| All database connections killed | one request 503, then normal |
| Graceful shutdown | in-flight request completed; exit in 1 s |
| Page crawl, isolated browser | 153 visits: public 35, customer 23, kitchen 18, pending kitchen 6, rejected kitchen 5, rider 10, admin 27 (desktop) + 12 (phone), customer desktop 10 and tablet 7. No crash, no error screen, no horizontal overflow, wrong-role visits redirected. |
| Browser end-to-end specs (all 20, fix branch) | 122 passed, 3 failed, 1 skipped. 2 failures are `native-shell` tests that assume no Google client id (set locally; they pass in CI). 1 is `customer-all-tabs`, which also failed intermittently on main. |
| Live re-test of fixes | 14 of 14 checks pass (permission bypass paths, cart fields, kitchen switch, settings clearing) |
| Android app | loads the home page on an emulator |

**Not tested:** hub manager pages (no hub account exists in the test data); completing a Google or Apple sign-in; real Safepay sandbox payments end to end (the return and webhook handlers are covered by signed requests in tests); SMS and e-mail delivery through real providers; push on devices; iOS app in this audit; the fixed drawer, registration merge, dishes paging and admin take-back button in a browser.

Test-tooling limits found: the money verifier runs once per database, expects no seeded delivery areas and no payment keys; the end-to-end specs default to a different database than the dev server uses; the machine's default `pg_dump` (v14) fails against the v15 server and leaves a 0-byte file, so a backup script must check the exit code.

## I. Code modifications

All on local branch `fix/audit-high-findings`; nothing pushed. Each has a regression test unless noted.

| Files | Problem | Change | Test | Verified |
|---|---|---|---|---|
| `backend/src/utils/permissions.ts` | Permission rules matched the raw path; the router ignores case and trailing slashes | Path normalised (decode, lower-case, collapse slashes) before matching | `tests/permissions.test.ts` | live: 8 paths 403 |
| `backend/src/services/cart.service.ts` | Raw dish row (cost price) returned; pickup address always sent; variant price reset on quantity change | Public field list; address only with pickup; variant price kept | live check | live |
| `backend/src/jobs/email.jobs.ts` | Failed reset e-mail left its link, so the retry sent nothing | Link removed when the send fails | `tests/password-reset-email-retry.test.ts` | unit |
| `backend/src/services/verified-email-sign-in.service.ts` | Squatter's phone survived a provider sign-in | Phone reset, push devices removed | `tests/apple-auth.test.ts` | unit |
| `backend/src/services/seller.service.ts`, `frontend-web/app/sellers/settings/page.tsx` | Reopen left a permanent override; cleared fields not saved | Reopen returns to the hours; cleared fields sent as null | live check | live |
| `.github/workflows/docker-publish.yml` | Site URL not passed; release could ship a localhost API | Build arg added; release gate on https addresses | none (workflow) | not run |
| `backend/src/utils/pricing.ts`, `promotion.service.ts`, `frontend-web/lib/pricing.ts`, cart, checkout, dish and kitchen pages | Deal minimum and cap ignored; Rs 0 dishes | Order-level deal pricing, same on web and server | `promotion-catalog-discount`, `web-parity`, `pricing` unit tests | unit + 413 money checks |
| `backend/src/services/order-maintenance.service.ts`, `rider.service.ts`, `index.ts` | Pre-orders cancelled and dispatched as immediate | Timer and dispatch wait for the delivery day | `stale-order-sweep`, `scheduled-delivery-dispatch` | unit |
| `backend/src/services/dispatch.service.ts`, `admin-order.*`, `notificationText.ts`, `frontend-web/app/admin/orders/[id]/page.tsx`, `.env.example` | Assigned job never released | Admin take-back; idle auto-assigned jobs reclaimed | `rider-job-take-back` | unit |
| `backend/src/services/seller-balance.service.ts`, `refund.service.ts` | Dismissed refund created money; disputed transfer lost on cancel | Balance rule corrected; pending manual refund queued | `kitchen-collected-refund-balance`, `disputed-transfer-refund` | unit + money checks |
| `frontend-web/components/marketplace/SlideOverCartDrawer.tsx`, `lib/tray-server.ts` | Drawer edited only the local tray | Server cart calls with rollback | `tray-server` unit test | unit |
| `frontend-web/app/register/page.tsx`, `login/page.tsx`, `verify-email-pending/page.tsx`, `lib/auth-redirect.ts` | Guest tray and return path lost on sign-up | Merge and return path as on sign-in | `auth-redirect` unit test | unit |
| `frontend-web/app/sellers/products/page.tsx`, `lib/all-pages.ts` | Only 20 dishes loaded | Loads every page | `all-pages` unit test | unit |

An independent reviewer read the combined diff and raised 8 points; 4 were repaired (partial cancel on a disputed transfer, the idle-job timer, discount cap rounding, dead code) and 4 are the open decisions above.

## J. Deployment checklist

Before launch:

- [ ] Review and merge `fix/audit-high-findings`; decide D1 to D7.
- [ ] Apply the Next.js security upgrade (PR #106); rerun CI.
- [ ] Choose hosting; write it as code: load balancer with TLS and sticky sessions, 2+ API instances, 2+ web instances, managed PostgreSQL 15 with point-in-time recovery, managed Redis (one per environment), S3-compatible bucket with a private bucket and a CDN.
- [ ] Website and API on one registrable domain (the refresh cookie needs it).
- [ ] Set every production variable; the API refuses to start without the required ones. Include `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, `S3_PRIVATE_BUCKET`, `TRUST_PROXY`, `STORAGE_DRIVER=s3`, Safepay production keys and webhook secret, SMTP provider, Twilio, VAPID/FCM/APNs.
- [ ] Automated backups with a restore drill; take a `pg_dump -Fc` before any release with a migration.
- [ ] Deploy job with health-check gating and a rollback step; run migrations once, not on every instance start.
- [ ] Metrics and alerts: error rate, p95 latency, database connections, queue failures, Redis and database down, disk.
- [ ] Send background-job, scheduler and webhook failures to Sentry.
- [ ] Staging environment; rerun the load ladder there to the launch target.
- [ ] Test on real Android and iOS phones: sign-in persistence, push, rider background location, Safepay payment and return.
- [ ] One Safepay sandbox order paid end to end; one refund.
- [ ] Add a daily cap and bot check on OTP SMS before the number is public.
- [ ] Run all 20 browser specs in CI.
- [ ] Remove demo and e2e accounts from any production database; confirm `seed:e2e` cannot run there.
- [ ] Decide whether the repository stays public.

## K. Final launch decision

**NO-GO today. CONDITIONAL GO once these are closed:**

1. Production infrastructure with backups, deploy and rollback, and monitoring exists (C1).
2. The fix branch is merged and the three open high findings (ORD-3, MON-1, the rest of AUTH-1) and decisions D1 to D5 are settled.
3. The Next.js security upgrade is applied (C3).
4. A load test on the real environment meets the launch target. For a launch expecting up to about 1,000 people at once, the measured numbers are comfortable; 10,000 is not supported.
5. A real-device pass on Android and iOS (C4).

Reasoning: the code is in good condition for a first release, with strong automated checks and no critical defect, but there is nowhere safe to run it yet, no way to recover its data, and no way to see it failing. Those are launch blockers on their own.

## Notes on this audit

- The static audit used 14 read-only reviewers by area and 14 independent verifiers: 170 findings confirmed (50 reproduced live, 99 by code, 20 partly, 1 not verifiable).
- Two verifiers created temporary staff accounts in the dev database and demoted them afterwards. Test orders and accounts from the checks remain in the dev and audit databases.
- Throwaway databases left on this machine: `frozennuray_audit`, `frozennuray_auditmoney`, `frozennuray_auditrestore`, `frozennuray_ladder_load`, `frozennuray_p7check`, `frozennuray_p7_load`.
- A browser automation tool used early in the crawl drove the owner's real Chrome and one call cleared cookies there; the crawl was moved to an isolated headless browser.

## What the audit did not cover

Each reviewer listed what it could not check:

- **Authentication:** Everything here is static tracing at 831b844; nothing was run (no server, tests, load or live requests), so the three race findings (re-auth counter, 2FA counter, refresh versus sign-out) and the burst sizes quoted for them are estimates from the code. Not covered: real environment values (no .env read) and the deployed topology (TRUST_PROXY hop count, same-site domains, HSTS at the TLS terminator, Redis availability; all limiters fail open when Redis is down). Native mobile code beyond the Capacitor config and the Android cookie flush (SocialLogin plugin, nonce handling for Google/Apple ID to
- **Access control (customer, kitchen):** Static, read-only trace only: nothing was run against a live server, so every reproduction is derived from the code path, not observed. Not covered (other auditors' areas or out of time): auth routes (login, OTP, refresh, Google/Apple, 2FA), admin and admin-order routes and the staff permission matrix, rider and hub routes, category CRUD, health; Safepay return/webhook signature logic and settleAttempt internals (only ownership checks on /payments were traced); rate-limiter adequacy; the storage drivers' URL signing and the upload re-encoding (only the owner/kind checks on user-supplied file r
- **Access control (staff, rider, realtime):** Method: code reading only, plus one read-only node one-liner against the installed path-to-regexp to confirm route matching. No server, tests or requests were run, so every reproduction is derived from the code path, not observed. Note the backend runs Express 5.2.1 (router 2.2.0), not Express 4 as the brief says.  Not covered or only skimmed: - Frontend (frontend-web admin/rider/hub pages, proxy.ts) and mobile/: not reviewed beyond a grep for which fields the UI uses. The API is what I judged. - Money logic behind the admin routes (admin-order.service cancel/refund/retry-delivery/confirm-paym
- **Injection, web and infra security:** Not run: nothing was executed (no server, no requests); every finding is from reading code, so the reproductions are derived, not observed. Not covered or only partly covered: (1) Safepay: I could not confirm against Safepay itself that the browser return (HMAC-SHA256 of the tracker only, no state or amount in the signature, no server-side lookup before settling, online-payment.service settleAttempt) is only ever issued for a successful payment; if Safepay also returns `sig` for failed sessions, orders could be marked paid. The webhook signature covers body.data only while the unsigned body.ty
- **Ordering logic:** Nothing was executed: no tests, builds, servers or database, so every finding comes from reading the code and tracing the path; the concurrency behaviours and the numeric-overflow 5xx in the API-gaps finding are reasoned, not observed. backend/tests/web-parity.test.ts was not run; frontend/backend parity was checked by reading both sides.  Not covered, or only skimmed: - Hub inventory beyond order-time allocation and release: intake, expiry, the hub console, the hub_pickup handover, and how product.stockQuantity is meant to relate to hub batches (a hub line decrements both). - Payment flows: S
- **Money logic:** Read-only review; nothing was executed (no tests, database, race tests or Safepay sandbox), so every concurrency statement comes from reading the code.  Not verifiable offline (Safepay behaviour): whether /order/v1/init takes rupees or paisa (the code itself says "confirm in the sandbox"), whether Safepay issues the return signature only after a successful payment (settleAttempt trusts the signed return without a server-side state or amount lookup; fetchSafepayPayment is diagnostics only), whether the webhook HMAC over JSON.stringify(body.data) matches Safepay's bytes, and whether 'payment:cre
- **Fulfilment logic:** Static reading only: nothing was executed, so every race above is traced from the code, not reproduced. Not covered or only skimmed: backend/src/services/hub.service.ts beyond its method list (batch intake, status, expiry; it has no order transitions); config/socket.ts room membership and authorisation; utils/dispatch.ts ranking rules beyond its header and utils/riderJobs.ts (cashToCollect, routeMatch); jobs/email.jobs.ts; push/SMS/email senders; the payment services (order-payment, online-payment, payment) apart from confirming they refuse cancelled/refunded orders on their first read (I did 
- **Database:** Static reading only: no database was available, so I did not run prisma migrate diff, EXPLAIN any query, or verify lock behaviour and deadlocks empirically (the ranking-job deadlock and the seq scan on rider_ledger_entries.order_id are derived from the code and index list, not observed). I did not compare 0_baseline/migration.sql line by line against schema.prisma (I relied on CI's db:check step existing at .github/workflows/ci.yml:171 and spot-checked riders, deliveries and the CHECK block), and did not read prisma/baseline/, migrations-archive/, scripts/db-baseline.ts or the seed scripts. Se
- **Frontend: customer:** Static read only: nothing was run in a browser, so responsive layout, dark mode and real touch-target sizes were judged from class names alone. Not read in depth: app/kitchens/[id]/KitchenStorefrontPage.tsx and app/products/page.tsx beyond their add-to-tray, limit and conflict logic; the JSX of app/dashboard/page.tsx past the handlers; components/home/* presentation components; OrderChatModal internals (voice/image upload), RiderLiveMap, OrderProgress, OnlinePaymentCard beyond its two calls; CommunitySelector; profile PasswordCard/TwoFactorCard/SessionsCard; help/HelpFaq, terms/privacy/refund-
- **Frontend: kitchen, rider, hub:** Static reading only: nothing was run, so responsive layout, focus order, contrast and screen-reader behaviour were not verified in a browser; I saw no accessibility defect in the code I read (roles, labels and 44 px targets are consistently present) but that is not a test. Not read or only skimmed: DashboardNavbar, DashboardSidebar and PhoneTabBar (only link targets and badge code); product form sub-components (VariantsEditor, PhotosSection, CategoryPicker, MenuTypeField, PricingSection, KeyboardShortcuts) and the variant endpoints; StockList; ClosedKitchenModal; PayoutStatement; PushPrompt; B
- **Frontend: admin:** Static read only; nothing was run in a browser. Not read or only skimmed: components/hubs/HubOperationsConsole (the /admin/hubs Operations page; only its API calls were listed: intake product picker is capped at 100 frozen products), components/payouts/PayoutStatement and its CSV download, components/admin/CommunityPairFees, DocumentList, RejectReasonModal, AdminListParts/AdminFilterTabs internals, the render half of support, reviews, communities, hubs/manage, promotions, category-requests and audit-log pages (their data calls and handlers were checked, not every field of the JSX), the audit-l
- **API contract and rate limits:** Not done: (1) A field-by-field request/response comparison for all ~240 frontend calls. I matched every path+method against the route table and spot-checked payload field names only for orders (create, submit-payment), reviews, promotions/validate, rider duty/status/location, cart, uploads and auth; response-shape mismatches elsewhere (admin screens, hub console, seller dashboard) are unchecked. (2) Service-level authorisation behind unvalidated params (product-variants, stock-alerts, order messages, seller order item endpoints) was not traced; I only confirmed ids are plain text columns so a 
- **Reliability, ops, tests, quality:** Not run (by rule): builds, jest, Playwright, docker, npm audit; everything is from reading code at 831b844. Not covered or only skimmed: (1) socket layer (config/socket.ts, redis adapter failure, reconnect storms) beyond noting tests exist; (2) S3 driver and local-upload behaviour with several instances, backup/restore procedure in docs/DEPLOYMENT_GUIDE.md and OPERATIONS_AND_LOGGING.md (only confirmed the sections exist, not their correctness); (3) Prisma pool/statement-timeout tuning and external calls made while a DB transaction is open (spot-checked online-payment only); (4) refund.service,
- **Mobile shell:** Nothing was built or run on a device or emulator; everything is a static trace. Needs real phones: (1) Android cookie flush vs refresh-token reuse detection after closing the app (MainActivity.onPause flush is there; behaviour unverified); iOS WKWebView cookie persistence and whether the refresh cookie is sent if the API is on a different registrable domain than the site (SameSite=Lax); (2) Safepay card flow inside the WebView: any top-level redirect to a bank 3-D Secure host that is not in allowNavigation is handed to the phone's browser (Bridge.java:413-426), which would strand the payment o

## Appendix: all verified findings

IDs: AUTH authentication, ACC and ACS access control, WEB injection and infrastructure, ORD ordering, MON money, FUL fulfilment, DB database, FEC/FEK/FEA frontend (customer, kitchen, admin), API contract, OPS operations, MOB mobile. "Where" is the first location; the full evidence for each is in the audit working files.

### Authentication

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| AUTH-1 | high | Pre-registered account stays backdoored after the real owner signs in with Google/Apple | `backend/src/services/verified-email-sign-in.service.ts:31-48` | by code |
| AUTH-2 | medium | Password re-confirmation is skipped for accounts without a password (Google, Apple, OTP sign-in) | `backend/src/services/reauth.service.ts:42-51` | partly |
| AUTH-3 | medium | OTP SMS endpoint has no global or daily cap and no bot check | `backend/src/routes/auth.routes.ts:64` | by code |
| AUTH-4 | medium | loginLimiter is keyed on a body field that most of its routes do not have | `backend/src/middleware/rateLimiter.ts:67-70` | reproduced live |
| AUTH-5 | medium | Password re-confirmation limit is check-then-act: parallel guesses all pass | `backend/src/services/reauth.service.ts:25-34` | reproduced live |
| AUTH-6 | medium | PATCH /users/me is an unlimited e-mail-existence oracle and an unthrottled bcrypt endpoint | `backend/src/services/user-profile.service.ts:84-105` | reproduced live |
| AUTH-7 | medium | Staff second-step code guessing: racy counter, no escalation, no alert | `backend/src/services/staff-two-factor.service.ts:87-121` | by code |
| AUTH-8 | medium | Anyone can keep a staff account locked out of sign-in | `backend/src/middleware/rateLimiter.ts:264-274` | by code |
| AUTH-9 | medium | Unverified e-mail accounts: address squatting and a silent dead end on forgot-password | `backend/src/services/auth.service.ts:76-89` | by code |
| AUTH-10 | medium | A lost /auth/refresh response ends the whole session 30 seconds later | `backend/src/services/session.service.ts:123-141` | reproduced live |
| AUTH-11 | low | Refresh-token reuse inside 30 s creates a second lineage that is never detected; reuse revocation leaves sockets open | `backend/src/services/session.service.ts:126-143` | reproduced live |
| AUTH-12 | low | Account enumeration paths the probe guard does not count | `backend/src/services/auth.service.ts:394-397` | reproduced live |
| AUTH-13 | low | OTP codes and e-mail verification tokens are stored in plain text | `backend/prisma/schema.prisma:118-146` | by code |
| AUTH-14 | low | Known low items still present: 2FA switch not refused in production, phone in JWT, one secret for three jobs | `backend/src/services/staff-two-factor.service.ts:27-28` | partly |
| AUTH-15 | low | A refresh racing a sign-out can bring the ended session back | `backend/src/services/session.service.ts:56-78` | reproduced live |

### Access control (customer, kitchen)

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| ACC-2 | high | Cart endpoints hand any signed-in user a kitchen's bank account, JazzCash/EasyPaisa numbers, home pickup address and the dish's cost price | `backend/src/services/cart.service.ts:66-85` | reproduced live |
| ACC-1 | medium | Kitchen approval (KYC) is not enforced anywhere on the selling path: an unverified or rejected kitchen can go live and take customers' money | `backend/src/routes/product.routes.ts:33-66` | partly |
| ACC-3 | medium | Customer's GET /orders/:id leaks the home kitchen's street address and GPS pin, per-line commission/payout, kitchen fee breakdown and other parties' account ids | `backend/src/services/order-queries.service.ts:48-88 (presentDelivery)` | reproduced live |
| ACC-4 | medium | Unlimited push subscriptions with any https endpoint: one user can stall the shared job workers (verification and password-reset e-mails included) and make the server call arbitrary hosts | `backend/src/validators/notification.validator.ts:12-19` | by code |
| ACC-6 | medium | A kitchen can close its account while it owes Nuray money; identity documents, payout accounts and phone are wiped and the phone can register again | `backend/src/services/account-deletion.service.ts:58-65 (kitchen checks` | by code |
| ACC-5 | low | Order chat never closes: the rider and the kitchen can read and write to the customer on an order forever | `backend/src/services/order-chat.service.ts:24-38` | reproduced live |
| ACC-7 | low | POST /payments/process lets a customer turn any unpaid order into cash-on-delivery after placement, skipping the kitchen cash pause and the rider cash-limit check | `backend/src/services/payment.service.ts:89-100` | reproduced live |
| ACC-8 | low | Public distance oracle pinpoints a home kitchen's location | `backend/src/services/product.service.ts:226-262 (distanceKm at 251)` | reproduced live |
| ACC-9 | low | Review photos accept any number of arbitrary external URLs and are served from the public reviews endpoint | `backend/src/validators/review.validator.ts:10` | by code |
| ACC-10 | low | Visibility filters are inconsistent: favourites show dishes awaiting re-review, and a dish the kitchen hid is still served by its URL | `backend/src/services/favorite.service.ts:25-27` | by code |
| ACC-11 | low | PATCH /promotions/:id skips the discount limits when discountType is omitted, producing negative order line prices | `backend/src/validators/promotion.validator.ts:61-71` | reproduced live |
| ACC-12 | low | Changing the quantity of a variant line in the cart overwrites its price snapshot with the base dish price | `backend/src/services/cart.service.ts:591-599 (priceSnapshot: cartItem.` | by code |
| ACC-13 | low | Password re-confirmation on payout changes, payout requests, e-mail change and account closure is a no-op for accounts without a password (Google / Apple sign-in) | `backend/src/services/reauth.service.ts:42-51` | by code |

### Access control (staff, rider, realtime)

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| ACS-1 | high | Staff permission gate is case- and trailing-slash-sensitive, the admin routers are not: support reads ID documents / finance / audit log, an admin performs super-admin-only actions | `backend/src/utils/permissions.ts:56-85` | by code |
| ACS-2 | medium | A rider can cycle claim -> release over the whole job pool and collect every customer's name, phone, door address and map pin | `backend/src/services/rider.service.ts:149-216` | by code |
| ACS-3 | medium | Customer's order detail returns the kitchen's street address and exact map pin through the delivery object | `backend/src/services/order-queries.service.ts:48-88 (line 72 `...rest`` | reproduced live |
| ACS-4 | medium | Anyone can fill the append-only audit log: every 401/403 on /admin/* writes a row carrying the raw request path | `backend/src/middleware/audit.ts:81-100` | reproduced live |
| ACS-5 | low | Order chat never closes: the kitchen and the last rider can read and message the customer indefinitely, and staff posts there are unaudited | `backend/src/services/order-chat.service.ts:11-98` | reproduced live |
| ACS-6 | low | Admin order detail gives support staff audit-log rows and ledger entries they have no permission for | `backend/src/services/admin-order.service.ts:281-305` | by code |
| ACS-7 | low | With STORAGE_DRIVER=s3 and no S3_PRIVATE_BUCKET, private files (CNIC photos, receipts, chat media) are written to the public bucket; startup does not object | `backend/src/storage/index.ts:38` | by code |
| ACS-8 | low | No limit on concurrent Socket.IO connections per account or address; handshakes are outside the API rate limiter | `backend/src/config/socket.ts:79-166` | by code |
| ACS-9 | low | STAFF_2FA_REQUIRED=false is accepted in production, leaving staff sign-in password-only | `backend/src/services/staff-two-factor.service.ts:27-38` | by code |

### Injection, web and infra security

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| WEB-1 | medium | Web-push subscriptions: any https URL, unlimited per user -> blind SSRF and starvation of the shared job queue (password-reset / verification emails included) | `backend/src/validators/notification.validator.ts:12-19` | partly |
| WEB-2 | medium | Private files (CNIC photos, payment receipts, chat media) silently go to the public bucket when S3_PRIVATE_BUCKET is not set | `backend/src/storage/index.ts:38` | by code |
| WEB-3 | medium | Uploads have no storage quota and unreferenced files are never removed; raw PDFs and audio up to 10 MB are stored for any signed-in account | `backend/src/routes/upload.routes.ts:35-47` | reproduced live |
| WEB-4 | medium | Geocoding proxy: per-address guard keyed on the client-supplied first X-Forwarded-For value, in front of one global 1 request/second queue | `frontend-web/lib/geocode-proxy.ts:30-33` | by code |
| WEB-5 | low | CSP is not sent for any page URL that ends in a dot-extension | `frontend-web/proxy.ts:31-39` | reproduced live |
| WEB-6 | low | Review photos accept any URL scheme and any number of entries, and are returned by the public reviews endpoint | `backend/src/validators/review.validator.ts:10` | by code |
| WEB-7 | low | Stock-alert e-mail builds HTML from product, variant and profile names without escaping | `backend/src/services/stock-alert.service.ts:69-95` | by code |
| WEB-8 | low | Any request whose URL contains "/health" is left out of the access log | `backend/src/middleware/requestContext.ts:44` | by code |
| WEB-9 | low | Public product search term has no length limit | `backend/src/validators/product.validator.ts:23` | reproduced live |
| WEB-10 | low | All rate limits fail open when the Redis store errors | `backend/src/middleware/rateLimiter.ts:167` | by code |

### Ordering logic

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| ORD-1 | high | Kitchen promotions are auto-applied per dish: the minimum order is never checked and a fixed 'Rs off' comes off every unit | `backend/src/services/promotion.service.ts:81-107` | reproduced live |
| ORD-2 | high | The delivery day and time slot is stored but nothing honours it: scheduled and pre-orders are cooked and dispatched at once | `backend/src/services/order-placement.service.ts:29` | by code |
| ORD-3 | high | A dish marked 'Through a hub' ordered without a hub: no hub stock is taken, a Nuray rider is sent, and delivery is priced as the kitchen's own | `backend/src/services/order-placement.service.ts:289-292` | by code |
| ORD-4 | medium | A pre-order-only kitchen still takes orders while on vacation, manually closed, busy or suspended | `backend/src/services/availability.service.ts:170-181` | by code |
| ORD-5 | medium | The daily order cap counts order lines, not orders, and counts them on the day placed rather than the delivery day | `backend/src/services/availability.service.ts:286-307` | by code |
| ORD-6 | medium | A kitchen open past midnight with a last-order time after midnight refuses orders all evening | `backend/src/services/availability.service.ts:274-284` | by code |
| ORD-7 | medium | Menu day is checked against the delivery day at order time but against today in the catalog and cart: daily dishes cannot be ordered after 21:30 or from pre-order kitchens | `backend/src/services/order-placement.service.ts:249-250` | by code |
| ORD-8 | medium | Changing the quantity of a variant line resets its cart price to the base dish price | `backend/src/services/cart.service.ts:591-598 (priceSnapshot: cartItem.` | by code |
| ORD-9 | low | Deleting a variant detaches it from live orders and trays: cancelled stock goes back to the base dish, and tray lines silently become the base dish | `backend/src/services/product-variant.service.ts:211-234` | by code |
| ORD-10 | low | createOrder accepts requests the app never sends: unlimited lines, any future date, a same-day order past a minimum-notice rule, and hub pickup at an unrelated hub | `backend/src/validators/order.validator.ts:5-13` | partly |
| ORD-11 | low | Promotion edits skip the percentage and fixed-amount limits on a partial update; a deal's per-customer limit is not re-checked under the lock | `backend/src/validators/promotion.validator.ts:63-73` | reproduced live |
| ORD-12 | low | Customer cancel and kitchen reject restore stock in unsorted order and can deadlock with order placement | `backend/src/services/order-cancel.service.ts:62-90` | by code |

### Money logic

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| MON-1 | high | Refunds of money the kitchen collected are paid from Nuray's funds against an unsecured kitchen debt (confirm, then reject, repeat) | `backend/src/services/refund.service.ts:77-129` | by code |
| MON-2 | high | A disputed transfer is treated as unpaid: cancelling creates no refund and leaves no admin path to record or return the customer's money | `backend/src/services/refund.service.ts:64-65` | by code |
| MON-3 | high | A dismissed refund is deducted from what a kitchen owes even when the order still earns, so dismissing a refund creates money for the kitchen | `backend/src/services/seller-balance.service.ts:271-286` | reproduced live |
| MON-4 | medium | A partial refund after delivery is never recovered from the kitchen; a full refund takes its whole share | `backend/src/services/seller-balance.service.ts:246-256` | reproduced live |
| MON-5 | medium | Admin 'mark delivered' on a cash order with no rider records the cash as collected by nobody and pays the kitchen | `backend/src/services/admin-order.service.ts:383-428` | reproduced live |
| MON-6 | medium | The cash pause for a kitchen that owes Nuray is bypassed by switching an order to COD after placement, and never applied to transfers into the kitchen's account | `backend/src/services/payment.service.ts:89-100` | reproduced live |
| MON-7 | medium | A self-delivering kitchen can move its price into the delivery fee and pay almost no commission or GST | `backend/src/validators/seller.validator.ts:117-127` | by code |
| MON-8 | medium | Rider pay is computed independently of the delivery fee Nuray charges the kitchen; with default settings Nuray pays the rider more than it collects | `backend/src/utils/deliveryFee.ts:134-163` | by code |
| MON-9 | medium | A kitchen can close its account while it owes Nuray, or while Nuray owes it | `backend/src/services/account-deletion.service.ts:58-65` | by code |
| MON-10 | low | The platform ledger is not a double-entry ledger: GST and platform-funded discounts are never posted, and refunds, payouts, wallet and rider movements never reach it | `backend/src/services/ledger.service.ts:40-176` | reproduced live |
| MON-11 | low | Rider cash can only leave the books as a deposit: a shortage cannot be written off and the kitchens' shares stay blocked | `backend/src/services/seller-balance.service.ts:66-91` | by code |
| MON-12 | low | A customer can put a Safepay order into 'payment_submitted', where it is never swept and a cancel queues a full 'unconfirmed transfer' refund | `backend/src/services/order-payment.service.ts:138-140` | reproduced live |
| MON-13 | low | Two delivery paths and the wallet payment decide money from a read taken before the order row is locked | `backend/src/services/seller-order.service.ts:422-430` | by code |
| MON-14 | low | The bank aggregator path is half-wired: setting BANK_* starts payments that nothing can settle | `backend/src/services/payment.service.ts:114-144` | by code |

### Fulfilment logic

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| FUL-1 | high | Pre-orders: fulfilment ignores the delivery slot date (auto-cancelled after 30 min; rider dispatched the moment the kitchen accepts) | `backend/src/services/order-maintenance.service.ts:68-84` | reproduced live |
| FUL-2 | high | A rider job that is assigned but not worked never times out, and an admin has no way to take it back | `backend/src/services/dispatch.service.ts:75-144` | reproduced live |
| FUL-3 | medium | retryDelivery has no lock or compare-and-set: it can revive a cancelled (refunded, restocked) order and reset a live rider job | `backend/src/services/admin-order.service.ts:617-664` | reproduced live |
| FUL-5 | medium | Admin status changes write only orders.order_status: a self-delivery order set to 'ready' by an admin dead-ends in the kitchen UI, and other steps leave items and the rider job out of step | `backend/src/services/admin-order.service.ts:389-456` | partly |
| FUL-6 | medium | Retried deliveries: the new rider is sent to the kitchen while the failed rider still has the food; a refunded failed order can be retried into a job nobody can pick up | `backend/src/services/admin-order.service.ts:617-664` | partly |
| FUL-4 | low | Stale-order sweep can cancel an order the kitchen has just accepted or the customer has just paid (check and cancel are not tied together) | `backend/src/services/order-maintenance.service.ts:43-84` | by code |
| FUL-7 | low | Hub-stocked items: the rider is sent to the kitchen, not the hub; hub_pickup orders have no handover path at all | `backend/src/services/rider.service.ts:51-54` | by code |
| FUL-8 | low | Item-level status endpoint: one cancelled dish stops the order ever becoming 'ready' or 'preparing' | `backend/src/services/seller-order.service.ts:494-505` | reproduced live |
| FUL-9 | low | Rider move arrived_at_pickup -> in_transit skips the payment-confirmed check | `backend/src/utils/deliveryStatus.ts:16` | reproduced live |
| FUL-10 | low | A claim or auto-assignment racing a cancel leaves a cancelled job attached to a rider who is never told | `backend/src/services/delivery-lifecycle.service.ts:20-31` | by code |
| FUL-11 | low | Customer status notifications are deduplicated per order and status, so repeats after a retry are silently dropped | `backend/src/services/realtime-order.service.ts:139-150` | by code |
| FUL-12 | low | Customer cancel and kitchen reject restock in unsorted item order (deadlock against checkout) | `backend/src/services/order-cancel.service.ts:63-91` | by code |
| FUL-13 | low | Cancelling a failed delivery puts the cooked or dispatched units back into stock | `backend/src/services/admin-order.service.ts:531-569` | reproduced live |
| FUL-14 | low | No repair for a rider job that failed to be created after commit; two call sites let that failure turn a committed change into a 500 | `backend/src/services/seller-order.service.ts:593-596` | by code |

### Database

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| DB-1 | high | No backup tooling and no tested restore procedure for the production database | `docs/DEPLOYMENT_GUIDE.md:334-339` | by code |
| DB-2 | medium | Account closure ignores a kitchen's unsettled balance or debt, and a customer's pending refunds and in-flight payments | `backend/src/services/account-deletion.service.ts:42-63` | partly |
| DB-3 | medium | Personal data survives account deletion: home-kitchen pickup address and phone, customer bank-transfer details, address snapshots, session IPs | `backend/src/services/account-deletion.service.ts:70-112` | by code |
| DB-7 | medium | Kitchen daily order cap counts order lines instead of orders, and is checked outside the order transaction | `backend/src/services/availability.service.ts:286-305` | by code |
| DB-8 | medium | Financial history is protected only by application discipline: cascade deletes on wallet, payment, rider-ledger and refund rows; seller promo delete wipes usage records | `backend/prisma/schema.prisma:856 (RiderLedgerEntry->Rider Cascade)` | by code |
| DB-4 | low | Trend-score job rewrites every active product and seller row twice every 15 minutes inside one transaction (lock contention, deadlocks with checkout, index bloat) | `backend/src/services/ranking.service.ts:58-75` | partly |
| DB-5 | low | rider_ledger_entries.order_id has no index but is filtered on by the seller balance (seller dashboard, payouts, checkout cash check) | `backend/prisma/schema.prisma:844-864` | reproduced live |
| DB-6 | low | Registration is not atomic: the rider (and seller) row is created outside the user transaction, leaving a rider account that can never work | `backend/src/services/auth.service.ts:143-171 (user tx)` | by code |
| DB-9 | low | Deleting a product variant silently turns cart lines and order lines into the base product | `backend/prisma/schema.prisma:707 and 1195 (variant onDelete: SetNull)` | reproduced live |
| DB-10 | low | 'Today' and 'this month' in admin statistics, kitchen profit and loss, and dispatch fairness use the server's time zone, not Pakistan time | `backend/src/services/admin-order.service.ts:755-758` | by code |
| DB-11 | low | Unbounded reads that grow with history: all-time profit and loss, in-memory DISTINCT over a period's orders | `backend/src/services/profit-loss.service.ts:53-70` | by code |
| DB-12 | low | Database does not enforce the value sets and ranges the code assumes | `backend/prisma/migrations/0_baseline/migration.sql:1478-1482` | reproduced live |
| DB-13 | low | Notifications are never pruned | `backend/src/services/notification.service.ts:113` | by code |

### Frontend: customer

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| FEC-1 | high | Guest tray is lost when a new customer registers (no merge on sign-up, return path dropped) | `frontend-web/app/register/page.tsx:80-112` | by code |
| FEC-2 | high | Home tray drawer edits only the browser copy for signed-in customers, then links to a checkout that charges the server tray | `frontend-web/components/marketplace/SlideOverCartDrawer.tsx:28` | reproduced live |
| FEC-4 | medium | A payment that could not be confirmed is shown to the customer as paid | `backend/src/controllers/payment.controller.ts:88-102` | reproduced live |
| FEC-5 | medium | Transaction ID typed at checkout is saved as rider delivery instructions, not as a payment reference | `frontend-web/app/checkout/page.tsx:116` | by code |
| FEC-6 | medium | Kitchens directory, home and favourites take the first 50 kitchens platform-wide and filter by area in the browser | `frontend-web/app/kitchens/page.tsx:203-206` | reproduced live |
| FEC-7 | medium | Phone OTP sign-in and phone verification are always offered, with no way to know SMS is switched off | `frontend-web/app/login/page.tsx:304-320` | by code |
| FEC-11 | medium | Manual payment proof stores the kitchen's own account as the sender's account | `frontend-web/components/orders/ManualPaymentCard.tsx:176-181` | by code |
| FEC-3 | low | Checkout cannot be completed after a dish is repriced: PRICE_CHANGED handler never reloads the tray | `frontend-web/app/checkout/page.tsx:491-498` | by code |
| FEC-8 | low | Notifications page shows only the latest 20 and derives its counters from them | `frontend-web/app/notifications/page.tsx:58-66` | reproduced live |
| FEC-9 | low | Save address can be submitted twice, creating duplicate addresses | `frontend-web/app/profile/addresses/page.tsx:317-361` | by code |
| FEC-10 | low | Guests can mix kitchens in the tray from /dashboard; the extra kitchen's dishes are dropped silently at sign-in | `frontend-web/app/dashboard/page.tsx:168` | by code |
| FEC-12 | low | Dialogs have no focus management; several controls under 44px or unlabelled | `frontend-web/components/ui/ConfirmModal.tsx:40` | partly |
| FEC-13 | low | Pay / top-up buttons stay disabled after returning from the payment page with Back | `frontend-web/app/wallet/page.tsx:93-103` | not verifiable |

### Frontend: kitchen, rider, hub

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| FEK-1 | high | Kitchen dishes page loads only the 20 newest dishes and has no pagination | `frontend-web/app/sellers/products/page.tsx:113` | by code |
| FEK-2 | high | Dashboard open/closed switch leaves a permanent 'open' override that ignores opening hours | `frontend-web/app/sellers/dashboard/page.tsx:213-230 (handleToggleStore` | reproduced live |
| FEK-3 | high | Kitchen settings cannot clear the daily order cap, the store notice or the override end date; save reports success | `frontend-web/app/sellers/settings/page.tsx:606` | reproduced live |
| FEK-4 | medium | Self-delivery kitchens get made-up minimum order, free-delivery threshold and max distance written on any save | `frontend-web/app/sellers/settings/page.tsx:242-244 and 557-568` | partly |
| FEK-5 | medium | 'Closed/vacation until <date>' is stored as UTC midnight, so 'until today' does nothing and every date ends at 05:00 PKT | `frontend-web/app/sellers/settings/page.tsx:610-612` | partly |
| FEK-6 | medium | New-order alert does not catch up after a socket reconnect or token renewal | `frontend-web/components/SellerNewOrderNotification.tsx:211-250 (checke` | by code |
| FEK-7 | medium | New-order alert holds one order: a second order replaces the first, and a failed quick-accept silences the order for good | `frontend-web/components/SellerNewOrderNotification.tsx:185-203` | by code |
| FEK-8 | medium | Dashboard 'Coming to you' leaves out the kitchen's available balance | `frontend-web/app/sellers/dashboard/page.tsx:449 (formatPrice((overview` | by code |
| FEK-9 | medium | Editing a dish cannot remove the 'price before discount' or other optional fields; save reports success | `frontend-web/lib/product-form.ts:214-236 (productPayload)` | reproduced live |
| FEK-10 | medium | Suspended kitchen sees a normal dashboard with no notice, and the Earnings page fails outright | `frontend-web/app/sellers/dashboard/page.tsx:145-190` | by code |
| FEK-11 | low | Saving account details on the Settings page reloads and discards unsaved kitchen settings | `frontend-web/app/sellers/settings/page.tsx:315-328 (effect depends on ` | by code |
| FEK-12 | low | Reports: 'this month' equals the selected period on the 7-day view | `backend/src/services/seller.service.ts:878-900` | by code |
| FEK-13 | low | Rider earnings: background refresh collapses loaded history; 'Show older' can append the same page twice | `frontend-web/app/riders/earnings/page.tsx:58-71` | by code |
| FEK-14 | low | Rider dashboard: raw server error on a geofence race, over-long report notes rejected, approved applicant not refreshed | `frontend-web/app/riders/dashboard/page.tsx:404-438` | partly |
| FEK-15 | low | Smaller form defects: promotion double-submit, resubmitted application wipes food types, Delivery page drops dine-in | `frontend-web/app/sellers/promotions/page.tsx:225-234` | partly |

### Frontend: admin

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| FEA-1 | medium | Support-role staff get a menu and action buttons that mostly 403; rider and kitchen lookups promised by the role do not work at all | `frontend-web/components/layout/DashboardShell.tsx:77-113` | by code |
| FEA-2 | medium | Order detail returns the audit trail and finance ledgers to support staff who lack audit.read / read.finance | `backend/src/services/admin-order.service.ts:280-304` | by code |
| FEA-3 | medium | Kitchen payouts list shows only the first 20 rows with no paging | `frontend-web/app/admin/payouts/page.tsx:107-122` | by code |
| FEA-4 | medium | Rider settlement, payout and correction are recorded on a single click with no confirmation and no idempotency key | `frontend-web/app/admin/riders/[id]/page.tsx:109-121` | by code |
| FEA-5 | medium | Approvals 'Transfers to check or disputed' count does not match the list it links to | `backend/src/services/approvals.service.ts:44` | by code |
| FEA-7 | medium | Dashboard 'today' figures use the server's local midnight, not Pakistan's | `backend/src/services/admin-order.service.ts:979 (also 755-758)` | by code |
| FEA-6 | low | Staff role change and staff suspension fire immediately from a select / button with no confirmation | `frontend-web/app/admin/staff/page.tsx:178-190` | partly |
| FEA-8 | low | Analytics 'Commission earned' and 'Paid sales' do not follow the ledger's definitions | `backend/src/services/admin-order.service.ts:839-852` | by code |
| FEA-9 | low | Editing a category cannot clear its parent or product type, yet reports 'Category saved' | `frontend-web/app/admin/categories/page.tsx:87-93` | by code |
| FEA-10 | low | Delete-category confirmation promises behaviour the backend does not have | `frontend-web/app/admin/categories/page.tsx:413-418` | by code |
| FEA-11 | low | 'Refund the customer' is offered on paid orders that are still in flight, where the backend always refuses | `frontend-web/app/admin/orders/[id]/page.tsx:641-646` | by code |
| FEA-12 | low | Admin orders search only matches the order number although the API supports phone, email and name | `frontend-web/app/admin/orders/page.tsx:94-103` | reproduced live |
| FEA-13 | low | Staff two-step setup shows only a typed secret and an otpauth link, no QR code | `frontend-web/components/auth/StaffSecondStep.tsx:131-141` | by code |

### API contract and rate limits

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| API-1 | high | Staff permission checks are bypassed by changing the case of the URL or adding a trailing slash | `backend/src/utils/permissions.ts:56-84` | reproduced live |
| API-2 | medium | One shared 10-failures-per-15-minutes bucket per IP covers Google/Apple sign-in, password reset, phone verification and staff 2FA | `backend/src/middleware/rateLimiter.ts:67-70` | reproduced live |
| API-3 | medium | Registration is capped at 10 requests per hour per IP address, successful or not | `backend/src/middleware/rateLimiter.ts:293-297` | by code |
| API-4 | medium | POST /orders accepts an unbounded items array and runs sequential queries per line | `backend/src/validators/order.validator.ts:5-13` | reproduced live |
| API-8 | medium | File uploads use the client's default 30-second timeout with no client-side compression | `frontend-web/lib/api-client.ts:28` | by code |
| API-5 | low | /profit-loss endpoints: unvalidated dates give a 500, and the query loads every delivered item of all time with no limit or limiter | `backend/src/routes/profit-loss.routes.ts` | reproduced live |
| API-6 | low | Admin money-recording POSTs have no idempotency key; a retry after a timeout records the movement twice | `backend/src/routes/admin.routes.ts (POST /riders/:id/settlements` | by code |
| API-7 | low | scripts/api-checks never touch payments, refunds, payouts, rider money, uploads or the staff role matrix, and run with rate limits relaxed | `backend/scripts/api-checks/run-all.ts:13-29` | partly |
| API-9 | low | The web client never retries 429 or 503 and cannot read Retry-After | `frontend-web/lib/api-client.ts:57-98` | by code |
| API-10 | low | Two routers are mounted on /admin, so every admin request runs the auth chain twice; hub-manager assignment exists twice with different validation | `backend/src/index.ts:132` | reproduced live |
| API-11 | low | Inconsistent error bodies on a few handlers and on 404/429 | `backend/src/controllers/community.controller.ts:23-28` | partly |
| API-12 | low | Backend routes that no client calls remain exposed | `backend/src/routes/stock-alert.routes.ts` | by code |

### Reliability, ops, tests, quality

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| OPS-1 | high | Password-reset email is silently dropped on any SMTP failure: the retry sees its own token and exits | `backend/src/jobs/email.jobs.ts:31-58 (justSent check 40-44` | by code |
| OPS-3 | high | Published production frontend image tells search engines to index nothing (NEXT_PUBLIC_SITE_URL is never passed by docker-publish.yml) | `.github/workflows/docker-publish.yml (build-args block` | by code |
| OPS-2 | medium | No reconciliation with Safepay: a paid checkout whose return and webhook are both missed is cancelled with the customer charged | `backend/src/services/online-payment.service.ts:118-300 (settleAttempt ` | by code |
| OPS-4 | medium | Release images silently fall back to a localhost API and Safepay sandbox, and are published without waiting for CI | `.github/workflows/docker-publish.yml: `on: push: branches: [main]` | by code |
| OPS-5 | medium | No browser test of the purchase or fulfilment flow runs in CI: 9 of 20 Playwright specs are excluded, including every one that places an order | `.github/workflows/ci.yml:227 (explicit list of 11 specs)` | by code |
| OPS-6 | medium | Background failures never reach Sentry or any alert: scheduled jobs, queue jobs and webhook errors are log lines only | `backend/src/jobs/scheduler.ts:138-149 (catch -> logger.error only)` | by code |
| OPS-8 | medium | `npm run seed:e2e` has no production guard and creates active accounts with passwords published in the public repo | `backend/prisma/seed-e2e.ts:21-60` | by code |
| OPS-7 | low | Ledger catch-up job has head-of-line blocking: one order that cannot be posted stops every later order from being posted | `backend/src/services/ledger.service.ts:16-34` | partly |
| OPS-9 | low | Shutdown does not wait for running scheduled jobs; in-flight sweeps are cut after their transaction and before their follow-up work | `backend/src/index.ts:208-232 (stopScheduler() then prisma.$disconnect(` | by code |
| OPS-10 | low | SMS notification job retries permanent failures five times and can double-send on timeouts | `backend/src/services/sms.service.ts:50-63` | by code |

### Mobile shell

| ID | Severity | Finding | Where | Verified |
|---|---|---|---|---|
| MOB-1 | medium | Custom-scheme / app-link path is not validated: any web page or SMS link can make the app navigate its WebView off-site (to any allowNavigation host with the native bridge, or out to an arbitrary site) | `frontend-web/lib/native-shell.ts:69-93 (appPathFromUrl)` | partly |
| MOB-3 | medium | A phone keeps receiving the account's push notifications after its session is ended remotely, expires, or is logged out without an access token | `backend/src/controllers/auth.controller.ts:279-296 and 333-342` | reproduced live |
| MOB-4 | medium | Rider background location watcher is orphaned by any full page load: GPS and the foreground-service notification keep running after the last job ends | `frontend-web/lib/hooks/use-rider-location.ts:115-151` | by code |
| MOB-2 | low | Native bridge is reachable by third-party content: every *.getsafepay.com page and (Android legacy bridge) every frame of any origin | `mobile/capacitor.config.ts:22` | by code |
| MOB-5 | low | iOS archive and direct Gradle release builds have no gate against the placeholder/dev URL and cleartext | `mobile/package.json:8-15` | partly |
| MOB-6 | low | Android release build is unsigned, unminified and has a hard-coded versionCode | `mobile/android/app/build.gradle:20-21` | by code |
| MOB-7 | low | Background-location consent is stored per device, not per rider | `frontend-web/app/riders/dashboard/page.tsx:262-276` | by code |
