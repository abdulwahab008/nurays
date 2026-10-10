# Load testing

How to run the launch load test from `backend/scripts/load/`. It implements the plan in
[PRODUCTION_READINESS_AUDIT.md](PRODUCTION_READINESS_AUDIT.md) (Deliverable 5): a database with launch-sized data, five
scenarios, the audit's targets as the verdict, and the plans of the hot queries. **The tooling is tested; the launch
numbers are not taken yet**, because they need the production images, two API instances behind a real load balancer and
a managed PostgreSQL and Redis (a staging environment). What was measured on a small development machine is at the end,
as a smoke run and not as capacity.

## What you need

- A staging stack: two API instances behind the load balancer, managed PostgreSQL and Redis, the production images
  (`NODE_ENV=production`, so the real rate limits apply).
- A **separate, empty database whose name ends in `_load`** on that PostgreSQL, migrated with `prisma migrate deploy`.
  The seeder refuses any other name, and refuses a database that holds accounts that are not its own. The API under test
  is started against this database.
- One machine to generate the load, in the same region as the stack, with Node 22 and a checkout of this repository
  (`cd backend && npm ci`). Watch its CPU: above about 70 % the numbers say more about the generator than the API, so
  split a heavy scenario over several machines.
- For the sockets scenario, start the API with `AUTO_ASSIGN_ENABLED=false` (see below).

## Steps

```bash
cd backend
export DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/nuray_load     # the seeder and the EXPLAIN file
export API_URL=https://staging.example.pk/api/v1                        # the runner and the token script

# 1. Data: 2,000 kitchens, 10,000 dishes, 5,000 customers, 300 riders, 50,000 orders, 400 open jobs,
#    300,000 audit rows, 20,000 complaints (about 90 seconds and 330 MB). LOAD_SCALE=0.05 makes a small one.
npm run load:seed

# 2. The plans of the hot queries before the run (read them: see "Reading the plans")
psql "$DATABASE_URL" -f scripts/load/explain.sql > explain-before.txt

# 3. Access tokens (they last an hour: mint again before a scenario that would outlive them)
npm run load:tokens -- --customers 1000 --riders 300 --kitchens 20 --rate 10

# 4. The scenarios, one at a time
npm run load:run -- browse      --vus 500 --duration 1200 --ramp 120
npm run load:run -- checkout    --rate 50  --duration 1200
npm run load:run -- rider-loop  --vus 200  --duration 1200 --ramp 60
npm run load:run -- login-storm --rate 20  --duration 300
npm run load:run -- sockets     --sockets 2000 --duration 600 --ramp 60 --jobs-per-minute 12

# 5. The plans again, with the data the run left behind
psql "$DATABASE_URL" -f scripts/load/explain.sql > explain-after.txt
```

Every run prints a table, saves its result under `backend/scripts/load/.generated/results/` (never committed) and exits
0 when the targets were met, 1 when not, 2 when it could not start.

## The scenarios

| Scenario | What it does | Targets |
|---|---|---|
| `browse` | Signed-in customers loop through the listing (pages, a category, a search), a dish, the kitchens list and a kitchen, and the categories, with think time. `--vus` virtual users. | p95 under 300 ms per read |
| `checkout` | `--rate` cash-on-delivery orders a minute, each from the customer's own address and one of the kitchens near them: addresses, payment methods, place the order, read it, read the order list. | p95 under 800 ms to place an order, under 300 ms for the reads |
| `rider-loop` | `--vus` riders: the dashboard's three lists every 30 s, a position every 10 s for a rider who is on a job, and (unless `--no-claim`) each rider takes one open job and carries it to the door with the customer's code. | p95 under 300 ms for the lists, 800 ms for claim, status and position |
| `login-storm` | `--rate` sign-ins a second with the known password (bcrypt at the production cost is the work here). | p95 under 1 s |
| `sockets` | `--sockets` open connections (a fifth are riders on duty) while `--jobs-per-minute` jobs are posted to the open pool; every rider socket is timed from the kitchen's accept to `delivery:new`. | connect p95 under 2 s, 99 % of rider sockets reached per job, p95 under 1 s, no connection lost |

All scenarios also fail on **any 5xx and any request that got no answer**. 429 answers are counted apart and do not
fail a run: they are the server protecting itself, and they tell you the limits apply to this generator.

### Rate limits

Against `NODE_ENV=production` the real limits apply, and they are per account for signed-in traffic (1,200 requests a
minute) and per address for the rest, so one generator is one address. That is why the browse, checkout and rider
scenarios use tokens: each account has its own budget, and `--customers 1000` gives a thousand of them. Placing orders is
limited to 20 in 10 minutes per account, so 50 orders a minute needs at least 25 accounts in rotation (it uses the
tokens in turn). Anonymous traffic (`browse --anonymous`) and `login-storm` come from one address, so expect 429 near
1,200 requests a minute unless the generators run from several addresses or the API sees the real client addresses
through the load balancer. Never switch the limits off on the stack you are measuring: they are part of what is measured.

### Tokens

`npm run load:tokens` signs the seeded accounts in through the API, so it needs no secret and exercises sign-in; `--rate`
paces it (default 10 a second) and it retries a throttled answer. `--sign` signs the tokens here instead, which needs the
environment's `JWT_SECRET` and so only suits an environment whose secret you may hold. The file records when the tokens
expire, and the runner warns when a run would outlive them.

## Reading the results

- **Per endpoint:** count, rate, p50/p95/p99/max in milliseconds, answers by kind (2xx, 429, other 4xx, 5xx, none) and the
  mean response size. A few hundred requests are the least that make a p95 mean something; the verdict skips endpoints
  called fewer than 20 times.
- **Why answers were refused:** under the table, every endpoint that got answers of 400 and over lists them by status and
  the API's error code (`409 CASH_LIMIT_REACHED x87`), so a rule doing its job is told apart from a fault at a glance.
- **While a scenario runs, watch the stack, not only the report:** CPU of each API instance (under 70 %), PostgreSQL
  connections (under instances × `connection_limit` + 10), the slow-query log (`log_min_duration_statement=200ms`;
  enable `pg_stat_statements` and read the top queries by total time afterwards), Redis memory and connected clients, and
  the load balancer's 5xx and idle-timeout counts.
- **Reading the plans:** in `explain-before.txt` and `explain-after.txt` look for a sequential scan on a table that has
  grown, a sort that spills to disk (`external merge`), `Rows Removed by Filter` in the hundreds of thousands, and a plan
  that changed between the two files. The queries mirror what the services build; refresh them from `pg_stat_statements`
  when a service changes.
- **Sockets and automatic assignment:** with `AUTO_ASSIGN_ENABLED=false` every accepted order is announced to every rider on
  duty, which is the worst case for the pool announcement. With it on, most jobs are given to one rider and never
  announced, and the scenario says so instead of passing quietly.

## What the seeded data does not cover

The ledger, wallets, refunds and payouts are empty (no scenario reads them), rider earnings pages are not exercised, the
dish photos are links to files that do not exist, and no scenario uploads anything. Dispatch is exercised only where a
scenario causes it (a job accepted with automatic assignment on). The test does not cover the web app's static assets or
server rendering: put the same generators in front of the web origin separately if those matter for the launch.

## Smoke run on a development machine

Run to check the tooling, not the capacity: one API process and PostgreSQL with the generator on the same four shared
vCPUs, `NODE_ENV=development` (the request limits are off), the full seed (50,000 orders, 10,000 dishes).

| Scenario | Load | Verdict | What it showed |
|---|---|---|---|
| `browse` | 50 users, 60 s (about 3,900 requests) | one miss | Every read under 190 ms at p95 except the search: p95 352 ms (p50 194 ms). |
| `checkout` | 50 orders a minute, 60 s | met | Placing an order p95 118 ms; the reads p95 11 to 104 ms. |
| `rider-loop` | 300 riders, 90 s | missed | The three dashboard lists p95 4.1 to 5.1 s, claim 1.3 s, status 7.9 s, position 4.9 s. No 5xx. |
| `login-storm` | 20 sign-ins a second, 30 s | met | p95 91 ms (p99 119 ms) for 600 sign-ins. |
| `sockets` | 2,000 connections (400 riders on duty), 11 jobs | met | Connecting p95 216 ms; `delivery:new` reached all 400 riders of every job, p95 81 ms. |

What the run showed, in the order to look at it:

- **The rider dashboard is the heaviest read.** A rider with 200 jobs in their history gets about 120 KB from
  `GET /riders/deliveries/mine` (up to 200 jobs, finished ones included, each with the fee corridor) and the open pool is
  95 KB from `/available`. In isolation they take 67 ms and 48 ms of the API's time; 300 riders reloading every 30 s is
  more than one process can serve, so everything queues (p50 under 300 ms, p95 over 4 s). This is the first thing to
  watch on staging with two instances; the fix is on the plan (cap the history, trim the finished jobs, stretch the safety-net
  reload).
- **The dish search scans every dish.** The plan of the search (Q3 in `explain.sql`) is a sequential scan of 10,000 dishes
  and takes 71 ms in the database (the next slowest, the total behind the listing pages, 19 ms; everything else under
  10 ms). At 50 users it is the only read over its target. A trigram index is the usual answer; it is a schema change,
  so it waits for approval.
- **Refusals were rules at work, not faults.** 87 of 300 claims were refused with `409 CASH_LIMIT_REACHED`: those seeded
  riders already have cash orders running, and one more would take them over the Rs 10,000 cash limit. A few position
  updates arrived a moment after the job was delivered and were answered `409 DELIVERY_NOT_ACTIVE`.
- **Overload used to answer 500.** A second rider run, while the machine was also busy with other work, pushed the
  database pool past its wait: 41 requests failed with Prisma's "Unable to start a transaction in the given time". They
  are now answered `503` with `Retry-After: 2` (`SERVICE_BUSY`) instead of a bare 500. Size `connection_limit` for the
  number of instances (see the deployment guide) and treat any 503 in a run as a failed run.
