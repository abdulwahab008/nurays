# Operations and logging

What Nuray records, what you must keep, for how long, what to alert on, and what to set up on your infrastructure.
Written from a DevOps and log-analysis audit of the code. Companion to `DEPLOYMENT_GUIDE.md` (setup) and
`SECURITY_AND_COMPLIANCE.md` (audit log and access).

## 1. The five kinds of record

| Kind | Where it lives | Answers | Keep |
|---|---|---|---|
| **Application log** | stdout, one JSON line each (pino) | "What did the server do and fail at?" | 30 days hot, 90 days cheap storage |
| **Audit trail** | `audit_logs` table (append-only, trigger blocks edit and delete) | "Who changed what, when, from where?" | **2 years minimum** (see 5) |
| **Business ledger** | `ledger_entries`, `order_status_history`, `refunds`, `seller_payouts`, rider ledger, `payment_attempts` | "Where did every rupee go; what happened to this order?" | **7 years** (accounting and tax) |
| **Error tracking** | Sentry (set `SENTRY_DSN`) | "What crashed, how often, since which release?" | Per plan, 90 days |
| **Infrastructure** | Your host and load balancer, Postgres, Redis | "Was it up, was it slow, was disk full?" | 30 to 90 days |

The audit trail and the ledger are **business records**: they live in the database, are backed up with it, and are
never the same thing as the application log.

## 2. What is recorded today

**Application log** (`utils/logger.ts`, `middleware/requestContext.ts`)
- One line per request: method, path (no query string), status, duration, `requestId`, `userId`. Health checks are
  skipped. 5xx are `error`, 4xx and **requests slower than 2 s** (`SLOW_REQUEST_MS`) are `warn` with `"slow": true`.
- The same `requestId` is returned to the client in `X-Request-Id` and in error responses, so a customer's
  screenshot leads straight to the log lines.
- Passwords, tokens, OTPs and handover codes are redacted; email addresses and phone numbers in messages are masked.
- Scheduled jobs: failures are logged as `Job <name> failed` with the error. Dispatch logs every automatic
  assignment (delivery, order, rider, reason, number of candidates).
- **Operations snapshot** every 5 minutes (`metric: "ops_snapshot"`): open deliveries nobody has taken and how long
  the oldest has waited, active deliveries, riders on duty, orders and cancellations in the last hour, expired
  payments, pending approvals, refunds, payouts and complaints. This is what you chart and alert on.

**Audit trail** (`audit_logs`)
- Every admin write (done or refused), every refused attempt at the admin area, admin and customer sign-ins, failed
  and locked sign-ins, logouts, audit exports, **password resets** and **kitchen payout requests**.
- Fields: who, action, record, the fields sent (secrets redacted), IP, browser, result. Reads are not logged.

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
| Payments failing | `paymentsFailedLastHour`, webhook "invalid signature" lines | any spike or any bad signature | gateway or attack |
| Sign-in attacks | audit `auth:LOGIN_FAILED` / `LOGIN_LOCKED` | 20 failures in 5 min from one IP | credential stuffing |
| Staff misuse | audit rows with `responseStatus` 403 on `admin:` actions | any burst | probing |
| Money backlog | `pendingRefunds`, `pendingPayouts` | above 24 h old | unhappy customers and kitchens |
| Approvals backlog | `pendingApprovals` | above 24 h | kitchens waiting to sell |
| Job failures | `Job <name> failed` | any | stuck sweeps (stale orders, dispatch, ranking) |
| Disk, CPU, memory, DB connections | host | 80 percent | capacity |
| Backup missing | host | no success in 25 h | recovery |

## 5. Retention and the audit trail

- `audit_logs` is append-only by a database trigger, so it **cannot be trimmed with DELETE**. Plan for growth:
  admin and sign-in events are small (well under a million rows a year at launch scale). When it matters, export
  old months with the admin CSV export (or a scheduled `pg_dump` of the table) to cold storage, then keep the
  database copy for at least the last 12 months.
- Delete or archive application logs on your collector's schedule (section 1), not in the app.
- OTP and password-reset secrets are already purged after 24 hours by the app. Read notifications older than 90 days
  can be pruned by a DBA when the table grows.
- If you operate under data-protection rules, state these periods in your privacy policy and delete personal data
  on request except where the ledger must be kept.

## 6. Infrastructure audit: what is in place and what you must add

**In place**: non-root containers, health checks, readiness and liveness endpoints, graceful shutdown with a drain
period, migrations applied by `migrate deploy`, schema drift check and end-to-end tests in CI, Dependabot,
structured logs with request ids, optional Sentry, advisory-locked jobs safe for several instances, Redis-backed rate
limits.

**You must add (not part of the code)**
1. **Backups**: daily PostgreSQL backup plus point-in-time recovery, object storage versioning, **a restore test
   every quarter**. This is the single most important missing item (no backup tooling ships with the app).
2. **Log shipping**: send container stdout to a collector (Grafana Loki, Datadog, CloudWatch, ELK). Index on
   `requestId`, `level`, `metric`, `job`, `userId`.
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
| "Did Safepay tell us this was paid?" | webhook lines by tracker, `payment_attempts` |
| "Is the money right?" | ledger totals against Safepay and the bank, per day |
