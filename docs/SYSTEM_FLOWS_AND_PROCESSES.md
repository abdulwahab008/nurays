# System flows and processes

Step-by-step descriptions of what Nuray does, as the code does it today. File paths are relative to `backend/src` unless noted. For the components behind these flows see [ARCHITECTURE.md](ARCHITECTURE.md).

Conventions: order, payment and delivery statuses are plain strings. Amounts are rupees (Rs); order totals are whole rupees. "Notify" means `notify()` from `services/notify.service.ts`: an in-app row plus a live socket event, plus push, email or SMS where the event asks for it and the person's preferences allow.

## Status reference

| Field | Values |
|---|---|
| `Order.orderStatus` | `pending`, `confirmed`, `preparing`, `ready`, `dispatched`, `in_transit`, `delivered`, `delivery_failed`, `cancelled`, `refunded`. `completed` is accepted when reading and in admin transitions, but no code path sets it; `delivered` is the normal end state. `confirmed` is rarely used: a kitchen accepting an order moves it straight to `preparing`. |
| `Order.paymentStatus` | `pending`, `paid`, `failed`, `payment_submitted` (customer sent a transfer receipt), `disputed` (kitchen says the transfer did not arrive), `refund_pending`, `refunded`. |
| `Order.deliveryType` | `home_delivery`, `self_pickup`, `hub_pickup`. |
| `Order.deliveryProvider` | `platform` (a Nuray rider) or `self` (the kitchen); null for pickups. |
| `Order.paymentCollectedBy` | `platform`, `seller`, `rider`: who physically holds the customer's money. |
| `OrderItem.status` | `pending`, `confirmed`, `preparing`, `ready`, `dispatched`, `in_transit`, `delivered`, `delivery_failed`, `cancelled`. |
| `Delivery.status` | `pending` (in the rider pool), `assigned`, `arrived_at_pickup`, `picked_up`, `in_transit`, `arrived_at_customer`, `delivered`, `delivery_failed`, `cancelled`. |
| `Seller.verificationStatus` | `pending`, `approved`, `rejected`. `Seller.status`: `active`, `inactive`, `suspended`. |
| `Rider.verificationStatus` | `pending`, `approved`, `rejected`. `Rider.status`: `active`, `suspended`. |
| `Product.approvalStatus` | `pending`, `approved`, `rejected`. |
| `Refund.status` | `pending`, `completed`, `failed` (a dismissed refund). `Refund.method`: `wallet`, `manual`. |
| `SellerPayout.status` | `pending`, `completed`, `failed` (and `processing` is counted in balances but nothing sets it). |
| `PaymentAttempt.status` | `pending`, `paid`, `duplicate`, `expired`. |

## 1. Sign-up and login

Roles: `customer`, `seller`, `rider`, `admin`, `hub_manager`. Admins cannot register; create one with `backend/scripts/create-admin.js`. Hub managers are existing accounts that an admin assigns to a hub.

### Register with email and password (`POST /auth/register`)

1. Email is lowercased and must be unique; password at least 6 characters. `userType` is `customer`, `seller` or `rider`.
2. Phone is optional. If given it is normalised and must not belong to an account that has verified it. If the caller also sends a `phoneOtp` (from `POST /auth/otp/request` with purpose `registration`), the phone is stored as verified; without it the phone is stored unverified. A verified OTP can take over a number held by an account that never verified it. With no phone, a placeholder `+999...` number is generated.
3. In one transaction the user and profile are created. A `seller` also gets a `Seller` row (`verificationStatus: pending`, commission rate from the `commissionRate` setting, default 15%). A `rider` gets a `Rider` row (`verificationStatus: pending`).
4. An email verification token (24 h) is stored and a `email.verification` job is queued. If queuing fails the response says `emailSendFailed` and the user can resend.
5. Access and refresh tokens are returned immediately. Registration is rate limited to 10 per hour per IP.

### Email verification

The link in the email carries the token; `POST /auth/verify-email` marks the token verified and `users.email_verified = true`. `POST /auth/resend-verification` (signed in) replaces the token and queues a new email. Verification does not gate login or ordering; an unverified email only means the email notification channel is unavailable and the app shows a banner. Changing the email on the profile resets `email_verified`.

### Login

- Email and password (`POST /auth/login`, method `email`): wrong user and wrong password return the same error, and a dummy hash is compared so timing does not reveal which emails exist. Suspended accounts get `403 ACCOUNT_SUSPENDED`.
- Phone OTP (`login` with method `otp`): `POST /auth/otp/request` (purpose `login`) sends a 6-digit code by SMS, valid 10 minutes. Limits: 60 s between sends, 5 codes per number per hour, 5 wrong tries per code. Only a phone-verified account can log in this way.
- Login is limited to 10 attempts per 15 minutes per IP.

### Google (`POST /auth/google`)

The client sends a Google access token. The server checks it with Google's `tokeninfo` endpoint (the token must have been issued to `GOOGLE_CLIENT_ID`) and requires `verified_email`. An existing account with that email is signed in and marked email-verified; if its email had never been verified, any password already set on it is cleared and old sessions are revoked (so nobody can pre-register a victim's email). Otherwise a new `customer` account is created with a placeholder phone. Without `GOOGLE_CLIENT_ID` it answers 503.

### Sessions

Access tokens last 24 h, refresh tokens 30 d. `POST /auth/refresh` checks the user is still active and the token not revoked. Password reset (`POST /auth/forgot-password` queues an email with a one-hour single-use link; `POST /auth/reset-password` consumes it) and admin suspension set `tokens_valid_after`, which invalidates every earlier token. Adding a phone to an existing account is `POST /auth/phone/request` then `/phone/verify`.

## 2. Kitchen application and approval

1. A kitchen applies in one of two ways: registering with `userType: seller`, or a signed-in customer posting to `POST /sellers/register` with business details, a home community, location, delivery modes, payout accounts (bank, JazzCash, EasyPaisa), photos of both sides of the CNIC (required) and up to six kitchen photos. Documents must be files that this user uploaded; the CNIC and kitchen photos are private files. The second route also sets `userType` to `seller` immediately.
2. The application is `pending`. A rejected application can be sent again (it goes back to `pending`); an existing non-rejected one cannot be duplicated.
3. While pending, the seller can open their studio (`blockSuspendedSeller` only checks `status`, not approval), edit their profile, and create dishes, but their dishes are not public. Endpoints behind `requireSeller` (category requests) need an approved seller.
4. An admin reviews (`GET /admin/pending-sellers`, `POST /admin/sellers/:id/approve` or `/reject` with notes). Approve sets `verificationStatus: approved`, `isVerified: true`, `status: active`, `userType: seller`. Reject sets `rejected`, `status: inactive` and stores the reason. Only a `pending` application can be decided. The code sends no notification here; the applicant sees the new status the next time the studio loads.
5. Later, an admin can set a seller `active` or `suspended` (`POST /admin/sellers/:id/status`). A suspended kitchen disappears from browsing and cannot use seller self-service routes.

### Rider application

A rider registers (`userType: rider`), then fills in vehicle details and CNIC (both sides) and licence photos (`PUT /riders/me/application`; the documents are private). An admin approves or rejects (`POST /admin/riders/:id/approve|reject`); approval is refused with `APPLICATION_INCOMPLETE` if details or documents are missing. Approve sets `verificationStatus: approved, status: active`; reject sets `rejected, status: suspended`. Until approved a rider cannot see or claim any job (`requireRider` in `services/rider.service.ts`).

## 3. Category requests

A kitchen that cannot find a category for its dish asks for one (`POST /category-requests`, approved sellers only; `services/category-request.service.ts`).

1. Rejected up front if the seller already has a pending request with the same name, or a category with that name and product type already exists. An optional parent category must exist and share the product type.
2. An admin lists pending requests and approves or rejects. Approve generates a unique slug, creates the `Category` (a sub-category when a parent was given) in the same transaction that marks the request `approved`, and notifies the seller ("Category approved", push). Reject stores the admin's reason and notifies the seller. A request can only be decided once.

## 4. Dish listing and moderation

1. An approved, non-suspended kitchen creates a dish (name, category, price, unit, stock, images, optional variants). It starts `approvalStatus: pending, isActive: false`.
2. An admin moderates from `/admin/products` (`POST /admin/products/:id/moderate`). Approve: `approvalStatus: approved, isActive: true`; reject: `rejected, isActive: false` with a reason. The kitchen is notified either way ("Dish approved" or "Dish not approved: <reason>", with push).
3. Editing an approved dish does not send it back for approval (the update keeps its approval status).
4. A dish is visible and orderable only when `isActive`, `approvalStatus = approved` and its kitchen's `status = active`. These conditions are checked again in the cart and at checkout.
5. Whether a kitchen is accepting orders right now is computed by `services/availability.service.ts` from its schedule (Pakistan time), manual override (busy, vacation, ...), order cut-off, daily cap and pre-order-only setting, and enforced at checkout.

## 5. Browsing and search

- **Community.** A buyer's community comes from the community picked on an address, GPS (`/communities/detect`), the area name on the address, or `POST /communities/me/primary`. Listing a community first shows that community's kitchens' dishes, then its neighbouring communities', then everyone else (`product.service.ts` `getProducts`). The kitchen's own delivery terms decide what can actually be ordered (see 6).
- **Filters** include category, price, dietary tags, stock and product type, delivery or pickup offered, open now, distance, fast delivery, free delivery, active deals, new kitchens.
- **Search** (`searchRankedProductIds` in `services/ranking.service.ts`): case-insensitive match on dish name, Urdu name and description; name-prefix matches rank above name matches above description matches; typos are found by trigram similarity (`pg_trgm`) but only added when there are fewer than 5 real matches.
- **Sorting.** Trending scores count recent orders with a 72 h half-life over 14 days; one customer's orders count 1, 0.5, 0.25 then nothing, and a dish or kitchen needs at least 2 different customers to trend. Cancelled and unpaid-online orders and a kitchen's own orders are left out. Ratings use a Bayesian average (prior 4.0 worth 5 reviews). Both are recomputed every 15 minutes by the `ranking-scores` sweep; ratings are also refreshed when a review is added. Formulas are in `utils/ranking.ts`.
- **Recommendations and "order again"** (`/products/recommended`, `/products/order-again`) are built from the customer's last 180 or 365 days of orders and from customers with overlapping orders.

## 6. Cart and checkout

### Cart (`services/cart.service.ts`)

- A cart holds one kitchen's items. Adding a dish from another kitchen fails with `CART_SELLER_MISMATCH` unless the client sends `clearAndAdd`, which empties the cart first.
- Each line stores a price snapshot; `GET /cart/validate` reports dishes that went inactive, stock shortages and price changes. `GET /cart/delivery-estimate?addressId=` returns the delivery fee for an address.

### Delivery fee (`utils/deliveryFee.ts`, `services/delivery-pricing.service.ts`)

For a home delivery the address needs a community (taken from the address or resolved from GPS/area). Then for the kitchen:

1. If the kitchen set per-community terms and this community is not among them, or the kitchen's minimum order for it is not met, the address is not deliverable.
2. If a **Nuray rider** delivers (kitchen's `deliveryProvider` is not `self`, or the stock comes from a hub): the fee is Nuray's. Same community: that community's fixed fee. A priced pair of communities: that price both ways. Otherwise the kitchen community's cross-community base fee plus `deliveryPerKm` (default Rs 20) beyond `deliveryIncludedKm` (3 km), rounded up to Rs 10, and not deliverable beyond `deliveryMaxKm` (20 km). The kitchen's own fee and free-delivery offers do not apply.
3. If the **kitchen delivers itself**: its own rules apply (per-community fee and free-above, free threshold, free radius, zones, fixed or distance fee), and the kitchen keeps the fee.
4. Pickups have no fee.

### Placing the order (`POST /orders`, `services/order.service.ts` `createOrder`)

Rate limited to 20 per 10 minutes per user.

1. **Idempotency.** The client sends an `Idempotency-Key` header (8-100 characters of `A-Za-z0-9_-`). The frontend makes one key per checkout attempt and reuses it if the request got no answer (timeout), and discards it when the server refused. A repeat with the same key for the same customer returns the order already placed (also when two identical requests arrive at once, via the unique `(customer_id, idempotency_key)` index). Orders have no key if the client sends none.
2. **Checks**, each with its own error code: customer exists; address belongs to the customer; each dish exists, is active and approved; the kitchen offers delivery or pickup as requested; variant active; enough stock; **one kitchen only** (`MULTI_SELLER_ORDER`); not the customer's own kitchen (`SELF_ORDER`); kitchen is open and accepting orders for the requested slot.
3. **Pricing.** Active seller-wide deals are applied to unit prices. Commission per item is the kitchen's rate times the item total. A promo code (entered by the customer) is checked for validity window, limits, minimum order and which items it covers; its discount is split across the eligible items to the cent. A kitchen's own code is funded by the kitchen (its payout shrinks); a platform code is funded by Nuray. Then `priceOrder` (`utils/pricing.ts`): GST 5% of goods after discounts, total rounded to whole rupees, GST line absorbs the rounding (always under Rs 0.50).
4. **Delivery provider** is snapshotted on the order: `self` only when the kitchen delivers itself and nothing comes from a hub; otherwise `platform`. A 4-digit handover code is generated.
5. **One database transaction** writes the order, items, status history (`pending`), decrements stock with a conditional update (a lost race fails the order with `INSUFFICIENT_STOCK`), allocates hub batches first-expiry-first for hub items, records promo usage (re-checking limits), and for a wallet order debits the wallet and marks it `paid` (`paymentCollectedBy: platform`). Order numbers are retried on clash.
6. **After commit** (failures here never fail the request): the customer gets "Order placed" (email); sellers get a live `order:new` event and a notification; admins get `order:new`; low-stock and out-of-stock alerts are raised in the background. The kitchen's alert says "New order received... please accept within 30 minutes" with push, email and SMS, except for online-payment orders still unpaid, where it says "awaiting payment, don't start yet" with no extra channels (the real alert is sent when payment arrives).
7. The current checkout page places `home_delivery` orders. The API also accepts `self_pickup` and `hub_pickup` (no fee; `hub_pickup` needs a hub).

## 7. Payment methods end to end

Accepted `paymentMethod` values: `cod`, `safepay` (or `card`, same thing), `wallet`, `jazzcash`, `easypaisa`, `bank`. `GET /payments/methods` lists them; `safepay` is marked unavailable when Safepay keys are not configured. A kitchen cannot hand the order over (`ready`, `dispatched`, rider `picked_up`) for any method except `cod` until `paymentStatus` is `paid`.

### Cash on delivery

1. Order starts `paymentStatus: pending`. The kitchen accepts and prepares as usual.
2. Who takes the cash is decided by `codCollectorOf` (`utils/paymentCustody.ts`): the rider for a Nuray delivery, the kitchen for self-delivery or `self_pickup`, the platform for `hub_pickup`.
3. At the handover (rider's `delivered` step with the customer's PIN, the kitchen's own `deliver` step, or an admin marking delivered), the order becomes `paid` with `paymentCollectedBy` set. A rider also gets a `cod_collected` ledger entry (see 12).
4. Cancelled before delivery: nothing was paid, so no refund is created.

### Online through Safepay (`services/online-payment.service.ts`)

1. The customer places the order with `safepay`. The checkout page then calls `POST /payments/process` which starts a hosted checkout session: a `PaymentAttempt` (tracker, amount fixed from the order total) is saved and the customer is redirected to Safepay. If this fails the order page offers "Pay now".
2. The order stays `pending` and the kitchen is not asked to start. Payment can be confirmed two ways, whichever comes first: the customer's return to `POST /payments/safepay/return` (authenticated by an HMAC signature of the tracker), or Safepay's webhook `POST /payments/safepay-webhook` (verified by `X-SFPY-SIGNATURE`). Both call `settleAttempt`, which locks the attempt and the order and settles it once.
3. Settled as `paid` (`paymentCollectedBy: platform`, `paymentMethod: safepay`) when the order is still payable and the amount is at least the current total. Then the kitchen is notified "New paid order... accept within 30 minutes" (push, email, SMS) and the customer "Payment received" (email). The customer lands on `/orders/<id>?payment=paid`.
4. Edge cases: if the order was already paid another way, or the amount is short, the payment is credited to the customer's wallet instead and the attempt is `duplicate`. If more than the current total was paid (items were cancelled meanwhile) the difference goes to the wallet. If the order was cancelled meanwhile, a refund is issued for the payment.
5. The `expire-payment-attempts` sweep marks sessions older than 2 hours `expired`; a late confirmation still settles.

### Nuray wallet (`services/wallet.service.ts`)

- **Top-up:** `POST /payments/wallet/topup` (Rs 100 to Rs 50,000, `WALLET_TOPUP_MAX`) starts a Safepay session with purpose `wallet_topup`; settling it credits the wallet and notifies the customer. Needs Safepay.
- **Pay:** choose `wallet` at checkout. The debit and the order are one transaction; insufficient balance or a locked wallet fails the whole checkout. Paid immediately, collected by the platform.
- **Refunds** to wallet-paid orders land back in the wallet instantly (see 10).

### Transfer to the kitchen (`jazzcash`, `easypaisa`, `bank`)

1. Order starts `pending`. `GET /orders/:id/payment-details` shows the kitchen's account details (JazzCash, EasyPaisa, bank).
2. The customer sends the money outside Nuray, then submits the reference number and optionally a receipt photo and sender details (`POST /orders/:id/submit-payment`, private file): `paymentStatus` becomes `payment_submitted` and the kitchen is told to check ("Check a payment", push and email).
3. The kitchen compares with its account and confirms (`paid`, `paymentCollectedBy: seller`) or disputes with a reason (`disputed`; the customer is told by push, email and SMS and can resubmit).
4. An admin can settle a disputed or unconfirmed transfer after checking with both sides (`POST /admin/orders/:id/confirm-payment`), which marks it `paid` (collected by the seller).
5. If the kitchen does not confirm or dispute within 6 hours (`PAYMENT_CONFIRM_ESCALATE_HOURS`), the `stale-orders` sweep notifies every active admin once.
6. The money is in the kitchen's own account, so the kitchen owes Nuray commission, tax and Nuray's delivery fee: this is netted against what Nuray owes the kitchen in the balance (see 11).

### Gateways other than Safepay

`gateways/` also contains bank, JazzCash and EasyPaisa adapters. Only Safepay is wired to the online checkout. The `bank` aggregator is used for `POST /payments/process` only when it is configured; otherwise the API tells the customer to pay by transfer from the order page.

## 8. Order lifecycle

Normal path for a Nuray-delivered order: `pending` -> `preparing` -> `ready` -> `dispatched` -> `in_transit` -> `delivered`.

| Step | Who | How | Rules |
|---|---|---|---|
| Place | Customer | `POST /orders` | Status `pending`. |
| Accept | Kitchen | `POST /seller/orders/:id/accept` | From `pending` or `confirmed` to `preparing`. Sets the estimated ready time from the dishes' preparation times (or the kitchen default, at least 15 min). Creates the rider job for Nuray deliveries (see 9). The customer is notified in-app only ("Order being prepared"). Does not check payment; handover does. |
| Reject | Kitchen | `POST /seller/orders/:id/reject` | Allowed until `ready`. Restocks, releases hub batches and promo usage, closes the rider job, refunds what was paid, status `cancelled`, `cancelledBy: seller`. |
| Ready | Kitchen | `POST /seller/orders/:id/ready` | From `confirmed` or `preparing`. Blocked with `PAYMENT_NOT_CONFIRMED` unless COD or paid. Makes sure a rider job exists. |
| Picked up | Rider | delivery `picked_up` | Order `dispatched`. Blocked until paid (non-COD). |
| On the way | Rider | `in_transit` | Order `in_transit`; the customer sees the rider on the map. |
| Delivered | Rider with PIN, or kitchen with PIN when it delivers or for `self_pickup`, or an admin | | Order `delivered`; COD becomes `paid`; ledger entries are written (see 11). |
| Delivery failed | Rider or self-delivering kitchen | with a reason | Order `delivery_failed`. Admin then either cancels (refund) or retries (see 10). |
| Cancel | Customer | `POST /orders/:id/cancel` | Only while `pending`. |
| Cancel | Admin or system | `POST /admin/orders/:id/cancel` | From `pending`, `confirmed`, `preparing`, `delivery_failed`. |

Admins can also push an order one step forward at a time (`PATCH /admin/orders/:id/status`; the sequence is `pending, confirmed, preparing, ready, dispatched, in_transit, delivered, completed`), but not to `cancelled` or `refunded` (those have their own endpoints) and not to `delivered` once the payment is refunded.

Kitchens can also cancel single items (`POST /seller/orders/items/:id/cancel`); an order with one kitchen is cancelled once nothing is left.

Every status change writes `order_status_history` and emits `order:status:update` to the order room, customer, kitchen, rider and admins. The customer gets an in-app notification for each status once; push for `dispatched`, `in_transit`, `delivered`, `delivery_failed`, `cancelled`; email also for `delivered`, `cancelled`, `refunded`; SMS for `delivery_failed` and `cancelled`. Kitchens are notified of cancellations they did not cause (push, email).

### Automatic cancellation (`stale-orders` sweep, every 2 minutes)

Each cancellation goes through the admin cancel path with `by: system`, so stock, hub batches, promo usage, the rider job and refunds are handled exactly as in a manual cancel.

- **Unpaid:** payment method not COD, `paymentStatus` `pending` or `failed`, status `pending`/`confirmed`/`preparing`, older than `ORDER_PAYMENT_TIMEOUT_MINUTES` (60). Reason "The payment wasn't completed in time."
- **Not accepted:** status still `pending`, older than `ORDER_ACCEPT_TIMEOUT_MINUTES` (30). Reason "The kitchen didn't confirm the order in time." This rule has no payment condition, so an online or transfer order that is still `pending` is cancelled at 30 minutes, before the 60-minute unpaid rule would apply.
- **Escalation:** see transfers above.

## 9. Delivery

### Navigation for the rider

Each active job card has a green **Start** button for the current leg: to the kitchen until the food is picked up, then to the customer. It opens Google Maps (the app on a phone) with turn-by-turn directions to the exact map pin, in two-wheeler mode. Accepting a job from the open pool opens the route to the kitchen straight away, and tapping "Depart with the order" opens the route to the customer. A job whose address has no pin shows a note to use the address text and call the customer.

### Who delivers

- **Nuray rider** (`deliveryProvider: platform`, always for hub stock): a `Delivery` row is created and posted to the rider pool.
- **Kitchen** (`self`): no `Delivery` row. The kitchen moves the order itself from its dashboard (`POST /seller/orders/:id/dispatch`, `/deliver` with the customer's PIN, `/delivery-failed` with a reason). It keeps the delivery fee it charged and takes COD cash itself.
- **Pickup:** `self_pickup` is handed over by the kitchen with the PIN, like self-delivery. For `hub_pickup` there is no counter-handover endpoint in the code; the kitchen route rejects it (not self-delivery) and hub managers only manage batches and temperature logs, so an admin marks it delivered.

### The rider job pool (`services/rider.service.ts`)

1. **Posting.** `ensureDeliveryForOrder` runs when the kitchen accepts (and again on ready, idempotently): for a live home-delivery order that needs a platform rider and has no job yet, it creates a `Delivery` with `status: pending` (pickup at the kitchen, drop-off at the address, coordinates where known) and emits `delivery:new` to riders. Riders can therefore see a job while the food is still being prepared, so they can travel to the kitchen in parallel.
2. **Listing** (`GET /riders/deliveries/available`). Only approved, active riders. Jobs are ranked by `jobScore` (`utils/ranking.ts`): jobs along the route of the one job the rider already carries, pickup closeness, waiting time, and pay per km. A cash job that would push the rider over their cash limit is flagged and ranked lower.
3. **Automatic assignment.** As soon as the job is created, `dispatch.service.ts` tries to give it to a rider (batching with a rider already going the same way, then the community's own riders, then anyone with room; rules in BUSINESS_RULES.md section 4). The rider is told by push and a live event. If nobody can take it, it stays in the pool and is retried every minute and whenever a rider frees up.
   **Claiming** from the open pool (`POST /riders/deliveries/:id/claim`) is the fallback, with the rider row locked:
   - the rider must be on duty (`RIDER_OFF_DUTY`);
   - at most 2 active jobs (`RIDER_CAPACITY_REACHED`);
   - the order must still be live and the job `pending`;
   - for an unpaid COD order, cash held plus cash still to collect plus this order must not exceed the rider's cash limit (default Rs 10,000, `RIDER_CASH_LIMIT`, adjustable per rider) or the claim fails with `CASH_LIMIT_REACHED`; prepaid jobs are always allowed;
   - the rider's pay is fixed now: the standard fee (city base rate plus Rs 20 per km, at least Rs 120) or the rider's own ask inside a corridor (about 85% of the standard fee up to +Rs 120 or 140%), otherwise `BID_OUT_OF_BOUNDS`. A route bonus is added when this job lies along the rider's one active job;
   - the claim is a conditional update, so two riders cannot both win (`ALREADY_CLAIMED`).
   Other riders get `delivery:removed`; the order's parties get `delivery:assigned`.
   The rider sees the customer's name, phone and exact spot (house, landmark, delivery note) only once the job is theirs and still running.
   Before picking the food up, a rider can hand the job back (`POST /riders/deliveries/:id/release`): it returns to the pool with the fee and bonus cleared. Pickup and transit are refused until the kitchen has marked the order ready (`FOOD_NOT_READY`). If an admin marks an order delivered, the rider's job is closed with it and their fee, bonus and cash entries are posted.
4. **Steps** (`PATCH /riders/deliveries/:id/status`), only the assigned rider, only these transitions:

   | From | To |
   |---|---|
   | `assigned` | `arrived_at_pickup`, `picked_up` |
   | `arrived_at_pickup` | `picked_up`, `in_transit`, `delivery_failed` |
   | `picked_up` | `in_transit`, `delivery_failed` |
   | `in_transit` | `arrived_at_customer`, `delivered`, `delivery_failed` |
   | `arrived_at_customer` | `delivered`, `delivery_failed` |

   Order status follows: `picked_up` -> `dispatched`, `in_transit` and `arrived_at_customer` -> `in_transit`, `delivered`, `delivery_failed`. Updates run in one transaction with the order row locked first; a cancel landing at the same moment wins and the rider gets `DELIVERY_CANCELLED` or `ORDER_ALREADY_TERMINAL`.
5. **Location.** While a job is active the rider's phone posts position (`POST /riders/deliveries/:id/location`, at most about 90 a minute; stored at most every 3 s). Once the food is picked up, each stored update is emitted as `order:delivery:tracking` to the customer. Coming within 150 m of the kitchen auto-moves `assigned` to `arrived_at_pickup`, and within 150 m of the customer auto-moves `in_transit` to `arrived_at_customer`.

### PIN handover (`services/handover.service.ts`)

Every order has a 4-digit code that only the customer is shown (never sent to anyone else; omitted from queries by default). Whoever hands the order over must enter it: the rider's `delivered` step, the kitchen's `deliver` step, or the pickup handover. A wrong code counts an attempt on the order; after 5 wrong attempts the code locks (`HANDOVER_LOCKED`) and an admin has to complete the handover. A seller cannot mark a Nuray-delivered order delivered (`PLATFORM_DELIVERY`).

### Delivery failed

The order becomes `delivery_failed` and the customer is told by push, email and SMS. An admin resolves it: `POST /admin/orders/:id/retry-delivery` (unassigns the rider, puts the job back in the pool as `pending`, order back to `ready`), or cancel with refund (see 10). An admin can also add a rider adjustment to pay for a failed job that was not the rider's fault.

## 10. Cancellation and refunds (`services/refund.service.ts`)

Whenever an order is cancelled (customer, kitchen reject, admin, or the sweep), one transaction: marks items `cancelled`, returns stock, releases hub batches and promo usage, closes the rider job (and tells the rider "Job cancelled"), and calls `issueRefund`.

`issueRefund` locks the order and refunds only money that was received:

- `paymentStatus: paid`: refund up to what is still unrefunded. Wallet-paid orders are credited to the wallet at once (`Refund.status: completed`, order `paymentStatus: refunded`). Safepay and all other methods create a `pending` manual refund and set `paymentStatus: refund_pending`.
- `payment_submitted` (a transfer reported but not confirmed): a `pending` manual refund is created, flagged "UNCONFIRMED TRANSFER, verify receipt first", because the customer may have paid.
- Anything else (COD never delivered, unpaid online): no refund.

Manual refunds sit in admin -> Refunds (`GET /admin/refunds`). The admin sends the money outside the system (Safepay dashboard, bank, JazzCash) and marks it done (`POST /admin/refunds/:id/complete`, with a reference); when every refund on a fully refunded order is complete the order's `paymentStatus` becomes `refunded`. If the money never arrived, the admin dismisses it (`/dismiss`, with a reason): the refund becomes `failed` and does not count as refunded. Nothing calls Safepay to move the money; refunds on gateway payments are always manual.

Other refund cases:

- A kitchen rejecting or cancelling items refunds those items' net payment (price minus their share of the promo, plus GST) and the delivery fee once none of that kitchen's items are left. On an unpaid order the order is re-priced instead.
- After delivery, an admin can refund part or all of a paid order (`POST /admin/orders/:id/refund`). While the order is still in flight it must be cancelled instead. Wallet orders fully refunded move to `refunded`; for other methods the order keeps its status with `paymentStatus: refund_pending`.
- A refund is always capped at the order total less earlier non-failed refunds.

The customer sees the outcome in the cancel response (`refunded_to_wallet`, `pending_manual_transfer` or `not_required`) and by notification ("Order cancelled", "Order refunded").

## 11. Order completion, ledger, seller balance and payouts

### Ledger (`services/ledger.service.ts`)

When an order reaches `delivered` and is `paid`, `recordOrderCompletion` writes immutable `ledger_entries` once (idempotent, order row locked): `customer_payment` (net of refunds), `seller_earning`, `platform_commission`, `delivery_fee` (only the part earned by Nuray riders), and `seller_delivery_fee` where a kitchen delivered itself and did not already hold the money. If a transfer is confirmed after delivery, the entries are posted then.

### Seller balance (`services/seller-balance.service.ts`)

Computed on demand from orders, not stored. For each delivered, still-paid order the kitchen's entitlement is its items' payout (already net of commission and of any discount the kitchen funded) plus any delivery fee it keeps.

- Money collected by the platform or a rider (wallet, Safepay, COD by a rider): Nuray owes the kitchen the entitlement.
- Money collected by the kitchen (transfers, COD at its own door or counter): the kitchen holds the whole total and owes Nuray the total minus its entitlement (commission, Nuray's delivery fee, GST, and refunds Nuray paid out).
- Cancelled or refunded orders earn nothing.

`available = platform owes seller - seller owes platform - completed payouts - pending payouts`. It can be negative: the kitchen then owes Nuray.

### Payouts

1. The kitchen requests a payout (`POST /sellers/me/payouts`: amount, method, account). Amount must be at least `minPayoutAmount` (default Rs 1,000, or the kitchen's own minimum) and no more than `available`. The balance is computed under a lock on the seller row, so two quick requests cannot withdraw the same money. A `pending` payout is created and counts against the balance at once. No commission is deducted again.
2. An admin sends the money outside Nuray and completes it (`POST /admin/payouts/:id/complete`, optional transaction id): status `completed`, the kitchen is notified. If it cannot be sent, the admin fails it with a reason (`/fail`): status `failed`, the amount returns to the balance, the kitchen is notified. Only `pending` payouts can be completed or failed.

## 12. Rider ledger and settle-up (`services/rider-ledger.service.ts`)

Each rider has signed `rider_ledger_entries`. The sum is what Nuray owes the rider (negative: the rider owes Nuray).

| Entry | Sign | When |
|---|---|---|
| `delivery_fee` | + | Delivery completed: the fee fixed at claim. |
| `bonus` | + | Same time, if the job had a route bonus. |
| `cod_collected` | - | Delivery completed and the rider took the customer's cash. |
| `cash_deposit` | + | Admin records cash handed in. |
| `payout` | - | Admin records pay sent. |
| `adjustment` | +/- | Admin correction (needs a note). |

Derived: `cashHeld = collected - deposited` (what the rider carries), `unpaid = balance + cashHeld`. Each delivery writes its entries at most once (unique `(delivery_id, type)`).

**Settle-up** (`POST /admin/riders/:id/settlements`, done in person at a hub): the admin enters cash handed in and how much of the cash held the rider keeps as pay. Recorded as `cash_deposit` for both, plus a `payout` for the kept part, so a rider holding Rs 5,000 and owed Rs 1,200 hands in Rs 3,800 and keeps Rs 1,200. Limits: total no more than cash held; pay kept no more than what is owed. Separate endpoints record a payout without cash (`/payouts`, no more than the balance), an adjustment, and a per-rider cash limit (`/cash-limit`; blank returns to the default). The rider is notified (push) of settlements and payouts. Riders see their balance and entries under `/riders/earnings`.

## 13. Reviews (`services/review.service.ts`)

1. Allowed once the order is `delivered` (or `completed`), only by its customer, once per order item.
2. A review carries a product rating, a kitchen rating, an optional delivery rating, a comment and photos; it is marked verified purchase and approved immediately (no moderation).
3. After saving, the dish's and kitchen's rating averages are recalculated, and the rider's rating too when a delivery rating was given and a Nuray rider delivered. Pickup orders have no delivery rating.
4. Reviews feed the Bayesian rating used for ranking at the next `ranking-scores` run (or the rating refresh on submit).

## 14. Notifications at each step

Channels in brackets: P push, E email, S SMS. Whether P, E or S is actually sent depends on the person's preferences per category (`orders`, `payments`, `deliveries`; defaults: all channels on for orders and payments, push only for deliveries), push being configured, and email/phone being verified. In-app and live delivery always happen.

| Event | Who | Message | Channels |
|---|---|---|---|
| Order placed | Customer | Order placed | E |
| Order placed | Kitchen | New order received (accept within 30 min) | P E S |
| Order placed, online unpaid | Kitchen | Awaiting payment, don't start | none |
| Safepay paid | Kitchen / Customer | New paid order / Payment received | P E S / E |
| Transfer submitted | Kitchen | Check a payment | P E |
| Transfer confirmed / disputed | Customer | Payment confirmed / kitchen couldn't find it | P / P E S |
| Transfer unconfirmed after 6 h | Admins | Payment not confirmed | P E |
| Kitchen accepts (`preparing`) | Customer | Order being prepared | in-app only |
| Ready (pickup orders) | Customer | Ready to collect | P |
| Picked up, on the way | Customer | Order picked up / on its way | P |
| Delivered | Customer | Delivered | P E |
| Delivery failed | Customer | Delivery unsuccessful | P E S |
| Cancelled | Customer / Kitchen | Order cancelled | P E S / P E |
| Refunded | Customer | Order refunded | P E |
| Wallet top-up, extra payment credited | Customer | Wallet topped up / credited | P E |
| Job posted | All riders | live `delivery:new` event | in-app only |
| Job cancelled | Assigned rider | Job cancelled | P |
| Settlement / payout recorded | Rider | Settlement recorded / Payment sent | P |
| Payout completed / failed | Kitchen | Payout sent / didn't go through | P E |
| Dish or category decision | Kitchen | Approved / not approved | P |

Every live order change also emits Socket.IO events (see ARCHITECTURE.md), which is what keeps open order pages and the rider job list current. Each notification type uses a `dedupeKey` so a retried action does not notify twice. Customers and kitchens can chat about an order (`/orders/:id/messages`, limited to 60 messages per 5 minutes); support tickets are separate (`/support/tickets`).

## Limitations worth knowing

- Refunds on Safepay, JazzCash, EasyPaisa and bank payments are tracked in Nuray but the money is sent by an admin by hand; payouts to kitchens and riders are likewise recorded, not transferred, by the system.
- Orders are one kitchen each. The root README describes carts with several sellers; the cart and `createOrder` both reject that. The per-seller `deliveryFeeBreakdown` and some seller-balance logic remain for older orders.
- `hub_pickup` orders have no counter-handover step in the code.
- The 30-minute accept timeout also applies to unpaid online and transfer orders still in `pending`.
- No notification is sent when an admin approves or rejects a kitchen or rider application.
