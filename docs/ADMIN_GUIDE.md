# Admin guide

For the people who run Nuray day to day. Every screen below lives under `/admin` (code: `frontend-web/app/admin/*`). All admin API routes require an admin account and every change (anything that is not a read) is written to the audit log. The numbers behind the rules mentioned here are in `BUSINESS_RULES.md`.

Sign in at `/admin/login`. The menu on the left is the list of screens below, in the same order.

## Dashboard

`/admin/dashboard`. A quick overview and the first seller applications.

- Cards: today's orders, today's revenue (paid orders only), pending orders, in transit, average order value (paid orders, last 30 days), and the number of category requests waiting. From `GET /admin/statistics` (`admin-order.service.ts`).
- Pending seller applications (first five): Approve or Reject straight from the card. Rejecting from here sends the reason "Rejected by admin"; use the kitchen's own page to write a real reason.
- Quick links to the other screens.

## Orders

`/admin/orders` and `/admin/orders/[id]`.

### List

Filter by order status, and by payment state: "Transfers the kitchen disputed" (`disputed`), "Receipts waiting for the kitchen" (`payment_submitted`), "Refund being sent" (`refund_pending`). The menu entry **Transfers to check** opens the list already filtered to disputed transfers.

### Order page: what you can do

- **Move forward one step.** Only the next step in order is offered: pending, confirmed, preparing, ready, dispatched, in transit, delivered, completed. You cannot skip steps. Marking "ready" creates the rider job. Marking "delivered" also marks a cash order as paid (collected by the rider or the kitchen, depending on who delivers) and posts the ledger entries. An order whose money is being refunded cannot be marked delivered.
- **Cancel** (reason required). Possible while the order is pending, confirmed, preparing or delivery-failed. Cancelling returns stock, releases the promo and hub stock, closes any open rider job, and refunds the customer if they had paid (wallet orders instantly; everything else goes into the refund queue). The kitchen and customer are notified.
- **Retry delivery.** Only for a failed delivery: the job goes back to the pool for any rider and the order returns to "ready". The alternative is to cancel and refund.
- **Transfer check.** For a bank, JazzCash or EasyPaisa order whose transfer is `payment_submitted` or `disputed`, the page shows the receipt and a **Confirm payment received** button (optional note). Use it after you have checked with the customer and the kitchen that the money really reached the kitchen's account. The order becomes paid, held by the kitchen, and the customer and kitchen are told. It cannot be used on a cancelled or refunded order, and it never overrides a payment that is already settled. If the order was already delivered, its ledger entries are posted at that moment.
- **Process refund.** Only for a paid order that is no longer in flight (delivered, completed and so on). Leave the amount blank for the full remaining amount, or enter a partial amount (between 0 and the order total; it is capped at what is still unrefunded). An order that is still in progress must be cancelled instead.
- **Refund list on the order.** Each pending refund can be marked sent (with a transaction reference) or dismissed (with a reason); see Refunds.

Status history, items, delivery, promo usage, delivery address and payment proof are shown on the page.

## Refunds

`/admin/refunds`. The queue of money Nuray owes customers that has to be sent by hand (wallet refunds are already done). Tabs by status; "pending" is the work list.

Each row shows the order, the customer's phone and email, the amount, the payment method, the sender account and reference the customer used (so you can send the money back the same way), and why it was created.

- **Mark sent.** Send the money first (bank, JazzCash, EasyPaisa, or the Safepay dashboard), then record it with the transaction reference. The customer gets a push and email. When every refund on a fully refunded order is complete, the order's payment becomes `refunded`.
- **Dismiss** (reason required). For a refund that is not owed, typically one marked "UNCONFIRMED TRANSFER - verify receipt first" where nothing arrived in the account. The refund is closed as failed and stops counting; if nothing else stands on the order, its payment becomes `failed`.
- Only pending refunds can be completed or dismissed; a second click gets "not pending".

## Kitchens and applications

### All kitchens: `/admin/sellers`, `/admin/sellers/[id]`

List filtered by approval (approved, pending, rejected) or status (active, inactive). A kitchen's page shows its details, uploaded documents, dish count and rejection reason, and offers:

- **Approve / Reject** (reject asks for an optional reason) for a pending kitchen.
- **Suspend / Reactivate** an approved kitchen. A suspended kitchen's storefront and dishes are hidden from customers. It does not cancel orders already placed.

### Applications: `/admin/pending-sellers`

Oldest first. Each application shows the owner, business and its documents (`components/admin/DocumentList.tsx`: opens each file through a short-lived private link). Approve makes the kitchen active and the account a seller account; reject records the reason (the applicant can send the application again with corrected details). Approval does not check that documents exist, so look at them first.

New kitchens get the commission rate from Settings at the time they register (see Settings).

## Dishes (moderation)

`/admin/products`. Every new dish starts as `pending` and is not visible to customers until approved. Filter: all, pending, approved, rejected.

- **Approve**: the dish becomes active and the kitchen is notified.
- **Reject** (reason optional, defaults to "Product rejected"): the dish is switched off and the kitchen gets the reason by push.

## Categories and category requests

### Categories: `/admin/categories`

Create, edit and delete categories (name in English and Urdu, description, parent for a subcategory, product type for top-level categories: frozen, fresh, ready to eat, ready to cook, active or not). Inactive categories are shown here but not to customers. A category with dishes, or with subcategories, cannot be deleted; switch it off instead.

### Category requests: `/admin/category-requests`

Kitchens can ask for a category that does not exist. Filter by status.

- **Approve** creates the category (active, with a generated unique web address, and the product type only for a top-level one) and tells the kitchen it can list dishes in it.
- **Reject** needs a reason, which is saved on the request and sent back to the kitchen.
- Only pending requests can be processed.

## Riders

`/admin/riders` has two tabs (`?tab=applications` for the second): **Riders & cash** and **Applications**.

### Applications

Pending riders with their vehicle details and documents (CNIC front and back, licence). Approval is refused until the vehicle details and all three documents are on file ("application incomplete"). Reject takes an optional reason. Until approved, a rider cannot see or claim jobs.

### Riders & cash

Approved riders, the ones carrying the most cash first. Search by name, phone, email or vehicle number; filter "Holding cash" or "Owed pay". The totals at the top are the cash riders are holding and the pay Nuray owes them. Each row shows cash held against the rider's limit and the balance ("owed to rider" or "rider owes"). **Settle up** opens the rider's page.

### Rider page: `/admin/riders/[id]`

All money actions are written to the rider's ledger and the rider is notified by push (rules and formulas: `BUSINESS_RULES.md`, section 4).

- **Settle up (cash handed in at a hub).** Count the cash the rider hands over. Enter "Cash handed in" and "Pay kept from cash". They can keep their unpaid pay out of the cash they carry; this is recorded as a payout. The page shows what the totals will be and blocks an amount larger than the cash they hold, or pay kept above what they are owed. "Fill in a full settle-up" does the usual arithmetic for you. Optional reference and note.
- **Pay the rider by transfer.** After sending a bank, JazzCash or EasyPaisa transfer, record it with the amount and transaction ID. It cannot exceed what Nuray owes the rider.
- **Correction.** A positive or negative amount with a required note, for example pay for a failed delivery that was not the rider's fault.
- **Cash limit.** Cash orders stop being offered once the rider holds this much. Enter an amount (Rs 0 to 1,000,000), or leave it blank to use the default (Rs 10,000 unless the server sets `RIDER_CASH_LIMIT`).
- **Suspend / Reactivate.** Suspending takes the rider off duty. Jobs they have not picked up yet go back to the pool. Jobs with food already on board stay with the rider and are reported back to you so you can resolve them from the order page.
- **History** lists every ledger entry with its type, amount, note and reference.

## People

`/admin/users`. Every account: filter by type (customers, kitchens, riders, hub managers, admins), search by name, email, phone or business name.

- **Suspend / Reactivate** an account. Suspending signs the person out everywhere and also suspends their kitchen or rider profile, so a suspended kitchen stops receiving orders; reactivating restores both.
- You cannot change your own account or another admin here. Closed accounts cannot be changed.

## Hubs and managers

Hubs are the central freezer stock locations.

- `/admin/hubs` ("Operations"): the hub operations console in admin mode (overview, intake, first-expiry-first-out stock and temperature tabs). See `HUB_OPERATIONS_MANUAL.md` for how to run a hub.
- `/admin/hubs/manage` ("Hubs & managers"):
  - Create or edit a hub: name, code (upper-cased, must be unique), city, area, address, capacity (cubic feet), freezer units, status (active, inactive, maintenance), contact phone, location on the map. Hubs are never deleted; set them inactive.
  - **Hub managers.** To make someone a hub manager, enter their email or phone: the account must already exist, be active, and be a plain customer account (not a kitchen, rider or admin, and with no rider application). They sign in again to use the role. Removing the role turns the account back into a customer and unassigns it from every hub.
  - **Assign a manager to a hub** (or clear it). Only an active hub-manager account can be assigned.

## Communities

`/admin/communities`. A community is a neighbourhood that buyers and kitchens belong to. Communities are never deleted; switch them off (isActive).

Create or edit: name, city, web address, optional description, **radius** (km, 0.2 to 50; addresses inside it belong to the community), centre (click the map), **neighbouring communities** (used to show nearby kitchens after own-community ones), and the delivery fields below. The list shows kitchens, members and addresses per community.

Delivery fields (all apply only when a **Nuray rider** delivers; kitchens that deliver themselves charge their own fees):

| Field | Meaning |
|---|---|
| Nuray delivery within this community (Rs, fixed) | The price for a customer in this community ordering from a kitchen in it. Default Rs 100. |
| From here to other communities: base fee (Rs, plus per km) | The base when a kitchen in this community delivers to another community. Default Rs 150. The per-km part comes from Settings. |
| Kitchens in neighbouring communities can deliver here | Switch off to allow only own-community kitchens to deliver here. A kitchen can also opt out for itself. |

### Prices between two communities

The component `frontend-web/components/admin/CommunityPairFees.tsx`, at the bottom of the page. Pick two different communities and a price. That price is used for Nuray-rider delivery between those two, in both directions, instead of the distance formula, and it ignores the maximum distance. Removing a pair price sends that trip back to the distance formula. Setting a price for a community with itself is refused (within a community its own fixed fee applies). Prices are 0 to Rs 5,000.

Changes take effect for new orders right away on the server that saves them, and within a minute everywhere.

## Promo codes

`/admin/promotions`. Codes that **Nuray pays for**, valid at any kitchen; the kitchen's payout and commission are not changed. (Kitchens create their own codes elsewhere; those are funded by the kitchen.)

Create a code: code (upper-case, no spaces), name for your records, % off or Rs off, optional maximum discount, minimum order, uses in total, uses per customer, start and end, description shown to customers, and optionally limit it to chosen dishes. Percentage cannot exceed 100 and the end must be after the start. You can switch a code off or on. A code that was never used can be deleted; once used on an order it can only be switched off.

## Payouts

`/admin/payouts`. Kitchens' withdrawal requests; filter pending, completed, failed, all. A kitchen can only request up to its available balance and not under the minimum payout (Settings), so the amount you see is already allowed.

- **Mark paid.** Send the money first, then mark it completed (optional transaction ID). The kitchen gets a push and email.
- **Mark failed** (reason required). The amount returns to the kitchen's balance, and the kitchen is told to check its payout details and ask again.
- Only pending payouts can be changed.

## Support

`/admin/support`. Customer support tickets; filter open, in progress, resolved, closed, all. Open a ticket to read the conversation, then reply and choose the status to set with the reply. Replying assigns the ticket to you; setting "resolved" records the time.

## Analytics

`/admin/analytics`. Platform totals from `GET /admin/analytics`: customers, kitchens, all-time orders and revenue, plus revenue and orders today, this week and this month, orders by status, and revenue by day. "Revenue" is the sum of totals of **paid** orders (money placed through the platform, not Nuray's income). Total commission (item commission on paid orders) is in the same response. The default window is the last 30 days.

## Audit log

`/admin/audit-log`. Every change made in the admin console, including attempts that were refused: who, what action on which record, the fields they sent (passwords, codes and tokens are redacted) and the outcome. Reading screens is not logged. Filter by area (orders, refunds, riders, kitchens, people, payouts, hubs, communities, promo codes, settings) or by a record id (for example an order id).

## Settings

`/admin/settings`. Saved to the `system_settings` table; a value never saved uses its default. Every change is audited.

| Setting | Default | Notes |
|---|---|---|
| Platform name, support email, support phone | Nuray, support@nuray.pk, +92-300-1234567 | Stored only. Nothing else in the backend or the customer app reads these three values. |
| Commission rate (%) | 15 | 0 to 100. Only used for kitchens that register **after** the change. Existing kitchens keep their own stored rate. |
| Minimum payout amount (Rs) | 1000 | Smallest withdrawal a kitchen may request. |
| Per km to another community (Rs) | 20 | 0 to 1000 |
| Included km | 3 | 0 to 100. No per-km charge up to this distance. |
| Farthest a Nuray rider delivers (km) | 20 | 1 to 200. Not applied to prices you set for a pair of communities. |
| Base fee when a kitchen's community isn't known (Rs) | 150 | 0 to 5000 |

The page shows a worked example. Cross-community delivery fee: `ceil((base + max(0, km - included km) x per km) / 10) x 10`, where base is the kitchen's community base fee from the Communities screen. A saved change drops the delivery price cache at once on the server that handled it.

## Limitations

- The commission rate cannot be edited per kitchen in the console.
- Dashboard "Reject" cannot record a reason; reject from the kitchen's page instead.
- Kitchens' own delivery terms (fixed fee, zones, free-delivery rules) are edited by the kitchens, not in the admin console.
