# Plan for the remaining production-readiness work

Written 2026-10-10 from `docs/PRODUCTION_READINESS_AUDIT.md`. Every finding the report marks Open or Partly fixed (38 open, 22 partly fixed), every remaining risk, the load-test plan, the store plan and the launch checklist were re-checked against the current code (`main` plus the index migrations in [abdulwahab008/nurays#38](https://github.com/abdulwahab008/nurays/pull/38)). Six reviewers checked one area each and a second reviewer per area tried to prove them wrong (69 corrections, all folded in below). A final pass read the whole report for anything missed.

## Progress on PR #38 since this plan was written

Done on `claude/epic-johnson-r4eep6`. The audit report's second addendum has the detail; nothing here needed a schema change.

- **Phase 0:** the fonts are bundled (0.1), the API checks are in the repository and in CI (0.3: twelve suites, 418 checks, plus `verify-money-flows` with 360 checks in a job of its own), the Dependabot rules are in (0.4; closing the old Dependabot pull requests is yours), and the report is corrected (0.5).
- **Phase 1, the code part:** the geocoder's key, pace and queue are settings and one address has a flood guard (INTEG-2), a release guard keeps draft legal pages out of a release (MOBILE-5), and the load-test tooling is written, unit-tested, run in CI on a small database and smoke-tested at full size (`backend/scripts/load`, guide in `docs/LOAD_TESTING.md`). The run against staging is yours.
- **Phase 2:** NEW-priv-1, PRIV-6, NEW-priv-2 and INTEG-3, then the findings of an independent review of them; NEW-auth-1, SEC-4, the staff password rules and SEC-5; the CSP collector, its Playwright check and the enforce switch (SEC-7); PERF-5 (a job is offered to the best rider first, and only riders on duty hear of a job nobody took); the backend lint gate (BE-1); the delivery status machine and its tests (DELIV-11); the web app's lint is green (FE-6: no errors, and CI fails on more warnings than the cap); a busy database answers 503 with `Retry-After` instead of a bare 500 (NEW-perf-3); a customer can enter a house number on a saved address (NEW-addr-1); the admin order list filters by a kitchen's own id (NEW-admin-1); a switched-off online payment is no longer reported as a crash (NEW-ops-2); the store preparation that works on the web: a public help page, the app link files, one way out of the app for every external link, and Google sign-in with a native app's ID token (MOBILE-6, MOBILE-7, MOBILE-4, MOBILE-1); the rider dashboard's job list carries the running jobs and the latest 30 finished ones instead of 200 (NEW-perf-1: the lists went from p95 4 to 5 s to about 1 s with 300 riders on one process); the cart and checkout say only what the server knows about delivery: no invented Rs 80 fee or Rs 800 bar, the free-delivery bar only where the kitchen has such an amount, and an address the kitchen does not reach is not shown as free (NEW-cart-fee, BE-7); a signed-in person can change their password (the other sessions end, this one carries on), the verified address is e-mailed when the password or the e-mail address changes, and the profile page's dead password and verify buttons work (NEW-auth-3, NEW-auth-4, NEW-auth-2); every GitHub Action is pinned to a commit and CI fails on one that is not (OPS-10); signing out forgets the account's push subscriptions (NEW-push-1); a customer can report a review, support staff hide it from a queue, and a hidden review leaves every public page and rating (NEW-ugc-1); the fixed and sticky bars keep clear of the notch, the status bar and the home indicator (MOBILE-8); no form invents a city any more, the city tables are one module, and the web app has a unit-test runner (NEW-web-1, NEW-web-2, FE-9 in part); a kitchen's profile choices are checked against the lists the screens offer (NEW-seller-enums); money is rounded in one place, dead exports are gone and "cash at the door" is one rule (BE-6, BE-8, BE-15 in part); every `console` call in the backend is a structured log call, and the lint cap is 91 (BE-10, BE-12 in part); the delivery status lists are written once (BE-5).
- **Defects the new checks found and fixed on the way:** the rider's view of an order mixed the old street text with the new pin after the customer edited the saved address; the kitchen dashboard counted dishes as orders and counted cancelled lines in today's sales; the delivery row on `GET /orders/:id` listed the riders who had handed the job back to every viewer; and a sweep with absurd values found 500s on huge page numbers, impossible dates, non-finite price filters and amounts beyond a column's range; none is a 500 now (the request is refused with a 400, or the value is capped or ignored). The load scenarios found more: an exhausted database pool answered 500 (now 503), the rider dashboard's lists were the expensive reads (now trimmed), and the dish search scans every dish (NEW-perf-2, waiting for your approval of an index).

Still ahead, in order:

1. **Merge PR #38** (yours), which runs CI on `main` again (Phase 0.2).
2. **Phase 1:** everything outside the code, and the load test on staging (the tooling is ready).
3. **Phase 2, what is left:** the seven days of CSP reports and then enforcing, and the device checks for DELIV-7 (the automated resume test is in) and for the native branch of MOBILE-4.
4. **Phase 3:** waits for your answers to decisions 1–20; anything with a migration waits for your approval.

## Where things stand (when the plan was written)

- **The report is mostly right, with some drift.** PERF-10 is now fixed (the index migrations). SEC-R5 (rider job pool shows exact pins) was already fixed by PRIV-2. FE-14's cause is wrong: the `?search` double fetch only happens in development, and the real duplicate is a different one. 17 statements in the report are out of date (listed under "Report corrections" below).
- **New problems found while re-checking** (not in the report):
  - **Kitchens still receive the customer's map pin, postcode and user id** through the order snapshot, and `GET /orders/:id` doesn't shape the kitchen's view at all (NEW-priv-1, P1).
  - A stolen 1-hour access token can **guess the account password** up to 1,200 times a minute on "change email" and "close account" (NEW-auth-1, P1). That weakens the SEC-1 fix.
  - Forgot-password and resend-verification are limited per IP address only, so anyone can **flood a victim's inbox** from a few addresses and damage the sender's reputation with the email provider (part of SEC-4).
  - **Staff passwords**: the docs say 12 characters, but `scripts/create-admin.js` has no minimum, and `scripts/reset-admin-password.js` accepts 6 characters, defaults to `Admin123!` and only works for `admin@frozennuray.com`. Any staff member can also reset to 8 characters through forgot-password.
  - **Public reviews are auto-approved and can't be reported or hidden.** The App Store (guideline 1.2) and Google Play's user-generated-content policy both require a report action.
  - The **cart page invents a Rs 80 delivery fee and a Rs 800 free-delivery bar** when it has no estimate.
  - Rider notifications keep the customer's street address after the job ends (NEW-priv-2).
  - Found later, while writing the API checks:
    - **A customer cannot enter a house number** (NEW-addr-1, P2). The address form has no field for it and the address validator drops it, so the `house_number` column stays empty for every new address and the order snapshot's house number never has anything to freeze. Landmark works.
    - **Notifications a rider already holds** still show the street (NEW-priv-3, P2). The fix covers new notifications only.
    - **`GET /admin/orders?sellerId=`** takes the kitchen owner's account id, while every other route and the rows it returns name a kitchen by its own id (NEW-admin-1, P2).
    - **A deliberate 503 is reported like a crash** (NEW-ops-2, P2). The error handler logs every 5xx `AppError` as an error and sends it to error tracking, including `GATEWAY_UNAVAILABLE`, which is the expected answer while no gateway is configured.
- **CI on `main` is red.** The run on the PR #26 merge commit failed in the end-to-end job because the web build could not download the Plus Jakarta Sans font from Google Fonts (`next/font/google` fetches fonts during `next build`). It was a network hiccup: the frontend job in the same run built fine, and PR #38 passed. But any CI or Docker build can fail the same way, so the fonts should be bundled in the repo.
- **The evidence behind most "Fixed" rows can't be re-run.** The `flow/56`–`flow/64` API checks the report cites, and the load-test and EXPLAIN scripts, live only in the audit session, not in the repo or CI.
- **16 Dependabot PRs are open.** Some must not be merged as they are: Node 25 base images (#27, #29; not an LTS release), `@prisma/client` 7 without the matching CLI (#19) and TypeScript 7 (#20, #24).

## Effort at a glance

| Phase | What | Who | Engineer-days (rough) |
|---|---|---|---|
| 0 | Housekeeping that unblocks the rest | Claude, plus you merging | 3–4 |
| 1 | Launch blockers for the web soft launch | You and ops, plus about 6 days of code | 6 code + ops time |
| 2 | P1 code that needs no decision | Claude | about 12 |
| 3 | Work waiting on your decisions | You decide, then Claude | about 21 once decided |
| 4 | Google Play and App Store apps | You (accounts) and Claude | about 22, plus store review time |
| 5 | After launch: code health and performance | Claude | about 23 |

Estimates are for one experienced engineer and include tests. The calendar time of Phase 1 depends on outside parties: the lawyer, hosting, map provider and devices.

## This week, in order

1. **Merge PR #38** (indexes). That also runs CI on `main` again.
2. **Bundle the web fonts** so builds stop depending on Google Fonts (Phase 0.1). Done.
3. **Start the long-lead items now (you):** legal entity details and the lawyer review, the production hostnames (put the API on a subdomain of the site's domain, e.g. `api.nuray.pk`), map and geocoder provider accounts, and the Apple and Play organisation accounts (they need a D-U-N-S number).
4. **Privacy fixes, one PR (about 1 day):** NEW-priv-1, PRIV-6, NEW-priv-2, INTEG-3. Done.
5. **Auth hardening (about 3 days):** NEW-auth-1, SEC-4, staff password rules, SEC-5. Done.
6. **Bring the API checks into the repo and CI** (Phase 0.3), before any refactor. Done.
7. **Rider fan-out (PERF-5)**, then write the load-test scripts. Both are done; the run on staging is next, and it needs your environment.
8. **Answer decisions 1–7 in Phase 3.** They unlock the remaining P1 work.

---

## Phase 0: Housekeeping (no decisions needed)

- [x] **0.1 Web build without a font download** (P0, XS–S). Switch `frontend-web/app/layout.tsx` from `next/font/google` to `next/font/local`, with the Plus Jakarta Sans and Geist Mono files in the repo. Check: `next build` with no internet access. **Done:** the three families are variable woff2 files in `app/fonts`; a build with the network switched off succeeds and its output has no Google address; the CSP no longer names Google's font hosts.
- [ ] **0.2 Merge PR #38 and get `main` green.** After merging, release the five index migrations as a release step (`npm run db:migrate` from a checkout), not through `MIGRATE_ON_START`. A failed concurrent build would otherwise crash-loop the API. The recovery steps are at the top of each migration file.
- [x] **0.3 Re-runnable evidence** (P1, M). Port the API checks the report cites (`flow/56`–`64`: deletion, snapshot, security, validation, delivery, views, small fixes, privacy) to `backend/scripts/api-checks/*.ts`, reading `API_URL`/`DATABASE_URL` from the environment and using the e2e seed accounts. Add `npm run api-checks`. Run it, together with `verify-money-flows` (333 checks), in the CI end-to-end job, which already has Postgres. Move the browser-only checks into Playwright specs where they still add coverage. Then update every `flow/…` citation in the report. **Done:** `backend/scripts/api-checks/` holds twelve suites (`security`, `account-closure`, `snapshot`, `kitchen-view`, `validation`, `small-fixes`, `views`, `privacy`, `delivery`, `pool`, `sign-in`, `moderation`; 418 checks) run by `npm run api-checks`, as the last step of the end-to-end job; `verify-money-flows` (now 360 checks) runs in a CI job of its own. The report cites these suites. The admin API suites and the browser scripts (41–50, 63, 65) stay session evidence.
- [ ] **0.4 Dependabot triage** (XS). Close #27 and #29 (Node 25) and #19 (Prisma client alone). Hold #20 and #24 (TypeScript 7) and #35 (lucide-react 1.x) for a planned upgrade. Merge the safe patch bumps after CI. Add rules to `.github/dependabot.yml`: ignore non-LTS Node majors, and group `prisma` with `@prisma/client`. PR #1 is from before the rebuild and can probably be closed. **Partly done:** the rules are in `.github/dependabot.yml` (related updates are grouped, Node and TypeScript majors are not proposed); closing #27, #29 and #19 and holding #20, #24 and #35 is yours.
- [x] **0.5 Correct the report** (S): see "Report corrections" at the end. **Done** (see "Report corrections" below).

## Phase 1: Launch blockers for the web soft launch (P0)

Most of this is outside the code. Items marked **(you)** need the owner or ops; items marked **(Claude)** are code that can be written now.

- [ ] **Legal (you, longest lead time).** Company legal name, registered address and a monitored support mailbox, then one lawyer review of terms, privacy, refund policy and the delete-account page (MOBILE-5). The privacy policy also needs new sections drafted now: the rider's live location shared during a delivery, device push identifiers, and camera use for documents (NEW-legal-1). The audit-log retention period (SEC-R7) belongs in the same review.
  - **(Claude, XS)** Release guard: the build fails when `NEXT_PUBLIC_LEGAL_REVIEWED=true` but the company values are empty, and the publish workflow warns on `main` and fails on a release tag. Only the frontend image is affected. **Done:** `next.config.ts` refuses a build marked reviewed without the company name, address and support e-mail, and the publish workflow checks the repository variables first (warning on `main`, failing on a `v*` tag).
- [ ] **Production configuration (you).** Fill in the real `.env` and start the API once against it (it refuses placeholders). Also set the **GitHub repository variables** the image-publish workflow reads (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, Google client id, Sentry DSN, map and legal variables). Without them, every push to `main` publishes a frontend image with `http://localhost:3001` baked in.
- [ ] **Hosting (you).** TLS and HSTS at the load balancer. `TRUST_PROXY` set to the real number of proxy hops. Readiness probe on `/api/v1/health/ready`. Load-balancer idle timeout below 65 s. API on a subdomain of the site (needed for the cookie in Phase 3 decision 2).
- [ ] **Map tiles and geocoder (you, plus Claude S).** Accounts with a tile provider and a geocoder (the public OpenStreetMap servers are for development only). Restrict the tile key by referrer, because it ships in the browser bundle.
  - **(Claude)** The geocoder proxy currently hard-codes one request per second and sends no API key, so a paid account would still run at public-server speed. Make the key, the rate and the queue cap configurable. **Done (INTEG-2):** `NOMINATIM_API_KEY` (and the parameter it travels in), `NOMINATIM_MIN_INTERVAL_MS` and `NOMINATIM_MAX_PENDING` are settings, and `GEOCODE_PER_IP_PER_MINUTE` (default 120) is the per-address flood guard.
- [ ] **Backups and rehearsals (you).** Scheduled database and file backups. One restore rehearsal. One rollback rehearsal: a failed `migrate deploy`, then `prisma migrate resolve`, then redeploy of the previous image tag.
- [ ] **Staging environment (you).** Production images, managed Postgres and Redis, two API instances behind a real load balancer. Needed for the load test and for the store reviewers' test accounts.
- [ ] **Launch data (you).** Create the super admin with `scripts/create-admin.js` from a checkout (the runtime image has no scripts). Set up communities and delivery prices, and approve the first kitchens and riders. If an existing database is migrated, check that the oldest admin, who becomes super admin, is the right person.
- [ ] **Device checks (you, plus Claude S).** On one Android phone and one iPhone, each with and without Google Maps installed: Start navigation opens Maps at the pin; position sharing resumes within about 5 s after coming back from Maps; the screen stays on; the PIN handover completes. Record the iOS version: the wake lock doesn't work in home-screen web apps before iOS 18.4.
  - **(Claude)** An automated Playwright test of the resume path on a mobile viewport (DELIV-7). **Done:** `tests/e2e/rider-location-resume.spec.ts`, run in CI; it fails when the position is not sent on return.
- [ ] **Load test (Claude writes it, L; you provide staging).** **Tooling done; the run on staging is yours** (`docs/LOAD_TESTING.md` has the steps and how to read the results).
  - `backend/scripts/load/seed-load.ts`: 2,000 kitchens, 10,000 dishes, 5,000 customers, 300 riders, 50,000 orders, 400 open jobs, 300,000 audit rows, 20,000 complaints; refuses a database whose name doesn't end in `_load` or that holds accounts that aren't its own. **Done.**
  - A token-minting script, because tokens expire after 1 hour and the whole run takes longer. **Done** (`mint-tokens.ts`, signs in through the API).
  - Scenarios: browse, checkout, rider loop, login storm. **Done**, in plain Node with no extra tool to install (not k6); the verdict is the audit's targets (p95 under 300 ms for reads and 800 ms for writes, no 5xx), and the report says why each refusal happened.
  - A Socket.IO harness for 2,000 sockets that times `delivery:new` from the kitchen's accept to each rider socket. **Done.**
  - The audit's EXPLAIN queries committed to the repo. **Done** (`explain.sql`, 13 queries).
  - **Kept from rotting:** the arithmetic of the runner has unit tests, the scripts are type-checked in CI, and a CI job seeds a small database and runs every scenario for a few seconds.
  - **Left (you):** on the managed Postgres, `log_min_duration_statement=200ms` and `pg_stat_statements`; the staging stack; running it and reading the results.
  - Do PERF-5 first, or the rider scenario measures a problem that is already known. **Done.**
  - **What the smoke run at full seed size found** (one process, development machine; not capacity): the rider dashboard's lists were the heaviest reads (NEW-perf-1, fixed), the dish search scans every dish (NEW-perf-2, an index needs your approval), and an exhausted database pool answered 500 (NEW-perf-3, fixed).
- [ ] **Launch-day smoke checks (you).** From `docs/DEPLOYMENT_GUIDE.md`: a registration email and an OTP arrive; an S3 upload and a private receipt link work; one real small Safepay payment completes an order; `db:check` passes.

## Phase 2: P1 code that needs no decision (Claude can start now)

**Privacy (one PR, about 1 day)**
- [x] **NEW-priv-1** Kitchen order views built from an explicit list of fields: no pin, postcode, customer id or internal keys. `GET /orders/:id` gets the same kitchen view. Tests check that nothing beyond the allowed fields comes back. **Done** (`utils/kitchenOrderView.ts`, both routes). An independent review of it found more channels that named the other parties (ids in live events, tracking and chat, gateway references in order history, address fields); all fixed.
- [x] **PRIV-6** Stop returning the seller's user id from public kitchen endpoints (XS). **Done.**
- [x] **NEW-priv-2** Rider notifications name the area and city, not the street (XS). **Done** for new notifications; rows stored before the change still hold the street (NEW-priv-3).
- [x] **INTEG-3** Refuse online-payment orders when Safepay isn't configured, with a test-mode switch so the money-flow checks still run (XS). **Done** (503 `GATEWAY_UNAVAILABLE`; the checkout page falls back to cash).

**Sign-in security (about 3 days)**
- [x] **NEW-push-1** A browser's push subscription must not stay with the first account that enabled it. **Done:** `POST /auth/logout` forgets every push subscription of the account (every device's session ends with it), the web app drops the browser's own subscription on sign-out, and `AuthProvider` registers an existing subscription for whoever is signed in (so a device that changed hands without a sign-out moves to its new owner, and a device the server forgot comes back when its owner signs in again). API check (the other account's subscriptions are untouched), a browser run of 11 checks with a stand-in push manager, and mutants of both ends caught. **Left:** a session that simply expired keeps its subscription until the next person signs in on that browser.
- [x] **NEW-auth-2, NEW-auth-3, NEW-auth-4** Remove the unused `reset_password` code purpose; a change-password endpoint for signed-in people; a notice to the old address when the e-mail changes. **Done:** `POST /auth/change-password` (the current password again, counted like the other confirm screens; the new one judged first; every other session ends and this one gets fresh tokens; none for an account without a password); the verified address is e-mailed after a password change, and the address an account leaves is e-mailed after an e-mail change (named in part, never to an unproven address); the profile page has a working password form and a working e-mail "Verify" button; `GET /users/me` carries `emailVerified` and `hasPassword`. 28 unit tests, 18 API checks, a browser run of 24 checks. **Left:** a link in the notice to undo an e-mail change.
- [x] **NEW-auth-1** Limit password re-checks on change-email and close-account, counting only wrong passwords. Answer a wrong password with 400 instead of 401, so the web client doesn't refresh and retry. **Done.**
- [x] **SEC-4** Per-phone and per-email limits on OTP, forgot-password, resend-verification and email change. A forgot-password link is not re-issued within 60 s. A generous per-IP backstop on login. Redis keys hold hashes, never raw numbers or addresses. **Done.**
- [x] **Staff passwords** At least 12 characters for staff everywhere: reset, `create-admin.js` and `reset-admin-password.js`. The reset script takes the email as an argument, has no default password and writes an audit entry. **Done.**
- [x] **SEC-5** Refuse common passwords using a bundled list, and fix the leftover "6 characters" hint on the register page. The fixtures must not contain "nuray", which the personal-word check would refuse. **Done** (about ten thousand common passwords, the person's own details; the register page says 8).
- [ ] **SEC-7** Give the report-only CSP somewhere to send reports: a same-origin `/csp-report` collector that strips query strings, because reset links carry tokens. Add a Playwright CSP check and a build flag to enforce. Then 7 days of reports on staging or the soft launch, then enforce. The `'unsafe-inline'` question is decision 9. **Done so far:** the `/api/csp-report` collector, a Playwright check that the public pages produce no report, and `CSP_ENFORCE=true`. **Left:** seven days of reports on staging or the soft launch, then the switch.

**Capacity**
- [x] **PERF-5** Try auto-assignment first and post a job to the open pool only if nobody takes it. That removes most pool events with no client change. Then send pool events only to riders who are on duty and active (a socket room joined and left on duty toggle, approval and suspension), and refresh only the list that changed. **Done:** a job is offered to the best rider first and the pool hears of it only when nobody can take it; then only riders who are approved, active and on duty are told (the `riders:on-duty` room, kept in step by `socketManager.syncRiderDuty`), and the dashboard reloads just the list of available jobs, and again when the rider goes on duty. In a browser: two requests instead of five for a new job, one instead of three when someone else takes it, none for a rider who is off duty. Checked by unit tests and the `pool` API suite.
- [x] **NEW-perf-1** The rider dashboard's job list carries every running job and the latest 30 finished ones (`?history=`, up to 200), the pool pop-up asks for running jobs only, the open-pool list does not load the customer, and the history tab shows the rider's lifetime count with a "Show older deliveries" button. **Done** (load scenario, same machine: the dashboard lists from p95 4 to 5 s to 0.8 to 1.2 s; `tests/rider-job-list.test.ts`, API checks).
- [x] **INTEG-2** Geocoding limits: keep the global queue cap, and add only a generous per-IP flood guard (many Pakistani mobile users share one IP). The proper per-account limit comes when the geocode routes move behind the API sign-in. **Done** (see Phase 1).

**Quality gates**
- [x] **OPS-10** Pin every GitHub Action to a commit SHA and fail CI on one that is not. **Done:** the nine actions in `ci.yml` and `docker-publish.yml` are pinned with their release in a comment, `.github/scripts/check-pinned-actions.sh` runs in the dependency-audit job, and Dependabot's monthly grouped update moves pin and comment together.
- [x] **FE-6** Get the web lint errors to zero, including the 13 React hook errors (some are real bugs). Gate CI on errors, with a warning cap that only goes down. **Done:** 0 errors, 434 warnings, and `npm run lint` (`--max-warnings 434`) runs in CI. The hook-rule errors were fixed in the code and none was silenced except one development-only page: the Google sign-in button called a hook conditionally, the role guard, the phone menu, the date picker, the reviews list and the prefilled modals set state from effects (the promotion form could reset what was typed whenever the page re-rendered), the live-refresh hook wrote refs while rendering, and the payment card read the clock while rendering. `no-explicit-any` is a warning, counted by the cap.
- [x] **BE-1** Add an ESLint config to the backend and a CI lint step (half a day). **Done:** `npm run lint` runs in CI; 0 errors, at most 91 warnings.
- [x] **DELIV-11** Unit tests for the delivery status machine, before anyone touches the rider or dispatch code. **Done:** `utils/deliveryStatus.ts` and 19 tests that fail when a transition or a guard changes.

**What the screens say about delivery**
- [x] **NEW-cart-fee, BE-7** Remove the cart's invented fee and Rs 800 bar and the summary's placeholder `deliveryFee`/`discount`/`total`; return the free-delivery amount the fee engine actually applied. **Done:** the summary holds only what a tray knows; `GET /cart/delivery-estimate` adds `freeDeliveryThreshold` and `deliverySubtotal` and counts the dishes the way checkout does (after the kitchen's deals); the cart and checkout show the real fee, the bar only for a kitchen with such an amount, "calculated at checkout" when there is no estimate, and "Not available" with the reason where the kitchen does not deliver (the order button is then off). The estimate is asked for again after every change to the tray. 6 unit tests, 10 API checks tying the estimate to the fee an order is charged, a browser run of 36 checks.

**Backend consistency**
- [x] **BE-6, BE-8** One `roundMoney` (never `-0`) instead of six private copies and an inline one; seven exports nothing referenced are deleted. **Done:** the money-flow verification gives the same 360 of 360 before and after.
- [x] **BE-10** Replace `console.*` with the structured logger. **Done:** 57 calls became `logger` calls that carry the error and ids as fields; three places print on purpose (the start-up refusal and the development SMS and e-mail consoles); per-socket connect and room traffic is `debug`, not `info`; the registration path no longer logs a full e-mail address. The lint cap is 110 (it was 167).
- [x] **BE-5** One set of delivery status lists. **Done:** `ACTIVE_DELIVERY_STATUSES` (the statuses a rider can move a job from), `ON_THE_WAY_STATUSES` and `BEFORE_PICKUP_STATUSES` in `utils/deliveryStatus.ts`, used by the rider, dispatch, order, account-closure, admin-people and operations-snapshot code; a failed delivery stays out of the active list, so it stays cancellable.
- [x] **BE-12** (in part) Type `req.seller`, drop the request casts. **Done:** `req.seller` is declared and set by `requireSeller`; the signed-in user's id is read with `currentUserId(req)` (401 for a missing user, not a TypeError); the lint cap is 91. **Left:** the other `any` in services and controllers.
- [x] **BE-15** (in part) Unify the small helpers. **Done:** `maskPhone` (the SMS service's copy is gone), `isCashAtDoor`/`cashAtDoor` for "cash is still to be taken at the door" (it was written out eight times, once without the paid check), and one `finiteOrNull` for the three identical numeric helpers. **Left:** the numeric helpers whose contracts differ on purpose.

**Seller profile**
- [x] **NEW-seller-enums** Enforce the lists the seller validator already declared, and refuse a cut-off that is not a time. **Done:** business type, delivery modes, availability override and `HH:MM` for the cut-off; a null that no column can hold is a 400, not a 500; sign-up checks its delivery modes too; the settings page can clear a cut-off. 19 unit tests with five mutants caught and 11 API checks. Meal categories stay free text until decision 15.

**Forms on the web**
- [x] **NEW-web-1** The address form must not start with Karachi chosen or fill it in when the map names no city, and the city tables must not call central Rawalpindi Islamabad. **Done:** `lib/cities.ts` holds the city list, the Urdu names and the matching (the listed city the map's text names, else the nearest city's middle within 30 km, else the map's own city, else nothing); the address page and the kitchen sign-up use it; the address form's city is typed text with the 25 cities as suggestions and is required; the sign-up form starts empty. A browser run of 11 checks.
- [x] **NEW-web-2** A unit-test runner for the web app's pure helpers. **Done:** `npm test` runs `tests/unit/*.test.ts` with Node's own runner (it reads TypeScript directly: no new packages) and CI runs it; the first suite is the city module, 7 tests with 5 mutants caught.

**What people write**
- [x] **NEW-ugc-1** Reviews must be reportable and removable (App Store guideline 1.2 and Google Play's user-generated-content policy both ask for it). **Done:** anyone signed in except the author can report a review (`POST /reviews/:id/report`: five reasons and an optional note; the review stays shown); support staff, admins and the super admin decide at `/admin/reviews`, which is also an Approvals queue (hide, keep, show again); a hidden review leaves every public page, the kitchen's dashboard and the dish's, kitchen's and rider's rating; each report and decision is audited. No schema change (the existing `is_approved`, `is_flagged` and `flag_reason` columns and the audit log). It also fixed three reads that ignored approval (the kitchen's public page and two review counts). 13 unit tests with 10 mutants caught, 31 API checks (a mutant of each public read caught), and a browser run of 33 checks including Urdu. **Left:** the author is not told when a review is hidden and cannot appeal; the order chat has no report or block action.

**Store preparation that works on the web today**
- [x] **MOBILE-8** Safe-area padding for the fixed and sticky bars (mandatory for an Android app targeting API 36, and it already affects iPhone home-screen users). **Done:** `--safe-top`, `--safe-bottom`, `--safe-start`, `--safe-end` and `--header-offset` in `globals.css`, used by the fixed top bar and the page offset under it, the public sticky headers and the bars under them, the corner pop-ups, both slide-over menus, the menu drawer, the kitchen page's tray bar and the new-dish save bar; the page keeps clear of a notch at the side. A browser run of 25 checks with a simulated notch (portrait, landscape, English, Urdu); with no insets nothing moves. **Left:** a real device, in the native shell (an Android WebView that does not report the insets needs the shell to supply them).
- [x] **MOBILE-6** A public help page with an FAQ and the support email, no sign-in needed. **Done:** `/help`, linked from the home footer and every legal page; the e-mail is `NEXT_PUBLIC_SUPPORT_EMAIL`, so it shows a bracketed placeholder until you set it.
- [x] **MOBILE-1** `POST /auth/google` also accepts Google id tokens, which a native app needs. The web keeps its current button. **Done on the server** (`idToken`, verified against Google's published keys; `GOOGLE_NATIVE_CLIENT_IDS` for the Android and iOS client ids); the native shell's Google plugin is still to come.
- [x] **MOBILE-4** One `openExternal()` helper for maps, documents and legal links. Each rider map button keeps going to its own end of the trip. **Done for the web** (`lib/open-external.ts`, `components/ExternalLink.tsx`; a browser check that Start navigation and both Maps buttons open their own addresses); the Capacitor branch is written against its documented plugins and needs a device once the shell exists.
- [x] **MOBILE-7** Serve `assetlinks.json` and `apple-app-site-association` from environment values; the values come once the store accounts exist. **Done** (`ANDROID_APP_PACKAGE`, `ANDROID_SHA256_CERT_FINGERPRINTS`, `IOS_APP_IDS`, runtime settings of the web server; 404 while unset). **Yours:** set them when the apps exist.

## Phase 3: Your decisions

Each line gives the options, the recommendation, and what it unlocks. Effort is what remains after the decision.

| # | Decision | Recommendation | Unlocks |
|---|---|---|---|
| 1 | **Per-device sessions** (SEC-R1, SEC-2): approve a `auth_sessions` + `refresh_tokens` migration | Approve. "Log out" ends this device only and a new "Sign out everywhere" ends all. Staff stay signed in 12 h, everyone else 30 days (renewed while active). Everyone signs in once at deploy, which costs nothing before launch. | Stolen refresh tokens detected and killed, a list of signed-in devices. L (4 days). Logout must work with an expired access token, and account closure must delete sessions. |
| 2 | **Refresh token in an httpOnly cookie** (SEC-R2) | Host the API on a subdomain of the site (`api.<domain>`) and use a `Secure; HttpOnly; SameSite=Strict` cookie with an Origin check. Don't wait for CSP enforcement. Decide first how native background location will authenticate, because native code can't read the cookie. | Scripts on the page can no longer read the refresh token. M, after decision 1. |
| 3 | **Staff lockout** (SEC-3) | Lock only the (account, IP address) pair. Alert the owner after 20 failures from all addresses in an hour; a slow-down, never a refusal of the right password. A reset or super-admin unlock clears it. Two-factor codes for staff later. | No one can lock the super admin out with one request. M. |
| 4 | **What kitchens see about customers** (PRIV-4) | Phone and full door only while the kitchen hands the order over itself (pickup or self-delivery) and the order is live. Self-delivery also gets the pin and a Maps link. Otherwise first name, area and city, and contact through the order chat. | M. Builds on NEW-priv-1. |
| 5 | **Pin decides the community** (DELIV-3) | A valid pin wins. Outside every radius, accept an area-name match only within 1.5 km of that community (a setting). Name matches limited to the address's own city: today a Karachi address named "DHA Phase 5" is filed under Lahore. Dispatch reads the community fixed at order time. | Correct pricing and dispatch for edge and cross-city addresses. S–M. |
| 6 | **Require a pin for home delivery at the API** (DELIV-4) | First run the read-only count of pinless addresses and recent pinless orders on a production copy. If no recent pinless orders exist, enforce now with no grace period; otherwise use a 30-day grace period. | S. Fixtures in `verify-money-flows` need pins. |
| 7 | **IP geolocation fallback** (FE-11, OPS-13, INTEG-7) | Delete it. When GPS fails, only pan the map and ask the buyer to drag the pin; never set a guessed pin. | No visitor IPs sent over plain HTTP. S. |
| 8 | **Revealing which accounts exist** (SEC-11) | Same answer on login paths: "if this number is registered, a code is on its way". The registration-purpose OTP request must also stop answering "user exists". Sign-up errors can stay explicit. | S. |
| 9 | **CSP strength** (SEC-7) | Enforce the current policy after the 7-day soak. Per-request nonces would make every page server-rendered and are only worth it once decision 2 is done. | P1 closed. |
| 10 | **Audit log free text** (SEC-R7) | Redact phone numbers, emails, CNIC and IBAN, and cap reasons at 200 characters. Order numbers and payment references stay readable. Retention set with the lawyer (suggested: 24 months for staff actions, 180 days for failed-login rows); needs a trigger change. | M. |
| 11 | **Schema clean-ups** (MONEY-7, MONEY-8, BE-9): one approval session | Approve: an idempotency fingerprint column (a reused key with a different order body is refused), drop `inventory_reservations`, drop four unused models after confirming production has no rows in them. | S each, separate migrations. |
| 12 | **Default community** (FE-20) | No silent default: keep the chooser open and say "No Nuray community near you yet". | S. |
| 13 | **Search engines and share previews** (FE-10) | Page titles and descriptions plus a sitemap now; server-rendered detail pages next; leave the listing page as is. | S–L. |
| 14 | **Legacy scripts** (BE-14) | Delete the 7 frozen-food leftovers. Decide whether the two cooked-food category seeds become one documented seed. | XS. |
| 15 | **Seller "meal categories"** | The API means meal times, the web saves cuisines. Pick one. | XS–S. |
| 16 | **Brand logo** (FE-21) | Pick one of the three options in `public/brand/`. | Store icons and graphics. |
| 17 | **Background jobs** (D2-W4) | Add on/off switches now so one instance can run the jobs. A separate worker process only if the load test shows a need. Stagger the jobs' start times. | XS–S. |
| 18 | **Old orders without an address snapshot** (Deliverable 6) | Accept the live-address fallback until those orders close, then remove the fallback code. The same rule covers orders placed before the snapshot kept house number and landmark: a field the snapshot has is final, a field it lacks comes from the saved address. | XS later. |
| 19 | **Prisma advisories** (Deliverable 10) | Prisma 7 does not fix them. Use an npm override for `deepmerge-ts`, bump `handlebars`, and plan jest 30 for the dev-only findings. | S. |
| 20 | **Seller balance speed** (PERF-1) | Do only step 1 (rider cash from deliveries, indexed) now. Rewriting the balance in SQL would copy the money rules into a second place. | M. |

## Phase 4: Google Play and App Store

**Start now (you):**
- Play and Apple organisation accounts under the legal entity.
- A Firebase project.
- One app id for both stores (e.g. `pk.nuray.app`). It can never change once published.
- Store decisions:
  - **MOBILE-2** (recommended: hide Google sign-in in the iOS app for v1, which avoids the Sign in with Apple requirement).
  - **MOBILE-9** (recommended: keep location running during a job with an Android foreground service and iOS while-in-use background updates, not "allow all the time").
  - **MOBILE-10** (recommended: the app loads the live website, so one deploy updates everything).
  - Whether to ship the Play-only Trusted Web Activity first (D8-TWA). It's worth it only if a Play listing is needed weeks early. Use the same app id and signing key so the real app replaces it.

**Web work that needs no native project (Claude):**
- A small platform helper, a token store behind the API client (MOBILE-11) and `openExternal` (Phase 2).
- Safe-area padding for fixed bars (MOBILE-8): done, see Phase 2. It was mandatory, because Android API 36 no longer allows opting out of edge-to-edge, and it already affects iPhone home-screen users.
- A mobile Playwright project (MOBILE-12).
- Report and hide for reviews, with an admin queue (store requirement): done, see NEW-ugc-1 in Phase 2.
- An accessibility pass with an automated axe check.

**Needs approval:** MOBILE-3 native push, a new `native_push_tokens` table. On iOS use a Firebase messaging plugin; the standard one returns APNs tokens that FCM rejects.

**The native shell (D8-CHECKLIST, more than a week):**
- Capacitor for Android (target **API 36**, the current Play requirement) and iOS.
- Push, location plugin, camera permissions with English and Urdu texts, deep links (orders, Safepay return, email links), native Sentry.
- Store listings in English and Urdu, data-safety and privacy-label forms (drafted in `docs/STORE_DATA_DECLARATIONS.md` with NEW-legal-1), content rating (chat and reviews declared).
- Reviewer accounts on staging.
- Play's 14-day closed test applies only to personal accounts.

## Phase 5: After launch (P2), in batches

- **Backend consistency (about 3 days; BE-5, BE-6, BE-8, BE-10 and most of BE-15 are done):** the other `any` after BE-12's first part, seller lookup and formatting out of controllers (BE-13).
- **Split `order.service.ts`** (BE-11, 1,856 lines), and move pricing, promotions and delivery-fee maths into pure, unit-tested modules.
- **Web app:**
  - One discount label helper (FE-4) and a thin admin layout (FE-5).
  - Typed API shapes (FE-7, ratcheting the lint cap).
  - One seller product form (FE-8; updates use PATCH, and variant saves differ between create and edit).
  - One geocode and city module (FE-9): the city tables and matching are done (NEW-web-1); the geocoder call and the form filling after it are still written out three times.
  - Store selectors for cart and community (FE-12), the signed-in duplicate products fetch (FE-14), one button component (FE-18).
  - The hub console product photo (NEW-fe-hub-1), and the sign-up form's "Hyperlocal Community" field (NEW-web-3).
  - A smaller shared bundle for anonymous pages.
- **Performance and operations:** a lighter product card (PERF-6, CAP-4), cleanup of partial S3 image writes (INTEG-6), and the dev-only npm advisories.

## Report corrections

Made in `docs/PRODUCTION_READINESS_AUDIT.md` (Phase 0.5), including the status counts, which are now 97 fixed, 20 partly fixed and 23 open:

- **Header and Deliverable 7:**
  - The branch was merged through PR #26, and the index migrations add a schema change.
  - The stack counts changed: 70 pages, 52 services, 20 validators, 16 migrations.
  - CI evidence: PR #26 and PR #38 green; the `main` run red on the font download.
- **SEC-R5** is fixed (PRIV-2, AUTHZ-4). **PERF-10** is fixed, with `deliveries(status)` declined for the stated reason. **FE-14**'s cause is wrong.
- **Deliverable 4:**
  - Email change does **not** end sessions (NEW-auth-4).
  - Forgot-password has no per-address cap.
  - `.env.example` lacks `AUTO_ASSIGN_ENABLED`, `SAFEPAY_API_URL`, `SAFEPAY_CHECKOUT_URL`, `SENTRY_TRACES_SAMPLE_RATE`, `SLOW_REQUEST_MS` (and `NEXT_PUBLIC_SENTRY_RELEASE` on the web).
  - The Prisma advisories are in the runtime image (accepted in `.trivyignore`), and the dev-only ones are unrelated to Prisma.
- **Deliverable 9:**
  - Replace "One CI run green on this branch" with "`main` green, PR #38 merged".
  - FE-6 belongs in P1, as the addendum says.
- **Deliverable 10:** the approvals list is missing MONEY-7, MOBILE-3, SEC-R7's trigger change and the decisions in Phase 3.
- **Fixed rows with leftovers:**
  - FE-17: `auth-store.ts` still reads the token storage directly in three places.
  - BE-2: two scripts still import an undeclared `axios`.
  - OPS-8: the go-live checklist doesn't include the rollback rehearsal it promises.
- **DEPLOYMENT_GUIDE.md:** add the dispatch and ops-snapshot jobs to the background-jobs table, replace "exactly one proxy hop" with `TRUST_PROXY`, and add the rollback rehearsal to the go-live checklist.
- **Web lint counts:** now 271 errors and 188 warnings; 237 `any`.

## Appendix: every item and its current state

Status now: what the code shows today. Needs: code = can be done now; decision = your choice first; approval = a migration you approve; outside = accounts, devices, legal or infrastructure; native app = the Capacitor project.

| ID | In the report | Status now | Needs | Priority | Effort | Phase | Work |
|---|---|---|---|---|---|---|---|
| SEC-2 | Partly fixed | Partly open | approval | P1 | XS | 3 (#1) | Finish session revocation: logout/rotation residual (umbrella for SEC-R1/SEC-R2) |
| SEC-R1 | — | Open | approval | P1 | L | 3 (#1) | Per-device sessions: refresh-token rotation with reuse detection |
| SEC-R2 | — | Open | decision | P1 | M | 3 (#2) | Move the refresh token to an httpOnly cookie with CSRF protection |
| SEC-3 | Open | Open | decision | P1 | M | 3 (#3) | Staff lockout that cannot be used to lock out the super admin |
| SEC-4 | Partly fixed | Done | code | P1 | M | 2 | OTP, forgot-password and verification-email limits per target; login backstops |
| SEC-5 | Partly fixed | Done | code | P2 | S | 2 | Common/breached password check (plus the leftover 6-character UI hint) |
| SEC-7 | Partly fixed | Partly done | code | P1 | S | 2 | Collector, Playwright check and `CSP_ENFORCE` are in; left: a week of reports, then enforce |
| SEC-11 | Open | Open | decision | P2 | S | 3 (#8) | Stop revealing which emails and phone numbers have accounts on the login and OTP paths |
| NEW-auth-1 | — | Done | code | P1 | S | 2 | Throttle re-authentication password checks; stop answering a wrong password with 401 |
| NEW-auth-2 | — | Done | code | P2 | XS | 2 | Remove the unused 'reset_password' OTP purpose. Done: the API refuses it (400) and nothing is sent |
| NEW-auth-3 | — | Done | code | P2 | S | 2 | Change-password endpoint for signed-in users. Done: `POST /auth/change-password` and a working form on the profile page |
| NEW-auth-4 | — | Report wrong | code | P2 | S | 2 | Email change: report claims sessions end, code does not; no notice to the old address. Done: the report is corrected (an e-mail change does not end sessions) and the address the account leaves is e-mailed. Left: a link to undo the change |
| PRIV-4 | Partly fixed | Partly open | decision | P1 | M | 3 (#4) | Kitchen order views: show the customer's phone and door only while the kitchen itself hands the order over |
| NEW-priv-1 | — | Done | code | P1 | S | 2 | Kitchen still receives the customer's pin, postcode and user id through the order snapshot and GET /orders/:id |
| PRIV-6 | Partly fixed | Done | code | P2 | XS | 2 | Stop returning the seller's userId from public kitchen endpoints |
| MONEY-7 | Open | Open | approval | P2 | S | 3 (#11) | Reject a reused Idempotency-Key that comes with a different order body (also closes SEC-R6) |
| MONEY-8 | Fixed | Partly open | approval | P2 | XS | 3 (#11) | Drop the unused inventory_reservations table |
| BE-9 | Open | Open | approval | P2 | S | 3 (#11) | Drop the four unused models: UserActivityLog, SearchQuery, SellerBadge, SellerPayoutSchedule |
| DELIV-3 | Partly fixed | Partly open | decision | P1 | S | 3 (#5) | Let a map pin decide the community: stop area-name and home-community fallbacks from overriding a pin that falls outside every community |
| DELIV-4 | Open | Open | decision | P1 | S | 3 (#6) | Require a map pin for home delivery at the API (grace rule and how to measure) |
| INTEG-3 | Open | Done | code | P2 | XS | 2 | Refuse online-payment orders when Safepay is not configured |
| SEC-R5 | — | Done | code | P2 | XS | 0.5 (report) | Open job pool pin precision: already fixed by PRIV-2/AUTHZ-4; the Deliverable 4 row is stale |
| SEC-R7 | — | Open | decision | P2 | M | 3 (#10) | Audit log: redact free text in requestData and add a retention purge that works with the append-only trigger |
| NEW-priv-2 | — | Done | code | P2 | XS | 2 | Rider notifications keep the customer's street address after the job ends |
| PERF-1 | Partly fixed | Partly open | code | P2 | M | 3 (#20) | Bound the seller balance computation (dashboard, payout request, payout completion) |
| PERF-6 | Partly fixed | Partly open | code | P2 | S | 5 | Trim the product card to the fields the web app reads |
| CAP-4 | Partly fixed | Partly open | code | P2 | XS | 5 | Product card size (same work as PERF-6) |
| PERF-5 | Partly fixed | Done | code | P1 | M | 2 | A job is offered to the best rider first; pool events reach only riders on duty and the dashboard reloads only the list that changed |
| PERF-10 | Partly fixed | Done | code | P2 | XS | 0.5 (report) | Leading-status indexes: confirm deliveries(status) is not needed and close the item |
| FE-14 | Partly fixed | Partly open | code | P2 | S | 5 | Products page duplicate fetch: the ?search cause only happens in development (the report now says so); fix the real duplicate for signed-in users |
| INTEG-2 | Partly fixed | Done | code | P1 | S | 2 | Per-address bucket on the Next geocode routes |
| INTEG-6 | Partly fixed | Partly open | code | P2 | S | 5 | Clean up partial multi-size image writes |
| FE-11 | Open | Open | decision | P1 | S | 3 (#7) | Remove the plain-HTTP ip-api.com geolocation fallback |
| OPS-13 | Open | Open | decision | P1 | XS | 3 (#7) | IP geolocation with no configuration or off switch (closed by FE-11) |
| INTEG-7 | Open | Open | decision | P1 | XS | 3 (#7) | Uncached, unauthenticated IP proxy to ip-api.com (closed by FE-11) |
| OPS-10 | Partly fixed | Done | code | P2 | M | 2 | Pin GitHub Actions to commit SHAs and add a lint gate. Done: every action is pinned (the release in a comment) and `.github/scripts/check-pinned-actions.sh` fails CI on one that is not |
| D10-PRISMA7 | — | Report wrong | decision | P2 | S | 3 (#19) | Prisma CLI advisories: Prisma 7 does not fix them; remaining npm audit findings |
| D2-W4 | — | Open | decision | P2 | M | 3 (#17) | In-process scheduler and queue worker: add run flags now, a worker process later |
| D5-LOADTEST | — | Partly open | outside | P0 | L | 1 | Write and run the Deliverable 5 load test: seed, scenarios, socket harness and EXPLAIN file are written, tested and smoke-run (`docs/LOAD_TESTING.md`); the run on staging is left |
| NEW-ops-1 | — | Done | code | P2 | M | 0 | Commit the API flow scripts the report cites as evidence |
| NEW-fe-hub-1 | — | Open | code | P2 | XS | 5 | Hub console intake picker never shows the product photo |
| BE-1 | Open | Done | code | P2 | S | 2 | Backend ESLint config and a CI lint gate |
| BE-5 | Open | Done | code | P2 | S | 2 | One shared module for delivery status lists and the rider transition table. Done: the lists sit beside the table and the active one is derived from it |
| BE-6 | Open | Done | code | P2 | XS | 2 | Use one roundMoney helper instead of six private money() copies. Done (it never returns -0; the Safepay gateway uses it too) |
| BE-7 | Partly fixed | Done | code | P2 | XS | 2 | Remove the cart summary's placeholder deliveryFee/discount/total. Done with NEW-cart-fee: the summary holds `subtotal`, `totalItems` and `totalSellers` |
| BE-8 | Open | Done | code | P2 | XS | 2 | Delete the six unused exports (plus one new one). Done: seven are gone |
| BE-10 | Open | Done | code | P2 | S | 2 | Replace console.* with the structured logger. Done (the backend lint cap went from 167 to 110) |
| BE-11 | Open | Open | code | P2 | M | 5 | Split order.service.ts into placement, views, manual payments and chat |
| BE-12 | Open | Partly done | code | P2 | M | 5 | Type req.seller, drop the req casts, cut down `any`. Done: `req.seller` typed, `currentUserId(req)`, lint cap 91. Left: `any` in services and controllers |
| BE-13 | Open | Open | code | P2 | M | 5 | Move query/formatting out of controllers; one seller lookup |
| BE-14 | Open | Open | decision | P2 | XS | 3 (#14) | Remove (or quarantine) the unreferenced legacy scripts |
| BE-15 | Open | Partly done | code | P2 | XS | 2 | Unify maskPhone, numeric coercion and the cash-at-door rule. Done: `maskPhone`, `isCashAtDoor`/`cashAtDoor`, `finiteOrNull`. Left: the numeric helpers whose contracts differ on purpose |
| DELIV-11 | Partly fixed | Done | code | P1 | S | 2 | Mocked unit test for the delivery state machine |
| NEW-seller-enums | — | Done | code | P2 | XS | 2 | Enforce the seller profile enums the validator already declares. Done: business type, delivery modes, availability override, `HH:MM` cut-off (also never null where no column can hold it); meal categories stay free text until decision 15 |
| NEW-cart-fee | — | Done | code | P2 | S | 2 | Cart page invented a delivery fee and a Rs 800 free-delivery bar. Done: the page shows what `GET /cart/delivery-estimate` says (fee, `freeDeliveryThreshold`, `deliverySubtotal`), the bar only for a kitchen with such an amount, "calculated at checkout" with no estimate, and "Not available" for an address the kitchen does not reach; the estimate counts the dishes as checkout does |
| NEW-flow-scripts | — | Done | code | P2 | M | 0 | Bring the flow/56-64 API checks the report cites into the repo |
| FE-4 | Partly fixed | Partly open | code | P2 | XS | 5 | One promotion label helper and remove the last private copy of the discount maths |
| FE-5 | Partly fixed | Partly open | code | P2 | S | 5 | Make UserLayout a thin admin shell; drop the dead sidebar lists and 17 emoji icon keys |
| FE-6 | Open | Done | code | P1 | M | 2 | Make web ESLint green, fix the hook-rule errors, gate CI on lint |
| SEC-R9 | — | Done | code | P1 | XS | 2 | Web ESLint red (remaining-risk entry): closed by FE-6 |
| FE-7 | Open | Open | code | P2 | L | 5 | Type the API shapes the pages read and remove `any` (ratchet the lint gate) |
| FE-8 | Open | Open | code | P2 | L | 5 | One seller product form; split the largest single-component pages |
| FE-9 | Open | Partly done | code | P2 | M | 5 | One geocode/city module for reverse geocoding and city matching. Done: `lib/cities.ts` (list, Urdu names, matching), used by the address page and the kitchen sign-up. Left: the geocoder call and the form filling are still written out three times |
| FE-10 | Open | Open | decision | P2 | L | 3 (#13) | Server rendering and per-page metadata for the public marketplace pages |
| FE-12 | Open | Open | code | P2 | S | 5 | Zustand selectors where they actually reduce re-renders (cart and community) |
| FE-18 | Open | Open | code | P2 | XS | 5 | One button component: retire NurayButton |
| FE-20 | Open | Open | decision | P2 | S | 3 (#12) | No silent default community on GPS denial or when no community is near |
| NEW-web-1 | — | Done | code | P2 | XS | 2 | Address form defaulted the city to Karachi (also when the map named none) and the coordinate boxes called central Rawalpindi Islamabad. Done: `lib/cities.ts`; the city is typed text with suggestions, required on the address form, empty on sign-up |
| NEW-web-2 | — | Done | code | P2 | XS | 2 | Unit test runner for web lib helpers. Done: `npm test` (Node's own runner), in CI; the city module is the first suite |
| NEW-web-3 | — | Open | code | P2 | XS | 5 | The sign-up form asks for a "Hyperlocal Community" (preset to Askari 11) that is never sent to the server, so the page promises nearest kitchens on the strength of a field nothing reads: remove it, or send it if a use is found |
| MOBILE-1 | Open | Partly done | code | P1 | S | 2 | Accept Google id tokens on POST /auth/google: done and tested; native Google sign-in comes with the shell |
| MOBILE-2 | Open | Open | decision | P1 | S | 4 | iOS login under App Store guideline 4.8: hide Google on iOS, or add Sign in with Apple |
| MOBILE-3 | Open | Open | approval | P1 | L | 4 | Native push through FCM (Android, and iOS via APNs) next to web push |
| MOBILE-4 | Open | Partly done | code | P1 | M | 2 | One openExternal() helper for maps, documents and legal links: done for the web, the native branch waits for the shell and a device |
| MOBILE-5 | Open | Partly done | outside | P0 | XS | 1 | Set the legal identity build args after lawyer sign-off (the release guard is in: a reviewed build without them fails, a release tag is refused) |
| MOBILE-6 | Open | Done | code | P1 | S | 2 | Public help page with FAQ and support e-mail, no sign-in |
| MOBILE-7 | Open | Partly done | code | P1 | S | 2 | Serve assetlinks.json and apple-app-site-association from env: done, the values come once the accounts and signing certificates exist |
| MOBILE-8 | Open | Done | code | P2 | M | 2 | Safe-area insets on the fixed and sticky bars. Done: `--safe-*` variables from `env(safe-area-inset-*)` for the fixed top bar, the sticky headers and the bars under them, the corner pop-ups, the slide-over menus, the menu drawer and the bottom bars; nothing moves where there are no insets. A real device is still to be checked in the native shell |
| MOBILE-9 | Open | Open | decision | P1 | M | 4 | Decide how rider location works while the app is not in front |
| MOBILE-10 | Open | Open | decision | P2 | S | 4 | Capacitor in remote-URL mode: confirm the decision, navigation allow-list and offline page |
| MOBILE-11 | Open | Open | code | P2 | S | 4 | Token storage behind one store in api-client (native secure storage later) |
| MOBILE-12 | Partly fixed | Partly open | code | P2 | S | 4 | Mobile Playwright project and store assets (icons, feature graphic, screenshots) |
| DELIV-7 | Partly fixed | Partly done | outside | P0 | S | 1 | Device check of the position resume and wake lock (the automated resume test is in) |
| D8-CHECKLIST | — | Open | native app | P1 | XL | 4 | Capacitor shell for Android and iOS, and the Deliverable 8 pre-submission checklist |
| D8-TWA | — | Open | outside | P2 | M | 4 | Play-only Trusted Web Activity stop-gap (Bubblewrap) |
| NEW-push-1 | — | Done | code | P2 | S | 4 | A browser's push subscription stays with the first account that enabled it, even after sign-out. Done: logout forgets the account's subscriptions, the browser drops its own, and whoever signs in on a browser that has one takes it over |
| NEW-ugc-1 | — | Done | code | P1 | M | 2 | Reviews could not be reported or hidden, which the stores' user-generated-content rules require. Done: report (`POST /reviews/:id/report`), a staff queue and decisions (`/admin/reviews`: hide, keep, show again), hidden reviews out of every public page, count and rating, all audited; no schema change. Left: the author is not told, no appeal, and the order chat has no report or block |
| NEW-legal-1 | — | Open | outside | P1 | S | 1 | Privacy policy and store data declarations for the apps (rider live location, device identifiers) |
| NEW-addr-1 | — | Done | code | P2 | S | 2 | A customer could not enter a house number: no field in the address form, and the validator dropped it, so `house_number` stayed empty. Done (the first of the two options): the form has a house / building number field beside flat / floor, `POST` and `PATCH /users/me/addresses` take `houseNumber` (50 characters, trimmed), the list shows it, and the order snapshot and the rider and kitchen screens, which already read it, now have something to show. No schema change. If you would rather riders never see it, say so |
| NEW-priv-3 | — | Open | code | P2 | XS | 5 | Rider notifications stored before NEW-priv-2 still hold the street: a one-off scrub, only needed if production has such rows |
| NEW-admin-1 | — | Done | code | P2 | XS | 2 | `GET /admin/orders?sellerId=` took the kitchen owner's account id. It now takes the kitchen's own id, the one every row carries, and the old id still works |
| NEW-ops-2 | — | Done | code | P2 | XS | 2 | The error handler logged and reported every 5xx `AppError`, so the deliberate `GATEWAY_UNAVAILABLE` (no gateway configured) was reported like a crash. `AppError.expected(...)` marks an answer the system gives on purpose in a known state: logged as a warning, not reported. `SERVICE_BUSY`, `GOOGLE_UNAVAILABLE` and the 502s of failed third parties are still reported |
| NEW-perf-1 | — | Done | code | P1 | S | 2 | The rider dashboard's lists were heavy: `GET /riders/deliveries/mine` returned up to 200 jobs (about 120 KB and 57 ms of API time for a rider with 200 jobs) and 300 riders reloading every 30 s saturated one process (p95 4 to 5 s). It now returns the running jobs and the latest 30 finished ones (`?history=` up to 200; the history tab has "Show older deliveries"), the pool pop-up counts running jobs only, and the open-pool list no longer loads the customer: lists p95 0.8 to 1.2 s in the same run. Left: the lists still miss 300 ms with 300 riders on one shared process, so re-measure on staging |
| NEW-perf-2 | — | Open | approval | P2 | S | 3 | The dish search is a sequential scan of every dish (71 ms in the database at 10,000 dishes, p95 352 ms at 50 users, the only read over its target): a trigram index on the searched columns is a schema change, so it waits for your approval; re-run `explain.sql` after it |
| NEW-perf-3 | — | Done | code | P2 | XS | 2 | An exhausted database pool or a transaction out of time (Prisma P2024, P2028) answered a bare 500; it is now 503 `SERVICE_BUSY` with `Retry-After: 2`, still reported to error tracking |

Effort: XS under 2 hours, S half a day, M 1–2 days, L 3–5 days, XL over a week. The launch tasks found by the coverage pass (configuration, hosting, map provider, backups, staging, launch data, smoke checks, fonts, Dependabot) are in Phases 0 and 1 above without IDs.
