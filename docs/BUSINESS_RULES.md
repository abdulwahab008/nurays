# Business rules

The rules that decide what customers pay, who gets what, and how things are ordered. Each rule gives the formula, the code that implements it, and where an admin changes it (if anyone can). Amounts are in Rs.

"Admin changes it" means a screen in the admin console (see `ADMIN_GUIDE.md`). "Code / env" means it can only be changed by a developer or through an environment variable.

## 1. Order totals and GST

Code: `backend/src/utils/pricing.ts` (`priceOrder`). The frontend mirrors it in `frontend-web/lib/utils.ts` (`orderTotals`).

```
goods  = subtotal - discount            (never below 0)
total  = round( goods + deliveryFee + goods x 0.05 )     // whole rupees
tax    = total - goods - deliveryFee                      // takes the rounding, always under Rs 0.50
```

- GST is 5% of the goods after discounts. Delivery is not taxed.
- The total is rounded to a whole rupee (cash has no paisa), and the GST line absorbs the rounding, so customer, rider and kitchen all see the same amount.
- If the tax would come out negative, the order is priced with tax 0 and total `goods + deliveryFee`.
- Discounts on orders are split across the eligible items in proportion to their price, to the cent, with the last item taking the remainder (`allocateDiscount`). Refunds of single items rely on these shares.
- The GST rate is a constant (`GST_RATE`). Code only.

### Discounts and who pays them

Code: `backend/src/services/order.service.ts` (`createOrder`), `promotion.service.ts`.

- Catalog deals are applied to item prices first. A promo code is applied after that, and the same promotion cannot be applied twice.
- A code that is unknown, switched off, expired, used up (in total or by this customer) or below its minimum order is **refused at checkout** (`INVALID_PROMO_CODE`, `PROMO_INACTIVE`, `PROMO_EXPIRED`, `PROMO_LIMIT_REACHED`, `PROMO_ALREADY_USED`, `MIN_ORDER_NOT_MET`), the same answers as `/promotions/validate`; the order is never placed at full price with a code the customer typed.
- Usage limits are re-checked inside the order transaction under a row lock on the promotion, so two checkouts racing each other cannot both use a one-per-person code or overshoot a total limit (codes and catalog deals alike).
- A percentage code: `eligible subtotal x value / 100`, capped by the code's maximum discount. A fixed code: its value. Never more than the eligible subtotal. The code must be active, inside its dates, over its minimum order and under its usage limits (total and per customer).
- A kitchen's own code only discounts that kitchen's items, and the kitchen funds it: commission and payout are worked out on the price after the discount.
- A platform code (admin, Promo codes screen) is funded by Nuray: the kitchen's payout and commission are unchanged.
- Cancelling an order releases its promo usage.

## 2. Commission

Code: `order.service.ts` (item commission), `admin.service.ts` (default setting), `ledger.service.ts`.

```
item.commissionAmount = item.totalPrice x seller.commissionRate / 100
item.sellerPayout     = item.totalPrice - item.commissionAmount
```

(With a kitchen-funded code, `totalPrice` is replaced by the price after the item's discount share.)

- The rate is stored per kitchen (`sellers.commission_rate`, schema default 15) and copied onto every order item when the order is placed. Changing a kitchen's rate later never changes old orders.
- Admin setting `commissionRate` (Settings, 0 to 100, default 15) is only read when a new kitchen is created (`auth.service.ts`, `seller.service.ts`). **Changing it does not change kitchens that already exist, and no admin screen edits an existing kitchen's rate.** That needs a database change.
- Commission is on food only, not on delivery or GST.

## 3. Delivery fees

Code: `backend/src/utils/deliveryFee.ts` (`getDeliveryFeeForSeller`, `platformDeliveryFee`), `backend/src/services/delivery-pricing.service.ts`. Called from `order.service.ts` once per kitchen in the order; the fees are snapshotted per kitchen in `Order.deliveryFeeBreakdown` (`sellerId`, `fee`, `provider`, `paidBy`).

**Who pays.** When a Nuray rider delivers, the **kitchen** pays Nuray the fee: the customer's delivery fee is Rs 0 (checkout shows free delivery), and the fee is stored on the order as `sellerDeliveryCharge` and taken out of the kitchen's earnings (sections 3d and 5). When the kitchen delivers itself, the customer pays the kitchen's own fee as before.

Pickup orders (`self_pickup`, `hub_pickup`) have no delivery fee. Home delivery needs an address; the address carries the buyer's community.

Who delivers is the kitchen's `deliveryProvider` (`platform` by default, or `self`). Stock from a hub is always delivered by Nuray (`forcePlatform`).

### 3a. Gates that apply first (both providers)

Based on the community the customer's address belongs to (`resolveCommunityDelivery`):

1. The address matches no community, and the kitchen has per-community terms or is own-community-only: refused ("couldn't match your address to a community").
2. The customer is outside the kitchen's community, and the kitchen turned off cross-community delivery (`allowCrossCommunity = false`) or the kitchen's community has `crossCommunityEnabled = false`: refused.
3. The kitchen has set terms for at least one community (`SellerCommunityDelivery`): those rows are the only places it delivers. A community with no enabled row is refused. The row's minimum order (or else the kitchen's `minOrderAmountForDelivery`) is enforced.

### 3b. A Nuray rider delivers (`deliveryProvider` is not `self`, or hub stock)

The kitchen's own fees and free-delivery offers do not apply. After the gates above:

1. If the kitchen has a `maxDeliveryDistanceKm` and the kitchen-to-customer distance is over it: refused.
2. If the kitchen has no community rows, its seller-wide minimum order applies.
3. The price (`platformDeliveryFee`), first match wins:

| Case | Price |
|---|---|
| Customer in the kitchen's own community | That community's fixed fee (`Community.deliveryBaseFee`, new community default Rs 100) |
| An admin priced this pair of communities | That pair price, the same both ways (`CommunityPairFee`). It also skips the distance limit. |
| Any other community | `ceil( (base + max(0, km - includedKm) x perKm) / 10 ) x 10`, so rounded up to the next Rs 10 |

For the "any other community" row:

- `base` = the kitchen's community's `crossCommunityBaseFee` (new community default Rs 150). If the kitchen's community is not known, `deliveryFallbackFee` (Rs 150).
- `km` = straight-line distance from the kitchen (or hub) to the customer's address. If either point is missing, the straight-line distance between the two community centres. If neither is known, no distance is charged (`extra` is 0).
- If `km` is above `deliveryMaxKm`: refused ("Nuray riders deliver up to N km from the kitchen"). A pair price is checked before this, so it is not limited.
- Same-community and pair prices are not rounded to Rs 10; they are the exact numbers an admin typed.

Example with the defaults (per km 20, included 3 km, max 20 km), base 150, 6 km: `ceil((150 + 3 x 20) / 10) x 10 = 210`.

Where admins change it:

| Value | Default | Where |
|---|---|---|
| `deliveryPerKm` | 20 | Settings, "Per km to another community" (0 to 1000) |
| `deliveryIncludedKm` | 3 | Settings, "Included km" (0 to 100) |
| `deliveryMaxKm` | 20 | Settings, "Farthest a Nuray rider delivers" (1 to 200) |
| `deliveryFallbackFee` | 150 | Settings, "Base fee when a kitchen's community isn't known" (0 to 5000) |
| Community fixed fee, cross-community base fee, cross-community on/off | 100, 150, on | Communities screen (0 to 5000) |
| Pair prices | none | Communities screen, "Prices between two communities" (0 to 5000) |

Pricing is cached in memory for 60 seconds per server process (`getPlatformDeliveryPricing`). The process that saves a change clears its own cache immediately; other processes pick it up within a minute.

### 3c. The kitchen delivers itself (`deliveryProvider = self`)

The kitchen's own terms apply. In order:

1. If the community gates in 3a produced an answer (the kitchen has per-community rows): the row decides. Minimum order (row, else seller-wide), then `freeAbove` (fee 0 when subtotal is at least that), else the row's `fee`. Nothing below applies.
2. Otherwise the seller-wide policy, first match wins:
   - farther than `maxDeliveryDistanceKm`: refused
   - `allowedPostalCodes` set and the address is not in it: refused
   - subtotal under `minOrderAmountForDelivery`: refused
   - subtotal at least `freeDeliveryThreshold`: Rs 0
   - within `freeDeliveryRadiusKm`: Rs 0
   - area or city in `freeDeliveryAreas`: Rs 0
   - `deliveryZones` defined: the matching zone's fee; an address in no zone is refused (defining zones means "this is all I cover")
   - `deliveryFeeType = fixed`: `deliveryFeeFixed`
   - `deliveryFeeType = distance`: the first tier with `distance <= maxKm` (`distancePricingTiers`), else `round(base + perKm x km)`; needs the distance
   - otherwise the platform default: Rs 100, or Rs 150 in Karachi, Lahore and Islamabad
3. Kitchens set these on their own side (seller delivery settings). Admins cannot edit them from the console.

### 3d. Who receives the delivery fee

Code: `utils/deliveryEarnings.ts`, `utils/paymentCustody.ts`, `ledger.service.ts`, `seller-balance.service.ts`.

| Delivered by | Fee goes to |
|---|---|
| Nuray rider | Nuray (ledger entry `delivery_fee`, revenue), **paid by the kitchen**: a `seller_delivery_charge` ledger entry takes it off what Nuray owes the kitchen, and the seller balance subtracts it from that order's earnings (`sellerPaidDeliveryFor`). The customer pays no delivery fee. The rider is paid separately by the rider rules in section 4, out of Nuray's pocket; the two numbers are not tied together. |
| The kitchen | The kitchen, no commission. If the kitchen collected the money itself (COD at its door, or a transfer into its account) it already holds it. If Nuray collected the money (wallet, Safepay), the fee is posted as a payable to the kitchen (`seller_delivery_fee`). |

If a kitchen's items on an order are all cancelled, a delivery fee the customer paid (self-delivery) is refunded with the items (section 6); a kitchen-paid fee is simply not charged. Orders from before this rule have no `paidBy` and keep the old behaviour (the customer paid the fee).

## 4. Rider pay, route bonus and cash limit

Code: `utils/deliveryFee.ts` (`calculateDeliveryFeeCorridor`), `services/rider.service.ts`, `services/rider-ledger.service.ts`.

### Pay for a job

```
distance     = straight-line pickup to drop-off, 1 decimal   (unknown if a location is missing)
standardFee  = max( 120, 100 + round(distance x 20) )         // distance counts 0 if unknown
minFloor     = max( 100, round(standardFee x 0.85) )
maxCeiling   = min( standardFee + 120, round(standardFee x 1.4) )
```

- A rider who claims a job is paid `standardFee`, or a number they ask for between `minFloor` and `maxCeiling` (outside that range the claim is refused, `BID_OUT_OF_BOUNDS`). The amount is fixed at claim time on `Delivery.riderFee`.
- `calculateDeliveryFeeCorridor` accepts a city and would use Rs 150 as the base in Karachi, Lahore and Islamabad, but both callers in `rider.service.ts` call it without a city, so the base is always Rs 100 in practice.
- All numbers are constants in code. No admin setting.

### Route bonus

A rider with exactly one active job who claims a second one whose pickup is within 1.5 km and drop-off within 2.5 km of the first job's gets a Rs 100 bonus (`ROUTE_BONUS`, `routeMatch`). It needs the locations of both jobs. It is stored in `Delivery.riderBonus` and paid together with the fee.

### Automatic assignment (dispatch)

Code: `utils/dispatch.ts` (rules), `services/dispatch.service.ts` (applies them). Nuray's riders are its own, each serving one community (admin: Riders, rider page, "Community served", `Rider.communityId`; usually 1 to 2 riders per community).

When a kitchen accepts an order, the job is assigned at once, with no accept step, to the first match of:

1. a rider already carrying exactly one job whose drop-off is in the same area (within 2.5 km, or the same community when coordinates are missing) and whose pickup is within 4 km (or the same community): one trip serves both. The route bonus (below) still needs the stricter 1.5 km / 2.5 km match;
2. a rider who serves the community the food is picked up in;
3. a rider who serves the drop-off community;
4. any rider with room.

Within a step, fewer active jobs first, then fewer deliveries today. Never chosen: a rider who is off duty, has two jobs, would pass their cash limit, or handed this job back. A rider who already has one job still gets new ones (up to two). Fee, bonus and `assignmentMode = 'auto'` are set on assignment; the rider gets a push and an in-app notification, and a pop-up with a chime on their screen (`delivery:offered`, `RiderNewJobNotification`). A job left in the open pool pops up a lighter alert only for riders who are on duty and have a free slot.

If nobody can take it, the job stays in the open pool (any rider may still claim it) and is tried again every minute, when a rider finishes a job, goes on duty, hands a job back, or an admin changes a rider's community. `AUTO_ASSIGN_ENABLED=false` turns assignment off (riders claim from the pool only).

### Limits

- At most 2 active jobs per rider.
- Cash limit: a rider cannot claim a cash (COD, unpaid) order if `cash already held + cash still to collect on their jobs + this order's total` is over their limit. Prepaid orders are always allowed. Default Rs 10,000 (`RIDER_CASH_LIMIT` env, `rider-ledger.service.ts`). An admin can set a per-rider limit from Rs 0 to Rs 1,000,000, or clear it to use the default (Riders, rider page, "Cash limit"). Jobs over the limit are listed last for that rider.

### Rider ledger

Every entry in `rider_ledger_entries` is signed so that the sum is what Nuray owes the rider.

| Entry type | Sign | When |
|---|---|---|
| `delivery_fee` | + | Delivery completed (`riderFee`) |
| `bonus` | + | Delivery completed (`riderBonus`) |
| `cod_collected` | - | Delivery completed on a cash order: the order total |
| `cash_deposit` | + | Admin records cash handed in |
| `payout` | - | Admin records a transfer, or pay kept from cash |
| `adjustment` | + or - | Admin correction |

```
balance  = sum of all entries            (> 0 Nuray owes the rider, < 0 the rider owes Nuray)
cashHeld = -(cod_collected + cash_deposit)
unpaid   = balance + cashHeld            (earnings not yet paid)
```

Rules enforced on the admin actions:

- Settle up: `cashHandedIn + keptAsPay` cannot exceed `cashHeld`, and `keptAsPay` cannot exceed `unpaid`. Keeping pay is stored as a `cash_deposit` plus a `payout` of the same amount.
- Pay by transfer: cannot be more than `balance` (what Nuray owes).
- Correction: any non-zero amount, a note is required.
- Amounts have at most two decimals and are at most Rs 1,000,000.
- Riders are told by push when a settlement or payment is recorded.

## 5. Who holds the money

Code: `utils/paymentCustody.ts` (`collectorOf`), stored in `Order.paymentCollectedBy`.

| Payment | Money is held by |
|---|---|
| Wallet, Safepay / card | Nuray |
| Bank, JazzCash, EasyPaisa transfer to the kitchen | The kitchen, once confirmed (by the kitchen, or by an admin) |
| Cash, kitchen delivers or customer picks up | The kitchen |
| Cash, Nuray rider delivers | The rider, who owes Nuray (rider ledger) |
| Cash, hub pickup | Nuray |

- Nuray holds it: Nuray owes the kitchen its payout.
- The kitchen holds it: the kitchen owes Nuray everything that is not its own (commission, Nuray's delivery fee, tax, refunds Nuray paid out). (A Nuray delivery fee is the kitchen's cost on every order, whoever holds the money.) Seller balance = payouts available to withdraw, computed in `seller-balance.service.ts`; it can be negative.
- Ledger entries (`ledger.service.ts`) are posted once, when an order is delivered and paid (or when a late transfer is confirmed): customer payment (net of refunds), seller earning, platform commission, Nuray delivery fee, and any self-delivery fee payable.

### Seller payouts

- **Cash orders a Nuray rider delivered are paid out when the rider has handed the cash in.** Cash handed in (`cash_deposit` entries, from an admin settlement) is counted against the rider's cash orders oldest first (`ordersWithCashHandedIn`); an order is covered once the deposits reach it. Until then the kitchen's share shows as `awaitingRiderCash` (earnings page: "released once the rider hands in the cash") and is not in the available balance. Online-paid orders are not held. Old cash orders with no rider cash entry count as covered.
- A kitchen requests a payout up to its available balance (`seller.service.ts`). The minimum is the admin setting `minPayoutAmount` (Settings, default Rs 1,000), unless that kitchen has its own row in `seller_payout_schedules`, which then wins (nothing in the app creates such rows).
- No further commission is taken at payout. Payout amounts are already net of commission.
- An admin marks a pending payout completed (optional transaction id) or failed (reason required; the amount returns to the kitchen's balance). Only pending payouts can be changed.

## 6. Refunds

Code: `backend/src/services/refund.service.ts`, `admin-order.service.ts`.

- Caps: a refund can never exceed what is still unrefunded. `remaining = total - sum of refunds not failed`; the amount is `min(requested, remaining)`. The order row is locked so two clicks or two admins cannot refund twice. A manual refund by an admin must be between 0 and the order total.
- How it is paid back:
  - Paid with the wallet: credited to the customer's wallet immediately, status `completed`.
  - Anything else (Safepay, transfer, cash that was collected): a `pending` refund the admin has to send by hand, then mark sent (with a reference), or dismiss.
- Cancelling a paid order refunds it fully through the same code. A transfer the customer reported but nobody confirmed (`payment_submitted`) also queues a refund, labelled "UNCONFIRMED TRANSFER - verify receipt first", so an admin can check the account and dismiss it if nothing arrived.
- Dismissing a pending refund sets it to `failed` (it stops counting). If nothing else stands on the order, the order's payment goes back to `paid` when its money had been confirmed (the kitchen keeps its earning), and to `failed` only for a transfer that never arrived.
- Order payment states: when a refund covers the whole total, the order goes to `refunded` (wallet) or `refund_pending` (manual); when the last pending refund is completed, `refund_pending` becomes `refunded`.
- Manual refund from the order page is only for orders that are no longer in flight (delivered, completed, failed, etc.). An order that is pending through in transit must be cancelled instead.
- Items cancelled by a kitchen on a paid order: refund = `sum( (item.totalPrice - item.promoDiscount) x 1.05 )` for those items, plus the kitchen's delivery fee once none of its items remain. Older orders without per-item discount shares use a proportional split of `total - deliveryFee`. If the whole order ends up cancelled, everything unrefunded is refunded.
- On an unpaid order that loses items, nothing is refunded; the order is re-priced from the remaining items (subtotal, discount shares, delivery fees of the remaining kitchens, GST, total).
- Customers are notified by push and email when a manual refund is marked sent.

## 7. Timeouts and automatic cancellation

Code: `backend/src/services/order-maintenance.service.ts` (`sweepStaleOrders`), scheduled in `backend/src/index.ts` every 2 minutes. Each cancel uses the normal admin cancel path, so stock, hub batches, promo usage, rider jobs and refunds are handled the same way.

| Rule | Default | Env |
|---|---|---|
| Kitchen has not accepted a `pending` order | Cancelled after 30 minutes | `ORDER_ACCEPT_TIMEOUT_MINUTES` |
| Non-cash order whose payment is `pending` or `failed`, order still pending, confirmed or preparing | Cancelled after 60 minutes | `ORDER_PAYMENT_TIMEOUT_MINUTES` |
| Customer reported a transfer (`payment_submitted`) and the kitchen has not confirmed or disputed it | All active admins are alerted once (push, email) after 6 hours | `PAYMENT_CONFIRM_ESCALATE_HOURS` |

Each pass handles at most 200 orders per cancel rule and 100 escalations. An order cancelled by the sweep records "cancelled automatically".

Other timers:

- Online (Safepay) payment attempts still pending after 2 hours are closed as expired (`online-payment.service.ts`, every 15 minutes).
- Expired one-time codes and reset tokens are deleted after 1 day (`purgeExpiredSecrets`, every 6 hours).
- Other scheduled jobs: stock alerts every 6 hours, hub batch expiry every hour, ranking scores every 15 minutes (see `backend/src/index.ts`).

Admin status changes: an admin moves an order exactly one step forward at a time (pending, confirmed, preparing, ready, dispatched, in transit, delivered, completed). Cancelling and refunding have their own actions. Only pending, confirmed, preparing and delivery-failed orders can be cancelled. An order whose money is being refunded cannot be marked delivered (`admin-order.service.ts`).

## 8. Ranking

Code: formulas in `backend/src/utils/ranking.ts` (pure functions), data in `backend/src/services/ranking.service.ts`. All constants are in code; no admin setting.

### Ratings (Bayesian average)

```
ratingScore = (5 x 4.0 + average x reviews) / (5 + reviews)
```

Every dish and kitchen starts as if it already had 5 reviews at 4.0. With 0 reviews the score is 4.0. Stored as `rating_score`, recomputed every 15 minutes and after each review.

### Trending

- Looks at order lines of the last 14 days (`TREND.windowDays`). Counted orders exclude cancelled, refunded, delivery-failed, unpaid online checkouts, and a kitchen ordering from itself.
- Each order counts `0.5 ^ (ageHours / 72)` (half-life 72 hours).
- Per customer, their orders count in full, then half, then a quarter, then nothing (weights 1, 0.5, 0.25).
- Nothing trends with fewer than 2 different customers (score 0).
- Kitchens: one event per order per kitchen. Dishes: per dish.
- Final score is multiplied by a quality factor: `0.5 + 0.5 x clamp((ratingScore - 2.5) / 2.5, 0, 1)` (x0.5 at 2.5 stars or less, x1 at 5 stars).
- Stored as `trend_score`; recomputed every 15 minutes.

### Search

`searchRankedProductIds`: dishes that are active and approved and match any term (up to 8 terms) in name, Urdu name or description. Relevance:

```
rel = (3 if name starts with the term, else 2 if name contains it)
    + 2 if Urdu name contains it
    + 0.5 if description contains it
    + trigram word similarity(term, name)
    + 0.05 x min(trend_score, 10)
```

Order: real (substring) matches first, then `rel`. Near-misses found by trigram similarity (threshold 0.5) are added only when there are fewer than 5 real matches.

### Recommended for you

Score per dish the customer has not ordered:

```
3.0 x similar customers   (overlap / sqrt(their dish count), divided by sqrt(customers who order the dish))
+ 1.0 x share of your orders from this dish's kitchen
+ 0.5 x share of your orders in this dish's category
+ 0.3 x trend score relative to the highest candidate
```

Top 12 are shown, each with the strongest signal as its reason. "Order again" ranks dishes the customer ordered in the last 365 days, with a 30-day half-life per order.

### Which delivery jobs a rider sees first

`jobScore` in `ranking.ts`, used by `rider.service.ts` (`getAvailableDeliveries`). Higher is first.

```
score = 100 if the job is along the route of the rider's active job
      - 8 x km to pickup                 (3 km if the rider's position is unknown)
      + 0.6 x minutes waiting            (capped at 45 minutes)
      + 0.5 x (riderFee / km)            (km = max(1, pickup km + trip km); riderFee = standard fee + route bonus)
```

A cash job the rider cannot take because of the cash limit scores `-1000 + 0.01 x minutes waiting`, so it sits at the bottom.

## 8b. Menus: fixed, weekly, daily

Code: `utils/menu.ts`; fields `Product.menuType`, `availableDays`, `menuDate`. "Today" is Pakistan time (Asia/Karachi).

| Type | The dish is on the menu |
|---|---|
| `fixed` (default) | always |
| `weekly` | on the days of the week the kitchen picked (`availableDays`, 0 = Sunday to 6 = Saturday; at least one) |
| `daily` | only on the date the kitchen put it on the menu (`menuDate`); a kitchen switches it on each day from its product list ("Put on today's menu") and it falls off at midnight |

Dishes not on today's menu are left out of listings, kitchen pages and recommendations; the product page says when it is available and disables ordering; adding to the cart, checking the cart and placing an order are refused with `NOT_ON_MENU_TODAY` (an order with a delivery slot is checked against the slot's day). The kitchen's own product list shows every dish.

## 9. Notifications

Code: `backend/src/services/notify.service.ts`, `backend/src/jobs/notify.jobs.ts`, `push.service.ts`, `sms.service.ts`.

- Every notification is stored in the person's in-app list and pushed live to their open tabs. Duplicates with the same `dedupeKey` are ignored.
- Each event also lists which extra channels it is worth: push, email, SMS. A channel is used only if the person's preference for that category allows it, the channel is configured on the server, and (email) the address is verified or (SMS) the phone is verified.
- Default preferences (people can change them in their own settings):

| Category | Push | Email | SMS |
|---|---|---|---|
| orders | on | on | on |
| payments | on | on | on |
| deliveries | on | off | off |

- Customers see `orders` and `payments`; riders `deliveries` and `payments`; others `orders` and `payments`.
- Customer order updates (`realtime-order.service.ts`): confirmed, picked up, on the way: push. Delivered: push and email. Cancelled and delivery failed: push, email and SMS. Refunded: push and email. Preparing, ready for a delivery order and completed: in-app only. "Order placed": email. A change the customer made themselves sends no alert.
- Kitchens get a cancellation alert (push, email) when they did not cancel it. A new order alerts the kitchen on push, email and SMS, but only once an online payment is confirmed.
- A disputed transfer tells the customer by push, email and SMS. Admin confirmation of a transfer, a sent refund and payout updates use push and email.
- Admins are alerted (push, email) to transfers unconfirmed for 6 hours.

## Limitations worth knowing

- Commission changes in Settings do not apply to existing kitchens (section 2).
- Rider pay never uses the city base rate (section 4).
- The delivery job is assigned when the kitchen accepts (food may still be preparing); a rider cannot pick up until the kitchen marks it ready, and holds one of their two slots meanwhile.
- Nuray's delivery fee and the rider's pay are independent numbers: a short trip priced by the community fixed fee can pay the rider more than the customer paid.
- Delivery-price cache is per process (section 3b).
