# Production Readiness Report

Date: 2026-11-07. Code: commit `7549e64` plus an uncommitted fix set (`git diff HEAD --stat`: 66 tracked files, +1,657 / −518, plus 20 new files: 16 tests, 2 frontend helpers, 2 load scripts). Nothing is committed or pushed.

Labels used below:
- **Live**: measured or reproduced against a running stack.
- **Test**: covered by an automated test only.
- **Code**: read in the source only, not exercised.

All load numbers come from one shared 8-core developer laptop (see C.5). They show direction and bottlenecks. They are not production capacity figures.

The older audit, [PRODUCTION_READINESS_AUDIT.md](PRODUCTION_READINESS_AUDIT.md) (2026-10-10), remains the record of the 140 findings fixed before this round.

---

## A. Executive summary

### Can it handle 10,000 concurrent users today?

**No.** No test passed at 10,000 concurrent users. These are the measured results, all on two API instances with 2 × 20 database connections, on one shared laptop:

| Load | Result (after this round's fixes) |
|---|---|
| 1,000 users, each signing in with a password | **Live:** 0 % errors, p95 252 ms. Six read endpoints were over the 300 ms p95 target, by up to 381 ms. |
| 3,000 users, each signing in with a password | **Live:** completed with 4.97 % errors (p95 4.8 s). Almost all errors were sign-ins turned away by design (503, "busy, retry"), and 1,119 of 3,000 users never got signed in. |
| 5,000 users who already have sessions (steady state) | **Live:** 17.6 % errors, p50 6.8 s, p95 18.8 s. The bottleneck is the database connection pool, not sign-in. |
| 10,000 users who already have sessions | **Live:** **failed**, 66 % errors and 0 orders placed. |
| 10,000 idle realtime sockets (2,000 riders on duty), one instance | **Live** (before fixes): every new job reached all 2,000 riders, fan-out p95 329 ms. Fan-out across several instances was **not** measured. |

The correctness results are strong. In every race test after the fixes (1,000 simultaneous orders, double checkout, accept against reject, 20 riders claiming one job) no duplicate orders, no negative stock and no orphan rider jobs appeared.

### Readiness score: 54 / 100

| Dimension | Weight | Score | Justification |
|---|---|---|---|
| Architecture | 15 | 11 | Clean layers. Shared state lives in Redis (rate limits, sockets, queue, job leases), so the API can run as several instances, and graceful shutdown works. Against that: image resizing and bcrypt run inside the API process, the realtime polling fallback needs sticky sessions that nothing configures, and uploads may use local disk in production. |
| Scalability | 20 | 7 | 1,000 users ran clean on 2 instances. 5,000 steady users gave 17.6 % errors and 10,000 gave 66 %. Each signed-in request still costs 2 auth database queries. Search, product counts and rider cash counts are the slowest statements. No public page can be cached by a CDN. |
| Database and concurrency | 15 | 11 | Every race test passed. Checkout is now idempotent by default, and the scheduler no longer deadlocks the connection pool. Still open: the ledger is posted after commit with no repair job, there are no CHECK constraints on statuses, and the seller dashboard reads a kitchen's whole history. |
| Security | 15 | 10 | Every role and ownership probe held (**Live**: 403/404 everywhere it should be). A per-account sign-in limit is added. Against that: tokens, including a 30-day refresh token, sit in `localStorage` and the page CSP only reports, there is one npm "high" advisory, and one JWT secret is used for everything. |
| Observability | 10 | 4 | JSON logs, request ids (now carried into jobs, the scheduler and socket handlers), order and payment event lines, and scrubbing of secrets at any depth. There are **no metrics, no alerts and no tracing**. |
| Reliability and operations | 15 | 5 | Health checks, graceful shutdown and a SIGKILL watchdog exist. But there is no production infrastructure, IaC or backups in the repo, the image-publish workflow defaults to a localhost API, and dev email sending fails (345 failed jobs). |
| Frontend | 10 | 6 | Polling now backs off when the socket is down, and reconnects are spread out. But every page is rendered per request with `no-store`, some pages fetch the same data twice, and each route ships 186–280 KB gzip of JS. |
| **Total** | **100** | **54** | Fit for a controlled launch at about 1,000 concurrent users on dedicated hosting, once the critical owner decisions (F) are made. Not fit for 10,000. |

---

## B. Architecture as built

### How a request moves

```
Browser / Capacitor app (same Next.js web app)
  |  axios + "Authorization: Bearer <access JWT>"  (tokens in localStorage)
  |  socket.io-client (one socket per tab, websocket then polling)
  v
Next.js :3000  -- renders pages (all dynamic), proxies /uploads /media /files to the API
  |
  v
Express API :3001  (one Node process per container; run N of them)
  helmet > compression > cors > requestId > pino-http > json(1mb) > files > /health
  > apiLimiter (Redis) > rejectUnsafeText > 27 routers
       authenticate: JWT verify + user lookup + session lookup (2 DB queries)
       per-route: zod validation, role/ownership checks, login admission (4 hashes + queue 50)
  > services (69) > Prisma (pool, default 10 connections) > PostgreSQL 15
  > errorHandler (Prisma pool/tx timeouts -> 503 SERVICE_BUSY + Retry-After)
       |                         |                               |
       v                         v                               v
   PostgreSQL               Redis                          Outbound
   orders, stock,           rate-limit counters            email (nodemailer), SMS (Twilio),
   ledger, sessions         Socket.IO adapter (pub/sub)    push (web-push/FCM/APNs),
                            BullMQ queue "nuray-jobs"      Safepay, S3 or local disk
                            scheduler job leases
  In each API process:
   Socket.IO server (JWT handshake; rooms user:, role:, order:, riders:on-duty)
   BullMQ worker (notifications: push/email/SMS, concurrency 5)
   12 scheduled jobs (Redis lease, max 2 at once per instance; Postgres-lock fallback if Redis errors)
```

Every request after sign-in pays for the two auth queries. Socket events tell pages that something changed, and the pages then re-fetch over HTTP. Pages also poll as a safety net: every 60 s while the socket is up, and with back-off from 30 s to 120 s while it is down.

### Order lifecycle: who changes what

| Step | Who | How it is kept safe (Code; races Live where noted) |
|---|---|---|
| Place order | Customer, `POST /orders` | One transaction: conditional stock decrement, promo lock, wallet debit. `Idempotency-Key` is now **required**; unique on (customer, key). Live race a/c. |
| Accept / reject | Kitchen | Accept is a conditional update (pending/confirmed only). The rider job is created under an order-row lock, so it cannot outlive a reject (Live race f1′). Reject locks the order, restocks and refunds. |
| Mark ready | Kitchen | Conditional update. |
| Assign rider | System dispatch (every 60 s and on events) or rider claim | Rider row lock, then `UPDATE ... WHERE rider_id IS NULL`. Exactly one winner (Live race e). |
| Pick up → in transit → at door → delivered | Rider | Order row lock. At the door the rider enters the customer's handover code. The rider ledger is posted in the same transaction; the platform ledger is posted **after** commit (DB-8, open). |
| Self-delivery / pickup | Kitchen | Kitchen moves ready → dispatched → delivered. An item step is now conditional on the item's previous status. |
| Cancel | Customer: pending only. Kitchen: reject or cancel an item. Admin: pending, confirmed, preparing, delivery_failed, and now **ready** when a platform rider is expected but none has claimed it yet. System: unpaid or unaccepted orders, every 2 min. | Each path claims the order with a conditional update or row lock, then cancels any open rider job. |
| Online payment | Safepay webhook or return | `payment_attempts` row lock; a repeat is answered `already_settled` (Live race g). |

---

## C. Load test results

Harness: `backend/scripts/load/ladder.ts`, a mixed journey. About 90 % of users are customers who browse, search, add to cart, check out (15 %) and track their order; about 7 % are kitchens that accept and mark ready; about 3 % are riders that claim and deliver. Production rate limits stayed on. Error % counts 5xx answers plus requests with no answer within 30 s. Targets: p95 under 300 ms for reads, 800 ms for placing an order, 1 s for sign-in.

### C.1 Ladder, before and after

| Users | Before fixes (password sign-in) | After fixes (password sign-in) | After fixes (existing sessions, 2 % sign in) |
|---|---|---|---|
| 500 | 0.00 % errors, p95 1,143 ms, p99 4,355 ms, 92 req/s | **0.00 %, p95 55 ms, p99 112 ms**, 97.7 req/s. Every target met. | not run |
| 1,000 | 0.16 %, p95 4,959 ms, p99 8,931 ms, 154 req/s | **0.00 %, p95 252 ms, p99 793 ms**, 188 req/s. Six read targets missed: search 559, rider pool 681, kitchen pending 503, listing 325, rider own jobs 311, tracking 302 ms. | not run |
| 3,000 | **Failed**: 22.4 %, p95 30 s, 19 orders placed | 4.97 %, p50 862 ms, p95 4,795 ms, 1,147 orders placed. 3,769 of 3,788 5xx were sign-ins turned away; 1,119 users never signed in. | not run |
| 5,000 | **Failed**: 90.5 %, 4,195 sign-ins failed | **Failed**: 33.4 %, nearly all fast sign-in 503s; 4,096 users never signed in | 17.59 %, p50 6,789 ms, **p95 18,773 ms**, 294 req/s. 16,433 × 503 SERVICE_BUSY from the database pool (cart add 10,367, search 3,204), 0 sign-in errors. |
| 10,000 | **Failed**: 99.1 % | not run (5,000 failed) | **Failed**: 66.37 %, p95 30 s, 0 orders placed |

Why the 3,000 "pass" is weak: users who cannot sign in stop sending traffic, so only about 1,900 of the 3,000 ran the journey.

Per endpoint, p95 in ms (password sign-in ladder):

| Endpoint | 500 before → after | 1,000 before → after |
|---|---|---|
| `GET /products` (listing) | 1,144 → 48 | 3,643 → 325 |
| `GET /products` (search) | 3,848 → 109 | 5,703 → 559 |
| `GET /orders/me` | 1,551 → 23 | 3,920 → 201 |
| `POST /orders` | 1,530 → 101 | 13,721 → 629 |
| `POST /seller/orders/:id/accept` | 710 → 48 | 9,340 → 523 |
| `GET /seller/orders?status=pending` | 1,962 → 36 | 10,454 → 503 |
| `POST /auth/login` | 1,439 → 119 | 3,385 → 125 |

What saturates at 5,000 steady users: the pool, which never had more than 31 of 40 connections active while PostgreSQL used at most about 1.4 cores. The slowest statements were the ranked search (498 long-running samples), the product listing `COUNT(*)` (208) and the per-rider cash-limit count (63). The API processes ran at 130–175 % CPU each. The likely mechanism is connections held by slow statements plus transactions waiting on a busy event loop. That mechanism is inferred, not isolated.

### C.2 Race tests

| # | Test | Before fixes | After fixes | Safe |
|---|---|---|---|---|
| a | 1,000 simultaneous orders, 1,000 customers, 10 dishes | 767 × 201 + 233 × 503. Same-key retries all succeeded; 0 duplicates. | **1,000 × 201, 0 × 503**, p95 4.3 s. 1,000 distinct numbers and keys, stock −100 per dish, never negative. | Yes |
| b | 50 orders for the last unit of a dish | 1 × 201, 49 × 400 INSUFFICIENT_STOCK; final stock 0 | not re-run | Yes |
| c | One customer checks out 10× in parallel | Same key: 1 order. **No key: 10 orders.** | No key: **10 × 400, 0 orders**. Same key: 1 order. | Yes (was No) |
| d | One kitchen on two devices accepts the same order 10× | 1 × 200 + 9 × 409; 1 history row, 1 job | not re-run | Yes |
| e | 20 riders claim the same job, 10 jobs | 1 rider per job | 1 delivery row and at most 1 rider per job (auto-assign won the race) | Yes |
| f1 | Cancel ×2 + accept ×2 + reject ×2, 20 orders | **1 of 20 left an orphan rider job** on a cancelled order | 20/20 consistent, 0 orphans | Yes (was No) |
| f1′ | Accept ×2 against reject ×2, 20 orders (aims at the f1 window) | not run | 20/20 consistent, 0 orphans. **7 runs hit the window** where both answered 200. | Yes |
| f2 | Ready ×3 against cancel the only item ×3, 20 orders | 20/20 consistent | not re-run | Yes |
| f3 | Rider "delivered" ×3 against "delivery failed" ×3 | 10/10 consistent ("failed" always wins, because the code check runs before the lock) | not re-run | Yes |
| g | Signed Safepay webhook ×10 (top-up, then order payment) | 1 paid, 9 already_settled; money credited once | not re-run | Yes |
| — | Scheduler at `connection_limit=4`, one instance, 90 s from boot | Audit repro: every job failed with P2024 once jobs ≥ pool size | **0 pool timeouts**, health 200 | Yes |

### C.3 Sign-in capacity (Live, `POST /auth/login` only)

| Setup | Sustained sign-ins/s | Successful sign-in p95 | Turned away (503) from |
|---|---|---|---|
| 1 instance | 46–49 | 0.2 s at 8 concurrent, 0.8 s at 32, 1.3 s at 64 | between 32 and 64 concurrent (44.5 % at 64) |
| 2 instances, same laptop | about 65 (host CPU-bound) | 0.7 s at 32, 1.2 s at 64 | between 64 and 128 concurrent |

bcrypt cost 10 with 4 hashes at a time gives about 47 sign-ins/s per instance. If all 10,000 users sign in at once, that is about 210 instance-seconds of hashing: about 3.5 min on 1 instance, or about 50 s on 4.

### C.4 Realtime sockets (Live, before fixes, one instance)

| Sockets | Riders on duty | Connect p95 | Job reached | Fan-out p95 |
|---|---|---|---|---|
| 2,000 | 400 | 194 ms | 400/400 | 125 ms |
| 5,000 | 999 | 208 ms | 999/999 | 406 ms |
| 10,000 | 2,000 | 419 ms | 2,000/2,000 | 329 ms |

### C.5 Environment caveats

- **Machine:** one macOS laptop with 8 cores and 16 GB, shared with a Blender render, a VM, an iOS simulator and other servers. 1-minute load average reached 74 at 5,000 steady users and 97 at 10,000 (330 during the first pass). The retest machine was quieter than the first pass, which flatters the 500 and 1,000 gains somewhat.
- **API:** 2 production-mode instances, `connection_limit=20` each (40 in total), Node 25.4 (the guide asks for Node 22). `UV_THREADPOOL_SIZE` was unset in the retest and set to 8 in the steady-state run.
- **Database:** local PostgreSQL 15.13 (`max_connections` 100, `shared_buffers` 128 MB, no PgBouncer), `frozennuray_load` seeded with 2,000 kitchens, 10,000 dishes, 5,000 customers, 300 riders and 50,000+ orders.
- Email went to a closed port and SMS was off. `RIDER_CASH_LIMIT` was raised for the races and the steady run, because the seeded riders are over the Rs 10,000 limit. In the password-sign-in ladders every rider claim was refused for cash, so the delivery leg was under-tested there.
- The generator was never the limit: at most 157 % of one core across 6 workers.
- Not measured: socket fan-out across instances, 10,000 users after the fixes with password sign-in, and dedicated hardware.

### C.6 How to rerun

Scripts and raw outputs are in the session scratchpad, outside the repo:
`/private/tmp/claude-501/-Users-apple-frozen-nuray--claude-worktrees-nostalgic-wu-748ddd/cf048536-6c05-4b15-8948-bef3ddfbcdfb/scratchpad/load/` (call it `$S`). It is a temp folder, so copy it somewhere permanent if you want to keep it.

```bash
createdb frozennuray_load
cd backend
DATABASE_URL=postgresql://apple@localhost:5432/frozennuray_load npx prisma migrate deploy
DATABASE_URL=postgresql://apple@localhost:5432/frozennuray_load NODE_ENV=production npm run load:seed
npx tsc --outDir $S/build --declaration false --declarationMap false --sourceMap false
$S/start-api.sh 3201 UV_THREADPOOL_SIZE=8 RIDER_CASH_LIMIT=1000000 &      # and again for 3202
$S/step.sh 1000 240 60 1                 # password sign-in ladder step: VUs, seconds, ramp, workers
$S/step3.sh 5000 240 90 4                # steady state: ladder.ts --sessions (2 % sign in)
API_URLS=http://localhost:3201/api/v1 npx ts-node --transpile-only scripts/load/login-capacity.ts --levels 1,2,4,8,16,32,64,96,128 --seconds 30
node $S/race2.cjs                        # race tests (race.cjs for the full a-g set)
NODE_ENV=production API_URL=http://localhost:3201/api/v1 npm run load:run -- sockets --sockets 10000 --duration 120 --ramp 40 --jobs-per-minute 12
```

---

## D. Issues found and fixed (uncommitted)

| ID | Sev | Issue | Fix | Verified how |
|---|---|---|---|---|
| ARCH-1 / DB-1 / F2 | High | Scheduler held a DB connection per job; 12 jobs firing together deadlocked a 10-connection pool (every job and request failed). | Redis lease per job (60 s, renewed). At most 2 jobs at once per instance. First run jittered 5–65 s. Postgres lock used only if Redis errors. 10-min run cap. | Live: boot with `connection_limit=4`, 0 pool timeouts in 90 s. Test: 8 scheduler tests. |
| DB-4 | Medium | Pool size not set; 6 default instances would exceed `max_connections` 100 | `connection_limit=10` added when the URL has none. Sizing formula in DEPLOYMENT_GUIDE. | Test |
| LOAD-3 | High | Sign-in storm took both instances down; SIGTERM ignored for over 2 min | Admission limit on password routes (4 hashes + queue 50, then 503 with Retry-After 2). Requests from clients that hung up are skipped. `UV_THREADPOOL_SIZE=8` in the image. Worker-thread SIGKILL at grace + 5 s. | Live: 0 unanswered requests at 5,000 (was thousands); exit on SIGTERM in about 5–10 s (idle, not under load). |
| AS-2 | Medium | No per-account sign-in limit for non-admins | 30 failures per account per 15 min across all IPs (hashed key). A 503 is not counted. Phone numbers are normalised. | Test |
| AS-14 | Low | `/auth/refresh` and `/auth/verify-email` had only the global limit | 100 per 15 min per account (or IP) and 30 per 15 min per IP | Test |
| LOAD-2 | High | Prisma `_count` aggregated whole tables on every order-list and dish-page call | Counts scoped to the page's ids on orders, dish page, seller dish list, public kitchen list, categories and communities | Live: `GET /orders/me` p95 3,920 → 201 ms at 1,000. Code + EXPLAIN: kitchen list 414.9 → 12.0 ms. Test. |
| LOAD-5 | Medium | Search scanned every dish; trigram indexes unused | Index-friendly prefilter, same results | EXPLAIN 48.7 → 6.5 ms (147 → 20 ms for "biryani"). Still the top slow statement at 5,000 steady users. |
| LOAD-6 | Medium | Every dish view updated the product row, colliding with stock locks | Views counted in memory, written every 30 s with `SKIP LOCKED`, flushed on shutdown | Test |
| DB-2 | High | Kitchen orders page walked the whole orders table (about 2 s at 500k orders) | Query driven from `order_items` (materialised); same for dashboard recent orders | EXPLAIN on 52k orders: 8.96 → 2.2 ms and 3.3 → 0.14 ms. Live: kitchen pending p95 10,454 → 503 ms at 1,000. 500k not re-measured. |
| DB-3 / LOAD-9 | High | Checkout without a key created duplicate orders; the web key was lost on reload | Key **required** (400 without it). Web key kept in sessionStorage for 10 min and kept after a 5xx or a lost response. | Live race c. Test. |
| LOAD-8 | Low | Accept racing reject left an orphan rider job | Rider job created under the order-row lock | Live race f1′: 7 window hits, 0 orphans |
| Review | Medium | New admin "cancel ready" could be undone by a stale kitchen item step, then credited as delivered | Admin may cancel a ready order only when a platform rider is expected. Item steps are conditional on the prior status. A cancelled order gets no ledger credit. | Test |
| ARCH-2 | Medium | A ready order with no rider could not be cancelled by anyone | Admin cancel of ready (409 RIDER_ASSIGNED once a rider has it). Ops snapshot counts ready orders with no rider after 20 min. | Test |
| DB-7 | Medium | Admin "mark delivered" ran in separate steps | One transaction (platform ledger still after commit, see DB-8) | Test |
| DB-10 | Low | Admin-cancel restock order could deadlock with placement | Sorted like placement (customer cancel and kitchen reject not yet) | Test |
| ARCH-10 / F8 | Medium | Failed jobs invisible | Queue counts in the 5-min ops snapshot and on admin `/health`; warning when failures grow | Test |
| OBS-10 | Low | `/health` public, unthrottled, showed gateway config, hit the DB on every call | Probes cached 1 s. Gateway, job and version detail for admins only (cheap token pre-check, 500 ms cap). | Test |
| F1 | High | A DB blip during socket handshake killed realtime for that tab for up to 1 h | Retryable handshake error; client retries with jittered back-off | Test |
| F3 / FP-06 | High | Reconnect storm on every deploy | Reconnect 3 s doubling to 30 s ±50 %. Catch-up reload spread over 0–5 s. Refocus reload skipped if the last reload was under 15 s ago. | Test (not load-measured) |
| FP-01 / F5 (part) | High | Polling ran 4–6× faster when the socket was down | Offline poll backs off 30 → 60 → 120 s ±20 %; chat 15 then 30 s (was 5 s) | Test |
| F4 | High | Admin tabs received every rider location; the dashboard reloaded up to 4×/s | Tracking goes to the customer only; admin dashboard and approvals reload at most every 30 s | Test |
| F13 (part) | Low | 1 MB socket frames accepted | 16 KB cap | Test |
| F15 | Low | A DB blip after commit could turn a committed change into a 500 | Status emitters never throw | Test |
| OBS-4 / AS-12 | Medium | Request logs kept signed file links and Safepay signatures | Sensitive query values redacted | Test + local request |
| OBS-5 | Medium | Secrets at top level or deeply nested were not redacted | Secret keys scrubbed at any depth | Test |
| OBS-7 / OBS-11 / OBS-14 | Low–Med | 5xx logged twice; any client-set request id trusted; audit action cardinality | One error line per 5xx. Request ids must be 16–64 safe chars. Unmatched admin routes logged as `unmatched`. | Test |
| OBS-3 | High | No order or payment event lines | `logEvent` for order, delivery, refund and payment steps (ids only, no PII) | Test |
| OBS-2 (part) | High | Request id lost in jobs, scheduler and socket handlers | Carried into BullMQ jobs, scheduler runs and socket handlers | Test |
| Load-steady | Low | DB timeout in kitchen guards answered 403 ("not allowed") instead of 503 | `blockSuspendedSeller` and `requireSeller` pass DB errors to the error handler (503). `requireSeller` was fixed by hand. | Test for `blockSuspendedSeller` (P2024 → 503). `requireSeller`: test (P2024 passed on, not 403). |
| Misc | Low | Blocked storage threw after a successful checkout | Wrapped in try/catch | Code |
| DB-5 (part) | Medium | Kitchen analytics loaded full rows | Narrow `select` | Code |

Docs updated to match: `DEPLOYMENT_GUIDE.md`, `OPERATIONS_AND_LOGGING.md`, `REALTIME_ORDER_MANAGEMENT.md`, `LOAD_TESTING.md`, `backend/.env.example`.

---

## E. Issues found and NOT fixed

Effort: S = under a day, M = 1–3 days, L = a week or more.

### Critical

| ID | Issue | Recommended fix | Effort |
|---|---|---|---|
| LOAD-1 | 10,000 concurrent users not shown; 5,000 steady users give 17.6 % errors | Roadmap G | L |

### High

| ID | Issue | Recommended fix | Effort |
|---|---|---|---|
| LOAD-4 / AS-4 / ARCH-3 | 2 auth queries on every signed-in request and socket handshake | Cache user status and session state in Redis for 30–60 s; clear it on sign-out, suspension and role change | M |
| LOAD-5 rest, LOAD-7, listing count | Slowest statements at 5,000: search, product `COUNT(*)`, per-rider cash count. The rider pool list is unbounded (107 KB per call at 1,227 open jobs). | Cache popular searches and counts; nearest-N rider pool with paging; cache per-rider cash totals | M |
| AS-1 | Tokens in `localStorage`; CSP report-only with `unsafe-inline` (see F) | HttpOnly refresh cookie + in-memory access token; enforce CSP with a hash | M |
| OBS-1 / OBS-8 | No metrics endpoint, no alerts | prom-client (needs approval) + alert rules (drafted in the observability audit) | M |
| ARCH-6 / DB-13 | No IaC, load balancer config, PgBouncer or backups/PITR | See F and G | L |
| FP-02 | Every page dynamic and `no-store`; HTML cannot be cached by a CDN (one process: 88 req/s on `/`) | Stop reading cookies in the root layout; make catalogue pages static/ISR; add a CDN | M |

### Medium

| ID | Issue | Recommended fix | Effort |
|---|---|---|---|
| DB-2 rest | No `seller_id` on orders | Migration + `(seller_id, order_status, created_at)` index | M |
| DB-8 | Platform ledger posted after commit; a failure is only logged | Post inside the delivery transaction, or a backfill job | S |
| DB-5 rest | Kitchen dashboard, balance and profit-loss read the whole history | Running balance; bound profit-loss to 90 days | M |
| DB-6 | Popular kitchen with a deal serialises checkouts on one promotions row | Lock promotions first; skip the lock for deals with no limit; move `total_orders` out | S |
| DB-9 / F6 | Dispatch reloads every on-duty rider for each of up to 50 jobs a minute | Load riders once per sweep; bounding-box prefilter | M |
| F7 | Notification enqueue on the checkout path; a hung Redis adds 3 s per enqueue | One `order.notify` job or an outbox row | M |
| F9 | Worker concurrency 5, SMTP not pooled, Gmail daily quota | Transactional email provider; a queue per channel | S |
| F10 | OTP SMS sent inline, up to 30 s | 5 s timeout, then a queued retry; circuit breaker | S |
| F11 / FP-11 | Geocoding uses public Nominatim (about 1 req/s per web instance); map tiles use OSM | Paid geocoder and tile provider in production config | S |
| F12 | Redis outage: socket adapter buffers emits without bound | Bound the offline queue; alert on Redis down | S |
| AS-5 | `TRUST_PROXY` wrong behind CDN + LB puts all users in one IP bucket | Make it a required production variable | S |
| ARCH-4 | Image resize (sharp) and up to 32 MB of uploads per request in the API process | Direct-to-S3 uploads and resize in a job | M |
| OBS-2 rest | No request id on outgoing Safepay/FCM calls, socket emits or audit rows | Header, payload meta, `audit_logs.request_id` column | S |
| OBS-6 | Non-admin sign-ins (success and failure) not recorded | `auth.login` / `auth.login_failed` events with IP | S |
| OBS-9 | Job, scheduler and ledger failures not sent to Sentry | `reportError` in those catch blocks; last-success gauge | S |
| OBS-12 | Most 503s log only "SERVICE_BUSY", not the Prisma code; no slow-query log | Log the original code; Prisma query events over 500 ms | S |
| FP-03 / 04 / 05 / 08 | Duplicate fetches: `/auth/me` twice, home feed twice, storefront twice; kitchen list reloaded on every event. **The home page drops kitchens beyond 50 (correctness).** | Single auth init; wait for store hydration; filter by area on the server; skip the client fetch when SSR data exists | M |
| FP-07 | API client: 30 s timeout, no retry, `Retry-After` ignored | 10 s for GETs, jittered retry, honour 429/503 | S |
| FP-09 | Media proxied through Next; brand icons `max-age=0` | S3 + CDN; cache headers | S |
| Scheduler review | With 2 job slots, two slow jobs can delay the 60 s dispatch sweep. A Redis outage longer than a run lets a second instance start it. | Exempt short sweeps, or raise the cap | S |

### Low

| ID | Issue | Effort |
|---|---|---|
| AS-6 / AS-7 / AS-8 | Refresh reuse within 30 s mints a parallel pair; reuse revoke does not close sockets; `refresh_tokens` grows (74,991 rows in the load DB) | S each |
| AS-11 / AS-13 / AS-15 | Phone number in the JWT; one secret for JWT and TOTP sealing; `STAFF_2FA_REQUIRED=false` not refused in production | S each |
| AS-14 rest | `/2fa` bodies have no zod schema | S |
| DB-10 rest | Customer cancel and kitchen reject restock unsorted (possible deadlock → 503) | S |
| DB-11 / DB-12 / DB-14 | No CHECK constraints on statuses or quantity; 12 foreign keys without an index; admin analytics loads id lists to count them | S–M |
| F13 rest / F14 / F16 / F17 | No per-user socket cap; navbar badge and new-order popup do not catch up after a reconnect; retries can duplicate SMS/email; polling transport needs sticky sessions | S each |
| ARCH-7 / ARCH-8 / ARCH-11 | Sticky sessions; per-instance pricing cache (60 s); local-disk uploads allowed in production | S each |
| FP-10 / 12 / 13 / 14 | 186–280 KB gzip JS per route; toast context re-renders; some lists capped or unpaged (101st active order hidden); local `next` 16.3.8 against a lockfile pinning 16.4.2 | S–M |
| Misc review | Remaining `_count` uses on admin pages; `auditDenied` writes the raw path; old log lines still print full Safepay trackers; `app/dashboard/page.tsx` reads sessionStorage without try/catch; admin-cancel rule copied from the rider service; staggered socket disconnect on shutdown not done; `scripts/api-checks/views.ts` not run against a live server | S each |

---

## F. Items needing the owner's decision

Critical items first.

| # | Decision | Context |
|---|---|---|
| 1 | **Tokens in `localStorage` + report-only CSP (AS-1)** | One XSS could read every visitor's 30-day refresh token. Fixing it means moving to an HttpOnly cookie, which touches web, native and API, plus `CSP_ENFORCE=true` with a hash for the one inline script. Decide before launch. |
| 2 | **No production infrastructure, IaC or backups** | Nothing in the repo provisions the load balancer, PgBouncer, Redis, S3, migrations or backups/PITR. Choose the hosting and who owns it. |
| 3 | **`POST /orders` now requires `Idempotency-Key`** | The web app sends it. Any older native build or outside client that does not will get 400 and cannot order. Confirm no such build is live, or add a grace period. |
| 4 | **Publish workflow defaults to a localhost API + sandbox payments** | `docker-publish.yml` falls back to `http://localhost:3001` and Safepay sandbox when repo variables are empty, including on `v*` release tags. Make it fail instead. |
| 5 | **Nothing is committed** | 66 tracked files changed plus 20 new files, on branch `claude/latest-folder-review-324fac`. Rename the branch (`fix/` or `feat/`) before any PR. Four edited e2e specs that write to the DB were not run. |
| 6 | **Metrics and tracing need new dependencies** | `prom-client` is not installed (`/metrics` 404) and OpenTelemetry is not installed. Approve adding them, or accept a hand-written metrics module. Without metrics, a dedicated-hardware load test is hard to read. |
| 7 | **npm audit: 1 high (follow-redirects)** | Backend and web, through axios. A lockfile-only bump of `follow-redirects` and `@sentry/node` needs dependency approval. |
| 8 | **Dev email config is failing** | 345 failed jobs in local Redis (307 notifications, 36 verification emails), all "Failed to send email". For production, Gmail's daily quota would be exceeded within hours at 10,000 users. Choose a transactional provider. |
| 9 | **30 failed sign-ins per 15 min lock an account's password/OTP sign-in** | This stops credential stuffing, but a stranger can lock a victim out for 15 min (Google, Apple and password reset still work). It also lowers the admin cross-IP ceiling from 50 to 30. Confirm 30, or choose a verify-by-email step. |
| 10 | **Admin can now cancel a `ready` order** | Only when a platform rider is expected and none has claimed it (409 once a rider has it). Self-pickup and kitchen-delivered ready orders stay refused. Confirm the rule. |
| 11 | **Scheduler uses a Redis lease, with a Postgres-lock fallback** | If Redis errors, the old Postgres lock is used (it holds one connection per job, the old deadlock risk, accepted only during an outage). `SCHEDULER_CONCURRENCY=2` can delay the 60 s dispatch sweep behind two slow jobs. |
| 12 | **`UV_THREADPOOL_SIZE=8` assumes an 8-core host** | Only the test laptop has 8 cores. Set it to the real instance core count. Sign-in capacity is set by `PASSWORD_HASH_CONCURRENCY` (4), not the thread pool. |
| 13 | **Checkout key window: 10 minutes** | A retry within 10 min of a lost response returns the same order (no duplicate). After 10 min, the same cart gets a new key, so a retry could place a second order. |
| 14 | **Polling and admin timings** | While the socket is down, pages poll at 30 s backing off to 120 s (was a fixed 15 s), the rider dashboard sees new jobs up to 120 s late, and chat polls at 15 then 30 s (was 5 s). Admin dashboard and approvals reload at most every 30 s. Confirm these delays are acceptable. |
| 15 | **Order number width** | `FN` + date + 6 random digits = 1,000,000 numbers a day, with 5 retries. Fine up to about 50k orders a day. Widening to 8 digits makes numbers 18 characters. Check receipts, SMS templates and support tools first. The date uses server local time, not PKT. |
| 16 | **Register reveals whether an email or phone exists (AS-10)** | Deliberate (the app signs the user in at once), limited to 5 probes per hour per IP. Accept it, or design a "check your email" sign-up. |
| 17 | **Event names for dashboards** | `order.placed/accepted/ready/picked_up/delivered/cancelled/...`, `delivery.claimed`, `refund.issued/completed/dismissed`, `payment.succeeded/duplicate_*/failed`. Agree them before anyone builds on them. Also: SERVICE_BUSY 503s are logged at error level and will count toward error-rate alerts. |
| 18 | **Earlier open items** | Rider fee of Rs 20,598 on two orders (old Lahore kitchen pin; the delivery-fee corridor has no cap). Demo rider at the cash limit (Rs 9,879 of 10,000), so ready COD test orders cannot be delivered until an admin settles cash. Server notification texts are English-only in Urdu. |
| 19 | **Leftovers on this machine** | DB `frozennuray_load` (380 MB at seed, 429 MB now): drop it with `dropdb frozennuray_load` when done. Test order `FN20261107820687` sits at `ready` in `frozennuray_run`. Probe customer, seller and rider accounts from the security audit are in the dev DB. Token and secret files are in the scratchpad (`authsec/`, `load/race-tokens.json`, `load/race2-tokens.json`, `load/secrets.env`); delete them. |

---

## G. Roadmap to 10,000 concurrent users

In order. The effects are estimates from the measurements above, not measured results.

| # | Step | Expected effect |
|---|---|---|
| 1 | **Redis auth/session cache** (LOAD-4) | Removes 2 DB queries from every signed-in request. At 1,500 req/s that is about 3,000 queries/s off the pool. |
| 2 | **Fix the remaining slow statements**: cache search results and the product listing count; bounded nearest-N rider pool; cached per-rider cash total (LOAD-5, LOAD-7) | These were the top long-running statements holding connections at 5,000 users. |
| 3 | **PgBouncer (transaction mode) + more API instances** | The code is already PgBouncer-safe. Size to `instances × connection_limit + 10 ≤ max_connections`. 4 instances give about 190 sign-ins/s, so a full 10,000-user re-login takes about 50 s. |
| 4 | **`seller_id` on orders** + running kitchen balance (DB-2, DB-5) | Kitchen screens stop scaling with total platform history. |
| 5 | **CDN-cacheable public pages and media** (FP-02, FP-09) | Home, kitchen and dish pages served from the edge instead of 88–158 renders/s per Node process. |
| 6 | **Metrics + alerts** (OBS-1, OBS-8) | Lets you see the pool, event loop, queue depth and p95 per route during the test and in production. |
| 7 | **IaC**: LB with `/health/ready` checks and websocket-only or sticky sessions, `TRUST_PROXY`, Redis, PgBouncer, S3, migration job, backups/PITR | A repeatable production and staging environment. |
| 8 | **Load test on dedicated hardware**: separate generator machine, managed Postgres, ≥ 3 API instances, steady state with sessions + 2 % sign-ins, ladder 1k → 3k → 5k → 10k, plus cross-instance sockets | The only way to claim a capacity number. Pass: under 1 % 5xx and p95 targets met (300 ms reads, 800 ms order, 1 s sign-in). |

---

## H. Verification evidence

Final suite results on the fix set:

| Suite | Command | Result |
|---|---|---|
| Backend typecheck | `cd backend && npx tsc --noEmit` | clean |
| Backend scripts typecheck | `npx tsc -p tsconfig.scripts.json --noEmit` | clean |
| Backend lint | `npx eslint src --max-warnings 0` | 0 problems |
| Backend unit/integration | `npx jest` | **125/125 suites, 1,162/1,162 tests** |
| Frontend typecheck | `cd frontend-web && npx tsc --noEmit` | clean |
| Frontend unit | `npm test` | **205/205** |
| Frontend lint | `npm run lint` | 0 errors (115 warnings, all already in HEAD) |
| Mobile | `cd mobile && npm test` | **10/10** |
| CI e2e (Playwright, chromium + mobile) | CI spec list | **73 passed, 11 failed.** All 11 are environment failures, not caused by this change: the 9 known ones (csp × 7, native-shell Google × 2), plus 2 where specs run `psql` against `frozennuray_dev` (account-closure, native-shell push). 4 edited e2e specs that write to the DB (purchase, buyer-complete-spec-audit, customer-all-tabs, seller-complete-flow) were **not run**. |

Raw evidence (session scratchpad, a temp folder: copy it to keep it). `$R` = `/private/tmp/claude-501/-Users-apple-frozen-nuray--claude-worktrees-nostalgic-wu-748ddd/cf048536-6c05-4b15-8948-bef3ddfbcdfb/scratchpad`:

| What | Where |
|---|---|
| Audits | `$R/readiness/{architecture,database,auth-security,observability,realtime-jobs,frontend-perf}.md` |
| Load baseline / retest / steady state | `$R/readiness/load.md`, `load-retest.md`, `load-steady.md` |
| Raw load output | `$R/load/logs/` (baseline), `logs2/` (retest), `logs3/` (steady state and sign-in capacity), `race-results.txt`, `race-retest-results.txt` |
| Load harness in the repo (untracked) | `backend/scripts/load/ladder.ts`, `backend/scripts/load/login-capacity.ts` |
