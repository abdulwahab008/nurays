# End-to-end test and exception-handling report

Run on 11 October 2026 against branch claude/epic-johnson-r4eep6 (pull request #38), commit dc72093. Linux sandbox: production builds of the API and the web app, PostgreSQL 16.14, Redis 7.0, Chromium driven by Playwright 1.60.

The whole app was walked one role at a time in a real browser (a visitor, a customer, a kitchen, a rider, a hub manager, staff and an administrator), then the same screens were opened while the API failed in seven ways, actions were repeated while the network failed, the API was attacked with hostile input, and PostgreSQL and Redis were switched off under a running API. A PDF with 552 screenshots was made from that run and given to the project owner; it is not kept in the repository because of its size. This file keeps the text of it: the results, every problem found and what was done about it, and what is left for the owner.

## Results

257 scenarios, 1840 of 1859 checks passing, 552 screenshots: 219 pass, 33 pass with a note, 5 fail. A "note" is the browser-console line a page writes itself when a failure is provoked on purpose, or a deliberate refusal. 5 failures belong to the "no data" trust test of the failure table (FI-hollow-C, FI-hollow-S, FI-hollow-R, FI-hollow-A, FI-hollow-H): a 200 answer whose data is null is something this API never sends, the pages that take it at its word say "empty" or show zeros, and it is noted as E2E-045 and not changed.

| Area | Scenarios | Pass | Pass with notes | Fail |
|---|---|---|---|---|
| Public pages and sign-in | 22 | 20 | 2 | 0 |
| Customer | 17 | 16 | 1 | 0 |
| Kitchen | 19 | 17 | 2 | 0 |
| Rider | 9 | 7 | 2 | 0 |
| Hub manager and staff | 8 | 8 | 0 | 0 |
| Administrator | 17 | 17 | 0 | 0 |
| Whole orders across roles | 23 | 23 | 0 | 0 |
| Urdu on a phone | 4 | 4 | 0 | 0 |
| Every page, desktop and phone | 92 | 92 | 0 | 0 |
| Pages under seven kinds of API failure | 35 | 10 | 20 | 5 |
| Actions under failure | 11 | 5 | 6 | 0 |

The checks that run on every change were green on the final code: 900 (86 suites) backend tests, 102 web unit tests, 444 API checks (against a running API and its database), 361 money-flow checks, and 7 continuous-integration jobs.

## How the testing was done

- **Screens.** Playwright drives Chromium on a desktop (1280 × 800) and a phone (Pixel 7, 412 × 915), against production builds of the API and the web app, a fresh PostgreSQL 16 database (migrations, then the CI seed, then one super-administrator) and Redis. Everything else is made through the screens. Each scenario states its steps and its checks; a check reads the words on the screen, the database, or the API's answer. Every page is also judged by the same rules: it opens; no text reads "undefined", "NaN", "[object Object]" or a raw error; no picture is broken; all visible text has a contrast of at least 3:1; nothing scrolls sideways; the console shows nothing unexpected.
- **Failures on screen.** Each page of each role is opened with one of seven failures switched on in the browser: the API cannot be reached; it answers 500; it answers 503; it answers 429; a proxy answers 502 with its own web page; the API answers 200 with something that is not JSON; it answers 200 with no data. A page passes when it tells the person in words what happened (and offers Try again where that helps); it fails when it is blank, still spinning, shows a raw error, crashes, or says the data is empty when it could not be read.
- **Failures during actions.** Placing an order when the server fails, when the answer is lost on the way back, and when the button is pressed twice; signing in; saving; paying; opening a page for something that does not exist.
- **Services away.** A separate API with its own PostgreSQL and Redis; each is stopped and started under the running API.
- **The API.** Every route as every kind of user, with hostile and malformed input, other people's ids, the same request twice at once, uploads that are truncated, mangled or hostile, Socket.IO events of the wrong shape, and forged payment callbacks.

What this cannot tell you: the payment gateway, SMS, e-mail, push and map services are not connected here (the app's handling of "not configured" and of a failing gateway was tested, the services were not), the sandbox blocks outside web addresses (Google sign-in, map tiles and web fonts were not loaded), only Chromium was used (Safari on iPhone and a low-end Android phone can differ), no screen reader was used, and load and long runs are outside it.

## When a service the API depends on goes away

This test ran on commit a2935f3; the API's code has not changed since (the later commits are the web app's).

| What was tried | Answer | Code |
|---|---|---|
| **Baseline: everything is up** | | |
| sign in | 200 in 184 ms |  |
| list dishes (public) | 200 in 45 ms |  |
| my notifications | 200 in 20 ms |  |
| health (ready) | 200 in 5 ms | ok |
| health (alive) | 200 in 7 ms | alive |
| GET /products?limit=1 | 200 in 22 ms |  |
| **Redis stopped while the API runs** | | |
| health (ready) | 200 in 6 ms | degraded |
| health (alive) | 200 in 3 ms | alive |
| sign in with a wrong password | 401 in 77 ms | INVALID_CREDENTIALS |
| sign in | 200 in 83 ms |  |
| list dishes (public) | 200 in 15 ms |  |
| one dish | 200 in 26 ms |  |
| my notifications | 200 in 10 ms |  |
| add a dish to the tray | 201 in 32 ms |  |
| read the tray | 200 in 30 ms |  |
| my addresses | 200 in 24 ms |  |
| place a cash order | 201 in 130 ms |  |
| the order and its notification in the database | 200 | order pending, 2 notification(s) |
| 30 wrong sign-ins in a row | 401 | all answered 401: the per-address rate limit is not enforced while Redis is down (it fails open) |
| health reports Redis healthy again, without restarting the API | 200 in 2017 ms | after 2.0 s |
| my notifications (Redis back) | 200 in 18 ms |  |
| **PostgreSQL stopped while the API runs** | | |
| health (ready) | 503 in 10 ms | unhealthy |
| health (alive) | 200 in 3 ms | alive |
| sign in | 503 in 13 ms | SERVICE_UNAVAILABLE |
| list dishes (public) | 503 in 10 ms | SERVICE_UNAVAILABLE |
| my notifications (valid token) | 503 in 8 ms | SERVICE_UNAVAILABLE |
| place a cash order | 503 in 9 ms | SERVICE_UNAVAILABLE |
| list kitchens (public) | 503 in 12 ms | SERVICE_UNAVAILABLE |
| the API answers normally again, without restarting it | 200 in 12172 ms | after 12.2 s |
| sign in (database back) | 200 in 81 ms |  |
| health (ready) after both are back | 200 in 4 ms | ok |
| the API process is still running (it was never restarted) | 200 in 2 ms | yes |

## Problems found

71 entries: E2E-nnn were found by walking the screens, SW-nnn by attacking the API, RS-nnn by reviewing what happens when a service the API depends on is slow or gone, TST-nnn is a flaw in the test tooling. "Fixed" means the change is on the branch with a test (a unit or API test, or a walkthrough check) and CI is green. Commits are named so that the change can be found with `git log`.

| ID | Severity | Where | What was wrong | What was done | Commits | Status |
|---|---|---|---|---|---|---|
| RS-001 | Critical | API: Redis | An unresponsive Redis stalled every API request (no command timeout) | A command with no reply within two seconds fails; the API keeps answering. | 549d1a2, a2d0121 | Fixed |
| SW-001 | Critical | API: realtime | A Socket.IO "leave:order" event with the wrong kind of argument crashed the whole API process (any signed-in user) | Events with wrong arguments are ignored; an exception inside a handler is logged, not fatal. | 844c1f6 | Fixed |
| E2E-033 | High | Handover | A wrong customer code left a self-delivered order "dispatched": the kitchen had moved it before the code was checked | The order, the payment and the code are checked in full before anything moves; a right code is idempotent. | 9b9fb4f | Fixed |
| E2E-035 | High | About 50 pages | With the API unreachable, failing or answering with a web page, more than 50 screens looked as if the data did not exist: "Your Tray is Empty", "0 Total Placed", a profile of "Not provided" that Edit then saved, zeros and made-up demo categories on admin pages, "All caught up" | One shared message block says what happened, with Try again; a web page where JSON was expected fails like a 5xx; every screen was re-tried in seven failure modes. | c5ff1b2, c4331f8, 5a77c75 | Fixed |
| E2E-036 | High | Admin: platform settings | The settings page showed defaults when the settings could not be read, and saving then replaced real values with them (a commission of 0 included); a save could be applied half; a box left empty was saved as 0 | The form appears only after the settings were read; boxes are checked against the server's limits; the save is all or nothing; the commission helper says it applies to kitchens that join after the change. | d570845, f35bf8f | Fixed |
| E2E-038 | High | Sign-in tokens, database | When the database did not answer while a token was checked, a good token was answered 401 INVALID_TOKEN, which signs people out; other database failures were 500 | Only a token that fails verification is 401; busy or unreachable database is 503 with Retry-After; a transaction conflict or a statement that ran too long is 503 SERVICE_BUSY. | 813e0ac, cc5a1ae | Fixed |
| E2E-047 | High | Kitchen settings, delivery settings | When the kitchen's own settings could not be read, the settings page and the delivery page still showed an editable form of blanks and made-up defaults with a Save button: saving it would have replaced the kitchen's real profile, payout accounts, delivery model, fees and opening hours (the delivery page would also have cleared its per-community fees) | There is no form until the settings were read: a "We couldn't load…" block with Try again stands in its place (and a short "Loading…" while they are being read). The delivery page also refuses to save while its community fees could not be read, and says so where the list would be. A browser spec checks that no box to type in is offered. | dc72093 | Fixed |
| RS-003 | High | API: shutdown | A graceful shutdown could take longer than its grace period | Idle keep-alive connections are closed as they go idle; the server exits 0 in time. | b8b32d4 | Fixed |
| RS-004 | High | API: database | No statement timeout: a query stuck behind a lock held its request as long as the lock lasted | A statement running longer than 30 seconds is cancelled and answered 503 SERVICE_BUSY. | a5ca40c | Fixed |
| RS-005 | High | API: storage | The S3 upload timeout only logged a warning and never aborted the request | The request is aborted when it outlasts its timeout. | e8d0d10 | Fixed |
| RS-006 | High | API: bank gateway | The bank API call had no timeout | Gives up after 15 seconds, as the Safepay calls do. | 8dd985b | Fixed |
| RS-007 | High | API: realtime | Socket events had no rate limit: one client could starve the database connections | More than 120 events a minute from one user are dropped. | a52d628 | Fixed |
| SW-002 | High | API | A NUL byte or lone surrogate in a path, query, body or file name reached Postgres and became a 500, and failed other users' requests batched with it | Refused with 400 INVALID_CHARACTERS before any route runs; a database refusal of such text is mapped the same way. | 226382a | Fixed |
| SW-003 | High | API: kitchens | A suspended kitchen could still edit variants and promo codes and upload photos | The suspended-kitchen guard is on those routes. | 6aa1732 | Fixed |
| SW-010 | High | API: sign-in | The administrator sign-in lock was a check-then-act race: forty simultaneous guesses were all compared | Each attempt is counted atomically before its password is checked. | e55f752 | Fixed |
| E2E-001 | Medium | Kitchen sign-up | A kitchen that signs up with "Cook & Sell" could never add its community, location or CNIC | A waiting kitchen now completes its application: the page lists what is missing and sends it again. | 135ee7c, afb7f1b | Fixed |
| E2E-002 | Medium | Admin: applications | An application with no community, no kitchen location and no documents could be approved | Only complete applications can be approved (the server refuses the rest, and the screen says what is missing). | 135ee7c | Fixed |
| E2E-003 | Medium | Admin: applications | "Reject" rejected at once with the fixed reason "Rejected by admin": no confirmation, and the kitchen was told nothing useful | A rejection asks for a reason (at least five characters) in a window, and the kitchen sees it. | 135ee7c, afb7f1b | Fixed |
| E2E-007 | Medium | Sign-in | After signing in, the person was not taken back to the page they had asked for | The page is carried in the sign-in address (only paths on this site are followed). | 9ca13c7 | Fixed |
| E2E-013 | Medium | Admin: categories | A category created in the admin screen had no product type, so no kitchen could choose it for a dish | The form asks for the kind of dish. | 810e2d3 | Fixed |
| E2E-014 | Medium | Deployment | Photo links in API answers use BASE_URL, which silently defaulted to http://localhost:3001 | Production refuses to start without the API's public https address. | 7e74af1 | Fixed |
| E2E-017 | Medium | Checkout | After an unknown promo code was refused, "Place order" still sent it and the server refused the whole order | A code that was not applied is not sent; the person is asked to apply or clear it. | 3ea29fb | Fixed |
| E2E-021 | Medium | Styling (whole app) | The global border and heading rules sat outside the CSS layers, so they beat every Tailwind class: coloured borders, heading sizes and button colours were ignored | The rules moved into a layer so classes win. | c9b731b | Fixed |
| E2E-023 | Medium | Dish page | "Add to Bag" and "Buy Now" still worked while the kitchen was closed (the kitchen's own page refused) | Both are refused on the dish page while the kitchen is closed. | 8fb167c | Fixed |
| E2E-025 | Medium | Kitchen: dish list | "Hide from store", "Publish to store" and the Product Status switch answered "updated" but changed nothing | They change what they say, and the list shows it. | 2fb0990 | Fixed |
| E2E-028 | Medium | Checkout | Typing a kitchen's own deal code showed a second discount in the checkout, and then the order was refused (PROMO_ALREADY_APPLIED) | The voucher preview gives the order's own answer. | 6cb6931 | Fixed |
| E2E-029 | Medium | Tray | A dish of a suspended kitchen could be added to the tray (from a page opened earlier or a saved link); the customer learned only at checkout | The tray answers 400 SELLER_UNAVAILABLE naming the kitchen. | 46a5102 | Fixed |
| E2E-030 | Medium | Notifications | The delete cross only hid the row until the next load; "Mark read" showed a success message when the server had refused; a block of preference switches did nothing | Delete is real (DELETE /notifications/:id); failures are shown; the dead switches are gone. | 4ca287d | Fixed |
| E2E-032 | Medium | Order page | A cancelled order did not say who cancelled it or why | The order page and the notification say who cancelled and the reason given. | e5b78c9 | Fixed |
| E2E-034 | Medium | Alerts | A message about what had just failed was shown behind the new-order and job alerts | Messages sit above the alerts and let clicks through. | 2654ebc | Fixed |
| E2E-039 | Medium | Kitchen payout accounts | The JazzCash, EasyPaisa and bank numbers customers pay into, and the account a payout is sent to, were stored as typed, and a stolen kitchen session could re-point them or send the whole balance to any account with no further question | A number must be a real one (mobile number; IBAN with check digits, or 8–20 digits); changing an account or asking for a payout asks for the password again (400 PASSWORD_REQUIRED, then the same request with the password). | 3654168 | Fixed |
| E2E-048 | Medium | About ten pages | Next to its error, a page still said something about the data it could not read: analytics "Rs 0 … 100% Excellent", kitchen dishes and promotions "0" counters and "Zero stockouts", saved addresses "0 / None", categories "0", the tray "Your dining cart is currently empty", both notification pages "No notifications yet / 0 unread", the dashboard "No dishes are listed yet", the rider bar "Vehicle: Not set … ON DUTY" | Each page shows the error alone (a dash for a small counter); a refresh that fails no longer empties the notification lists; the failure spec checks the customer and the kitchen pages for any such sentence, and the lint cap went down by five. | dc72093 | Fixed |
| RS-008 | Medium | API: storage | A failed local upload left its partly written temporary file behind | The file is removed. | 83ff782 | Fixed |
| RS-009 | Medium | API: jobs | A job added while the server was starting could skip the durable queue | The queue connection opens at start and a job that arrives meanwhile waits for it. | c8af0de | Fixed |
| SW-004 | Medium | API: payments | Safepay return with a bad tracker gave the customer a 500 in the middle of a redirect | The customer always lands on a page. | 1300d85 | Fixed |
| SW-005 | Medium | API: payments | The Safepay signature check accepted a valid signature with extra text after it | Anything after the signature is refused. | 1300d85 | Fixed |
| SW-006 | Medium | API: uploads | No cap on photos being decoded at once (memory spike) | At most two at a time. | 226382a | Fixed |
| SW-007 | Medium | API: deployment | X-Forwarded-For is trusted at face value when the API port is reachable directly (the default TRUST_PROXY) | Documented what the default allows and how to set it; the setting is the owner's to choose for their hosting. | 471ae6d | Noted |
| SW-008 | Medium | API: uploads | Malformed multipart bodies answered 500 instead of 400 | Answered 400. | 226382a | Fixed |
| SW-009 | Medium | API: uploads | A truncated image passed the header check and then failed as a 500 on decode | Answered 400. | 226382a | Fixed |
| E2E-004 | Low | Whole site | The 404 page was a dead end: no header, no links | A page with the brand and the places a visitor most likely wanted. | 88bc06d | Fixed |
| E2E-005 | Low | Dish page | The dish page did not link to its kitchen | The kitchen's name links to its page. | cb61f53 | Fixed |
| E2E-006 | Low | Forms | Forms showed the validator's own words ("Too small: expected string to have >=10 characters") | Messages name the field and say what is needed, in plain words. | f82bf91 | Fixed |
| E2E-008 | Low | Web build | The demo accounts' e-mail addresses and shared password were in the production JavaScript | Left out of the production build; CI fails the build if they come back. | bb569c5 | Fixed |
| E2E-009 | Low | Addresses | The "Cancel" button on the address form was white on near-white | Tailwind colour classes win over the button's base colours again (see E2E-021). | c9b731b | Fixed |
| E2E-010 | Low | Web metadata | A wrong API_INTERNAL_URL turned every dish and kitchen page into "Not found" and noindex | An unreachable API is told apart from a missing dish. | f5a5020 | Fixed |
| E2E-011 | Low | Favourites | A signed-out visit to /favorites called the API first and logged a 401 before the redirect | The page redirects before it asks the API for anything. | 9ca13c7 | Fixed |
| E2E-012 | Low | Kitchen sign-up | Kitchens that sign up with "Cook & Sell" were typed "restaurant" instead of "home kitchen" | A kitchen created at sign-up is a home kitchen. | e55f752 | Fixed |
| E2E-015 | Low | Admin: detail pages | An admin detail page opened with an id that does not exist showed an empty frame with no "not found" message | The page says the record was not found (checked by FA-07). | c5ff1b2, c4331f8 | Fixed |
| E2E-018 | Low | Order chat, ratings | Titles in dark window headers were dark text on a dark background | Text on dark and light surfaces was made readable, and the check runs in the walkthrough. | c9b731b, 3b1487b | Fixed |
| E2E-020 | Low | Accessibility | The orange active-menu label (3.0:1) and the small grey captions (2.6:1) were below the 4.5:1 contrast minimum; Tailwind v3 opacity classes (bg-opacity, text-opacity) were silently ignored by Tailwind v4 | Captions use readable greys on light surfaces; the ignored classes are replaced; a unit test fails if one comes back. | c9b731b, 3b1487b | Fixed |
| E2E-022 | Low | Admin: hub operations | On the administrator's hub screen the long page title and subtitle spilled out of the top bar | Fixed with the heading rule above; the walkthrough checks the page for sideways overflow. | c9b731b | Fixed |
| E2E-024 | Low | Kitchen: dish list | When a dish was under review, the filter chips squeezed the search box to a sliver | The toolbar wraps. | a299d4f | Fixed |
| E2E-026 | Low | Tray | The "Start order from a new kitchen?" window said "Previous Kitchen" instead of naming the kitchens | The answer carries both names; Buy Now handles the same conflict as Add to Bag. | 6cb6931 | Fixed |
| E2E-027 | Low | Whole app | Deleting and about twenty other actions used the browser's own confirm() and prompt() boxes (suppressed in many in-app browsers; a prompt shows a typed password in clear) | Questions are put in the page's own windows (a password is hidden). | f850ed2 | Fixed |
| E2E-031 | Low | Admin: dish moderation | A dish was turned down with the fixed words "Rejected by admin" and the kitchen was told only that; suspending a kitchen looked like deleting it | A rejection asks for a reason; suspend windows use the warning style. | a2aa697, 1c843e9 | Fixed |
| E2E-037 | Low | Dish page | A delivery time was shown for an address the kitchen does not deliver to | No estimate for an address out of range. | 3c6e83e | Fixed |
| E2E-040 | Low | Profile page | Signing out, or closing the account, from the profile page ended on the sign-in page with ?next=/profile instead of the home page (the page's own redirect won the race) | The page knows it signed the person out and lets them go to the home page; two end-to-end tests. | ccb9cb4 | Fixed |
| E2E-041 | Low | Order page | After an order is reviewed the page still offers "Rate Experience" and "Write a review"; sending again is refused politely ("You have already reviewed this order") and nothing is stored twice | Not changed: showing the review that exists needs the order API to carry it. A small improvement, noted. |  | Noted |
| E2E-042 | Low | Accessibility | More text that could not be read: Process Refund (white on amber-500, 2.1:1), Request Payout and its confirm button (white on emerald-500, 2.5:1), the rider's accept button, selected chips and badges, the order list's "rider dispatched" label (the brand orange on a pale orange tint, 2.8:1) and the grey Add Photo tile | Words on a coloured button use the 700 shade (5:1 and better), icon and number badges 600 (3:1 and better); a unit test fails when white text sits on a light saturated colour. | 5d662bd | Fixed |
| E2E-043 | Low | Sign-up | Reloading the "Check your e-mail" page while signed in but not yet verified bounced to the sign-in page (it redirected on its first render, before the stored session had been read) | Only someone with neither a session in the app nor a stored token is sent to sign in. | 16b5f49 | Fixed |
| E2E-044 | Low | Order page | A second attempt to review an order answered in the server's English words ("Review already exists"), also on the Urdu page | The page says "You have already reviewed this order" in the person's language. | eedbbb5 | Fixed |
| RS-010 | Low | API: Redis | A Redis outage wrote a stack trace to the log on every request | One warning a minute with a count. | 8faf8e9 | Fixed |
| SW-011 | Low | API: payments | Safepay webhook errors bypassed the standard answer shape | Answered in the usual shape. | 1300d85 | Fixed |
| SW-012 | Low | API: uploads | DELETE of an upload named "." was not refused | Refused. | 226382a | Fixed |
| SW-013 | Low | API: tokens | A token whose issue time is in the future is accepted (it needs the signing secret to make one) | Not changed: low risk, and a stricter rule could sign out people on a server with a wrong clock. See "Decisions that are yours". |  | Needs a decision |
| TST-001 | Low | Test tooling | The API check "a verified address does get a reset link" failed once in CI (the reset mail is made by a background job; 60 of 60 local runs passed) | The check waits up to 30 seconds for the job. | 0035d21 | Fixed |
| E2E-016 | Info | Database | Rider.userId has no foreign key to users: a user row deleted by hand would leave an orphan rider (no code path does this) | Not changed: it needs a schema migration. See "Decisions that are yours". |  | Needs a decision |
| E2E-019 | Info | Money | The 5% GST on an order is not posted in the ledger: per order the debits exceed the credits by the GST amount | Not changed: an accounting decision. See "Decisions that are yours". |  | Needs a decision |
| E2E-045 | Info | About a dozen pages | A 200 answer with no data in it (data: null) is taken at its word: those pages say "empty" or show zeros. This API never sends one, and a real failure (unreachable, 5xx, 429, a proxy's web page, a page instead of JSON) is handled everywhere | Not changed: telling an empty answer from a broken one needs a rule per endpoint, and a blanket rule would misread the answers that are empty on purpose. Listed as the last column of the failure table. |  | Noted |
| E2E-046 | Info | Kitchen and rider pages | A kitchen or rider that is not approved yet opens pages that ask endpoints which refuse them (403): the pages cope and show their application state, but the browser console lists the refused requests | Not changed: no one sees it. A small tidy-up would skip the call for an unapproved account. |  | Noted |

## Decisions that are yours

Nothing below was changed, because each needs a choice that is yours: a database change, an accounting rule or a product decision.

| Ref | What | Why it matters, and what changing it involves |
|---|---|---|
| E2E-016 | Rider.userId has no foreign key to users. | If a user row were deleted by hand (no code path does it), the rider row would be left pointing at nothing. Changing it is a database migration: add the foreign key riders.user_id to users.id, after checking that no orphan rows exist. It changes the schema, so it needs your approval. |
| E2E-019 | The 5% GST on an order is not posted in the ledger. | Per order, the ledger's debits exceed its credits by the GST amount, so a ledger report will not balance to zero per order. Changing it is an accounting decision first (which account holds GST payable, who owes it, when it is recognised), then a posting rule in the payment flow and a back-fill of existing orders. |
| Sessions (plan decision 1) | A refresh token can be used again and again until it expires; a stolen one is not noticed. | With rotation and reuse detection, using a stolen token after its owner has refreshed would sign both out and leave a trail. It needs the sessions and refresh-token tables of decision 1 in the plan (a schema change) and a change in how the web app refreshes. |
| SW-013 | A token whose issue time is in the future is accepted. | Making one needs the signing secret, so the risk is low. Refusing such tokens could sign people out if a server's clock is wrong, so a tolerance (for example five minutes) has to be chosen. It is a one-line change once you choose. |
| RS-004 | The 30-second database statement timeout is sent as a connection option. | It is not sent when the database address says pgbouncer=true or carries its own options. A pooled provider that refuses start-up options without saying so in the address would refuse every connection: then set DB_STATEMENT_TIMEOUT_MS=0 and put the timeout on the database role instead (ALTER ROLE ... SET statement_timeout). |
| SW-007 | TRUST_PROXY: the default trusts X-Forwarded-For when the API port can be reached directly. | A client could then pick the address the rate limiter sees. The deployment guide now explains the setting; the right value depends on your hosting (how many proxies stand in front), so it is yours to set. |
| Admin notes | When an administrator cancels an order with a note, the API returns that note in the order's status history to the customer, although the screen does not show it. | Whatever the API returns can be read by anyone who calls it. Decide whether such notes are for the customer or internal; if internal, taking them out of the customer's answer is a small change. |
| Refunds | "Record as sent" on a refund does not require the transfer reference. | Matching refunds against the bank later is harder without it. Requiring it is a one-line rule; it is optional today because a refund paid another way may have none. |
| Analytics | "Total Revenue" on the administrator's analytics is the total of paid orders (what customers paid), not the platform's own revenue (commission and fees). | A reader may take it for income. Rename it (for example "Sales") or compute the platform's revenue separately. |
| Commission | The commission-rate setting applies only to kitchens that join after it is saved; existing kitchens keep theirs, and there is no screen to change one kitchen's rate or all of them. | Changing the default changes nothing for anyone already on the platform. Changing it for existing kitchens needs an editor on the administrator's kitchen page and, for all at once, an "apply to all" action with an audit trail. |
| Rate limits | While Redis is away, the per-address rate limits (such as sign-in and one-time codes) are not enforced. | They are built to fail open so that nobody is locked out because a cache is down; locks on a single account fall back to each process's memory. If you prefer safety over availability for sign-in, it can fail closed for sign-in only, at the cost of nobody signing in while Redis is down. |
| Payout accounts | Accounts that sign in without a password (a phone code or Google) are not asked to confirm when they change payout accounts or ask for a payout, because they have no password. | A stolen session of such an account can still re-point the accounts. A fresh one-time code to the phone would close it; that needs the SMS provider connected. |
| Payout accounts | Payment instructions for an order that is not paid yet show the kitchen's current account, so changing an account moves where those customers are told to pay. | Customers who already saw the old number may send money to it. Either keep the account on the order when it is placed (a new column: a schema change) or warn the kitchen while it has unpaid transfer orders. |
| Translations | Parts of the kitchen's screens (Settings, for example), the legal pages and the texts the server writes (notifications) are English only. | A customer or kitchen who reads only Urdu sees English there. It needs the translations and a rule for texts the server writes. |
| Legal pages | The privacy, terms and refund pages are drafts with bracketed placeholders such as "[support email]". | They need your company's details and a lawyer's review before launch; the app cannot fill them in. |
| Accessibility | About twenty hand-made windows do not declare role="dialog" and aria-modal (the shared windows do). | A screen reader does not announce them as windows. Converting them to the shared windows is mechanical work. |
| Brand colour | The brand orange (#FF5500) with small white text has a contrast of 3.2:1, below the 4.5:1 that small text needs. | A design decision: use a darker orange for small text and buttons (#D14000 reaches 4.7:1), or accept it for large and bold text. |

## Repeating it

With PostgreSQL 16 and Redis running:

```bash
cd backend && npm ci && npx prisma migrate deploy && npm run seed:e2e   # a database with the CI seed
npm run build && node dist/index.js                                    # the API
cd ../frontend-web && npm ci && NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1 npx next build && npm start

# the checks that run on every change
cd backend && npx jest && npm run api-checks && npx ts-node scripts/verify-money-flows.ts
cd frontend-web && npm test && npx playwright test
```

The browser walkthrough that produced the screenshots is not part of the repository.
