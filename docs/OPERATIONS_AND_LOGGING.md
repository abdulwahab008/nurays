# Operations and logging

What Nuray records, what you must keep, for how long, what to alert on, and what to set up on your infrastructure.
Written from a DevOps and log-analysis audit of the code. Companion to `DEPLOYMENT_GUIDE.md` (setup) and
`SECURITY_AND_COMPLIANCE.md` (audit log and access).

## 1. The five kinds of record

| Kind | Where it lives | Answers | Keep |
|---|---|---|---|
| **Application log** | stdout, one JSON line each (pino) | "What did the server do and fail at?" | 30 days hot, 90 days cheap storage |
| **Audit trail** | `audit_logs` table (append-only, trigger blocks edit and delete) | "Who changed what, when, from where?" | **2 years**, then deleted by the daily retention job (see 5) |
| **Business ledger** | `ledger_entries`, `order_status_history`, `refunds`, `seller_payouts`, rider ledger, `payment_attempts` | "Where did every rupee go; what happened to this order?" | **7 years** (accounting and tax) |
| **Error tracking** | Sentry (set `SENTRY_DSN`) | "What crashed, how often, since which release?" | Per plan, 90 days |
| **Infrastructure** | Your host and load balancer, Postgres, Redis | "Was it up, was it slow, was disk full?" | 30 to 90 days |

The audit trail and the ledger are **business records**: they live in the database, are backed up with it, and are
never the same thing as the application log.

## 2. What is recorded today

**Application log** (`utils/logger.ts`, `middleware/requestContext.ts`)
- One line per request: method, URL, status, duration, `requestId`, `userId`. Health checks are skipped. The URL keeps
  the query string's keys, but the value of any key whose name contains `sig`, `token`, `secret`, `password`, `otp`,
  `code`, `tracker`, `key`, `phone` or `email` is written as `[redacted]` (signed file links, the Safepay return,
  tokens, people). 4xx and **requests slower than 2 s** (`SLOW_REQUEST_MS`) are `warn` with `"slow": true`.
- A 5xx counts once at `error`. An unexpected failure is logged by the error handler (`Request failed`, with the
  stack in `err`, and sent to Sentry); its request line is then a `warn` without the error. An expected one (an
  `AppError` marked expected, such as `503 SERVICE_BUSY`) gets a `warn` from the error handler and its request line is
  the `error`. Client mistakes (4xx) are a `warn` from the error handler with `errorCode` and `status`.
- The same `requestId` is returned to the client in `X-Request-Id` and in error responses, so a customer's
  screenshot leads straight to the log lines. An incoming `X-Request-Id` is kept only when it is 16 to 64 letters,
  digits, `-` or `_` (a UUID, nginx's `$request_id`); anything else gets a fresh id.
- Secrets are scrubbed from every line at any depth by key name (`password`, `newPassword`, `currentPassword`,
  `token`, `accessToken`, `refreshToken`, `access_token`, `refresh_token`, `authorization`, `cookie`, `otp`, `otpCode`,
  `otpCodeOrPassword`, `deliveryOtp`, `handoverCode`, `code`, `sig`, `signature`, `secret`, `cardNumber`, `cvv`, in any
  case), and the `Authorization` header of an HTTP client's error is redacted. Email addresses and phone numbers in
  messages are masked.
- Work outside a request has an id in the same `requestId` field, so all its lines can be found together: a queued
  background job (BullMQ) carries the id of the request that queued it (stored in the job's data as `_requestId` and
  restored in the worker, including on its `Job failed` lines; a job queued outside a request gets
  `job:<name>:<jobId>`), each scheduled-job run gets `sched:<name>:<uuid>`, and each Socket.IO client event gets
  `socket:<uuid>`.
- Everything the server says goes through the logger (the source has no `console` calls, and ESLint warns on one), so
  every line has a level, a time and the request id, and carries the error (`err`) and the ids (`orderId`, `job`,
  `redis`...) as fields. Live-socket traffic (connect, join or leave an order room, disconnect) is `debug`, so it does
  not fill the log: set `LOG_LEVEL=debug` to see it. A denied order-room join is a `warn`.
- Scheduled jobs: failures are logged as `Job <name> failed` with the error and `durationMs`; every run also writes
  `Job <name> finished` at `debug` (`ran: false` when another instance held the job's lease or this instance's previous run was still going). Queued jobs log
  `Job failed; will retry` or `Job failed; giving up` with the attempt count. Dispatch logs every automatic
  assignment (delivery, order, rider, reason, number of candidates).
- **Domain events** (`logEvent` in `utils/logger.ts`): one `info` line per business event, with `event` set to its
  name (also the message) and ids as fields (for orders, deliveries and refunds `orderId`, `orderNumber`, `actor`, and
  where it applies `sellerId`, `riderId`, `deliveryId`, `refundId`, `amountMinor` in paisa; payment events carry
  `via` and, except `payment.failed`, `attemptId`, `orderId`, `purpose` and `amountMinor`). Chart and alert on `event`:
  - orders: `order.placed`, `order.accepted`, `order.rejected`, `order.ready`, `order.picked_up`, `order.delivered`,
    `order.delivery_failed`, `order.cancelled`, `order.item_cancelled`, `order.delivery_retried`, and
    `order.<status>` for any other status a kitchen's item change or an admin's status change moves the order to;
  - deliveries: `delivery.claimed`, and `delivery.<status>` for a rider's other steps (`delivery.arrived_at_pickup`,
    `delivery.in_transit`, `delivery.arrived_at_customer`);
  - payments: `payment.succeeded`, `payment.duplicate_credited`, `payment.duplicate_ignored`, and `payment.failed`
    with `via` (`return` or `webhook`) and `reason` (`invalid_signature`, `missing_tracker`, `settle_error`);
  - refunds: `refund.issued`, `refund.completed`, `refund.dismissed`.
- **Operations snapshot** every 5 minutes (`metric: "ops_snapshot"`): open deliveries nobody has taken and how long
  the oldest has waited, active deliveries, riders on duty, orders and cancellations in the last hour, expired
  payments, pending approvals, refunds, payouts and complaints, ready orders no rider has taken for 20 minutes
  (`readyNoRiderStuck`, `oldestReadyNoRiderMinutes`) and the job queue (`jobsWaiting`, `jobsActive`, `jobsDelayed`,
  `jobsFailed`; `null` without Redis). When `jobsFailed` has grown since the previous snapshot of that instance, a
  `warn` line with `metric: "jobs_failed"` and `newlyFailed` follows. This is what you chart and alert on.

**Audit trail** (`audit_logs`)
- Every admin write (done or refused), every refused attempt at the admin area, admin and customer sign-ins, failed
  and locked sign-ins, logouts, audit exports, **password resets** and **kitchen payout requests**.
- Fields: who, action, record, the fields sent (secrets redacted, free text cut to its first 200 characters), IP,
  browser, result. Reads are not logged.

**Business records**: order status history, ledger entries for every money movement, refunds, payouts, payment
attempts, rider cash and settlements, notifications sent.

## 3. What you must save (checklist)

Must keep, with the reason:

1. **Every money movement** and who authorised it (ledger plus audit trail): disputes, tax, fraud.
2. **Order lifecycle with timestamps** (status history, handover PIN verified, rider assignment and why): complaints
   and rider disputes.
3. **All admin and staff actions**, including refused ones: accountability, insider risk.
4. **Authentication events**: logins, failures, lockouts, password resets, role changes: account takeover forensics.
5. **Payment gateway events**: the webhook outcome per checkout (paid, duplicate, expired, bad signature): money
   reconciliation with Safepay.
6. **Application errors with request ids**: fastest route from a complaint to a fix.
7. **Business gauges** (the 5-minute snapshot): trends and capacity planning.
8. **Deploy markers**: set `SENTRY_RELEASE` to the git SHA so every error is tied to a release.

Must **never** be written to a log: passwords, JWTs, refresh tokens, OTPs, handover codes, card or account numbers,
CNIC numbers or document contents, full phone numbers and emails, request bodies, receipt images. The code already
enforces this for the above; keep it that way in new code (log ids, not people).

## 4. What to alert on

| Alert | Source | Suggested threshold | Why |
|---|---|---|---|
| API down | `/api/v1/health/ready` | 2 failures in 1 min | outage |
| Error rate | log `level>=50` | more than 5 in 5 min | regression |
| Slow requests | log `slow:true` | more than 20 in 5 min | database or dependency trouble |
| Orders waiting for a rider | `ops_snapshot.oldestOpenDeliveryMinutes` | above 15 | customers waiting, food cooling |
| No riders on duty | `ridersOnDuty` = 0 with `ordersLastHour` > 0 | 10 min | nobody can deliver |
| Payments failing | `paymentsFailedLastHour`, `event: "payment.failed"` (`reason: "invalid_signature"`) | any spike or any bad signature | gateway or attack |
| Ready orders with no rider | `ops_snapshot.readyNoRiderStuck` | above 0 | food waiting at the kitchen; an admin can cancel it |
| Sign-in attacks | audit `auth:LOGIN_FAILED` / `LOGIN_LOCKED` | 20 failures in 5 min from one IP | credential stuffing |
| Staff misuse | audit rows with `responseStatus` 403 on `admin:` actions | any burst | probing |
| Money backlog | `pendingRefunds`, `pendingPayouts` | above 24 h old | unhappy customers and kitchens |
| Approvals backlog | `pendingApprovals` | above 24 h | kitchens waiting to sell |
| Job failures | `Job <name> failed`, `Job failed; giving up`, `metric: "jobs_failed"` | any | stuck sweeps (stale orders, dispatch, ranking) or lost emails and notifications |
| Sign-in overload | `errorCode: "SERVICE_BUSY"` on `/auth/` routes | a burst | password hashing is at `PASSWORD_HASH_CONCURRENCY` plus its queue (see `DEPLOYMENT_GUIDE.md`) |
| Rate limits not counted | warning `Rate limits are not being counted` (at most one a minute, with `requestsSinceLastReport`) | any | Redis is down or not answering: requests are let through unlimited |
| Disk, CPU, memory, DB connections | host | 80 percent | capacity |
| Backup missing | host | no success in 25 h | recovery |

## 5. Retention and the audit trail

- `audit_logs` is kept for **two years** (decided 26 October 2026). It stays append-only: no row can be edited, and a
  row younger than two years cannot be deleted by anyone, because the database trigger checks the age itself. The one
  way out is the daily `audit-retention` job (`services/audit-retention.service.ts`), which deletes rows older than two
  years. To keep older history anyway (an open dispute, say), export those months with the admin CSV export first.
- Delete or archive application logs on your collector's schedule (section 1), not in the app.
- OTP and password-reset secrets are already purged after 24 hours by the app. Read notifications older than 90 days
  can be pruned by a DBA when the table grows.
- If you operate under data-protection rules, state these periods in your privacy policy and delete personal data
  on request except where the ledger must be kept.

## 6. Infrastructure audit: what is in place and what you must add

**In place**: non-root containers, health checks, readiness and liveness endpoints, graceful shutdown with a drain
period, migrations applied by `migrate deploy`, schema drift check and end-to-end tests in CI, Dependabot,
structured logs with request ids, optional Sentry, scheduled jobs that take a Redis lease so they are safe for several
instances, Redis-backed rate limits.

**You must add (not part of the code)**
1. **Backups**: daily PostgreSQL backup plus point-in-time recovery, object storage versioning, **a restore test
   every quarter**. This is the single most important missing item (no backup tooling ships with the app).
2. **Log shipping**: send container stdout to a collector (Grafana Loki, Datadog, CloudWatch, ELK). Index on
   `requestId`, `level`, `metric`, `event`, `job`, `userId`.
3. **Uptime check** on `/api/v1/health/ready` from outside your network, and the alerts in section 4.
4. **Secrets** in a secrets manager; rotate `JWT_SECRET` and gateway secrets on staff changes.
5. **TLS and security headers** at the load balancer; set `X-Request-Id` there so traces cross proxies.
6. **CI additions**: dependency vulnerability scan (`npm audit --omit=dev`), container image scan (Trivy), and a
   secret scanner (gitleaks). CI today covers types, unit tests, build, migrations and end-to-end.
7. **Map tiles and geocoder** under your own account (see `DEPLOYMENT_GUIDE.md`); the free public servers are for
   development.
8. **Staging environment** with the same migrations, so a release is rehearsed before production.

## 7. Questions the logs must be able to answer

| Question | Where to look |
|---|---|
| "A customer says an order never arrived" | `order_status_history`, delivery rows, `Delivery auto-assigned` line, rider location trail, the customer's `requestId` |
| "Why was this refund issued, by whom?" | `audit_logs` row for `/refund` with the reason, then `refunds` and ledger |
| "Did someone break into an account?" | `auth:LOGIN_FAILED`, `LOGIN_LOCKED`, `PASSWORD_RESET` rows for the user, IP and browser |
| "Which staff member changed this kitchen?" | `audit_logs` by `entityId` |
| "Why is the site slow?" | `slow:true` lines, `ops_snapshot`, host and database metrics |
| "Did Safepay tell us this was paid?" | webhook lines by tracker, `payment.*` events by `orderId`, `payment_attempts` |
| "Is the money right?" | ledger totals against Safepay and the bank, per day |
