# Manual test checklist

A click-through checklist for testing Nuray by hand: one journey that crosses every role, then short per-role lists and
cross-cutting checks (Urdu, notifications, payments, delivery prices). Automated checks are described in
[TESTING_STRATEGY.md](TESTING_STRATEGY.md).

Menu names below are the sidebar labels in `frontend-web/components/layout/DashboardShell.tsx`. Every route was
checked against `frontend-web/app`.

## Setup

1. Backend and frontend running locally ([DEVELOPER_ONBOARDING.md](DEVELOPER_ONBOARDING.md)), database seeded with
   `npm run seed:e2e` (communities, 13 kitchens, a seller) and, for the demo accounts, `npx ts-node
   scripts/seed-ideal-flow-users.ts` from `backend/`.
2. Accounts ([ACCOUNT_CREDENTIALS.md](ACCOUNT_CREDENTIALS.md)): an admin (`node scripts/create-admin.js ...`), a seller
   with an approved kitchen, a rider, a customer. Use separate browser profiles (or one normal window plus private
   windows) so you can stay signed in as several roles at once.
3. Optional: `REDIS_URL` for live updates across processes. Without Redis, live updates still work in the single
   backend process.
4. In development, one-click demo accounts appear on `/login` (see accounts doc).
5. Online payment needs Safepay keys; without them it is simply not offered at checkout. Email in development goes to
   a throwaway Ethereal inbox and SMS to the console (`SMS_PROVIDER=console`), so read codes and links from the backend
   log.

## The single-order journey

One order from a brand-new dish to a delivered parcel. Do it in this order.

### A. Kitchen asks for a category, admin approves

1. Kitchen: `/sellers/products/new`, pick a product type, then click "Can't find your category? Request a new one".
   Fill the name (and Urdu name if you like) and send it.
2. Admin: `/admin/category-requests`. The request is pending. Approve it. Expected: "Category request approved and
   category created!" and the category now appears under `/admin/categories`.
   - Try Reject with a reason on a second request; no category is created.

### B. Kitchen lists a dish, admin approves it

1. Kitchen: `/sellers/products/new`. Choose the new category, fill name, price, unit, stock, photo, preparation time,
   save. Expected: the dish is in `/sellers/products` as pending moderation and is not visible to customers yet.
2. Admin: `/admin/products` (Kitchens > Dishes). Approve the dish. Expected: it is visible on `/products`.
   - Reject another dish with a reason; the kitchen sees it rejected and can edit at
     `/sellers/products/<id>/edit`.

### C. Customer finds the dish and checks out

1. Customer: sign in, set an address with a community at `/profile/addresses` (the address must resolve to a community
   the kitchen serves; see "Delivery prices").
2. `/products`: search for the dish name. Expected: it shows, name matches first. Try a typo ("biryni"); it still
   finds biryani when there are few exact matches.
3. Open the dish (`/products/<id>`), set quantity, add a note, Add to cart. `/cart` shows it. Adding a dish from a
   different kitchen is allowed (one cart can hold several kitchens); each kitchen's delivery fee is its own line.
4. `/checkout`: pick the address, a payment method, place the order. Expected: totals are whole rupees, the order
   appears in `/orders`, and a double-click on Place order creates one order.
5. `/orders/<id>`: status is waiting for the kitchen. Note the handover PIN card; only the customer sees the PIN.

### D. Kitchen accepts and prepares

1. Kitchen: a new-order alert appears live (push/in-app, SMS in production). `/sellers/orders` lists it; open
   `/sellers/orders/<id>`.
2. Accept. Expected: the customer's order page moves to confirmed/preparing without a refresh.
3. Mark ready. Expected: for Nuray delivery a rider job is created; for self-delivery the kitchen sees its own
   delivery actions instead and no rider job appears.
   - Separately test Reject on another order (pick a reason): stock returns and, if it was paid, a refund record is
     created.

### E. Rider claims, picks up, hands over

1. Rider: `/riders/dashboard`. Go on duty. Expected: the job shows in "Available Pool" with the pay shown on the
   Claim button. A rider over the cash limit is only offered prepaid jobs.
2. Claim. Then use the status buttons in order: arrived at pickup, picked up, in transit, arrived at customer. The
   rider's position appears on the customer's order page map while on the way.
3. At the door, the rider opens the handover dialog and types the customer's 4-digit PIN. A wrong PIN is refused.
   Correct PIN: "delivered".
4. Customer: the order shows delivered; leave a review at `/orders/<id>` (kitchen, rider, dish).
5. Rider: `/riders/earnings` shows the fee; for cash orders the cash held goes up.
6. Kitchen: `/sellers/earnings` shows the order. Admin: `/admin/riders` (Riders & cash) shows the rider's cash and pay;
   "settle up" when the cash is handed in; `/admin/payouts` for the kitchen's share of online and wallet payments.

## Per role

### Customer
- Register at `/register` (customer): works immediately. Email verification banner appears until verified
  (`/verify-email`, `/verify-email-pending`). Phone can be verified with an OTP from the profile.
- Login at `/login` by Email + password, by phone OTP, and Google (when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set).
- Browse: `/kitchens`, `/kitchens/<id>`, `/products`; add and remove favourites at `/favorites`.
- Cart conflicts, quantity limits, out-of-stock dishes are refused with a clear message.
- `/profile`: edit details, language (English / Urdu). `/profile/addresses`: add, edit, set default, delete.
- `/orders`, `/orders/<id>`: tracking, cancel (while allowed), chat with the kitchen, review.
- `/wallet`: balance, history, top-up through Safepay (needs keys).
- `/notifications` and `/notifications/settings`; `/support` tickets.
- Public pages: `/terms`, `/privacy`, `/refund-policy`.

### Kitchen (seller)
- `/register` as seller, then `/sellers/register`: community, GPS or location, business details, CNIC front and back,
  kitchen photos, payout accounts, terms. Submit. Status page shows pending.
- Admin rejects with a reason at `/admin/pending-sellers`; kitchen sees the reason on `/sellers/register`, fixes,
  resubmits; admin approves. After approval `/sellers/dashboard` is active.
- `/sellers/dashboard`: open/closed toggle. `/sellers/settings`: hours, payment details (bank, JazzCash, EasyPaisa).
- `/sellers/delivery`: tick communities, set fee, free-delivery threshold and minimum order per community, choose who
  delivers (Nuray riders or self), Save. Saving other communities without a fee for the home community is refused.
- `/sellers/products` (All Products, Inventory view, `/sellers/promotions` Discounts), `/sellers/analytics`,
  `/sellers/earnings`, `/sellers/notifications`.
- For a bank/mobile transfer order: confirm the receipt, or dispute it (disputed transfers go to admin).

### Rider
- `/register` as rider, then fill the application on `/riders/dashboard`: city, vehicle type, registration number,
  optional licence number, CNIC front/back, licence photo. Missing documents are refused. Status: under review.
- Admin: `/admin/riders?tab=applications` (also `/admin/riders/<id>`): view documents, approve or reject with a reason.
  A rejected rider fixes and sends again. An unapproved rider cannot see or claim jobs.
- Approved rider: duty toggle, available jobs, claim, status steps, PIN handover, `/riders/earnings`, location sharing
  (the browser asks for permission).

### Admin
- `/admin/login`, then `/admin/dashboard`.
- Orders: `/admin/orders` (filter "Transfers to check" for disputed payments), `/admin/orders/<id>`, `/admin/refunds`
  (wallet refunds are instant; manual ones wait until marked sent).
- Kitchens: `/admin/sellers`, `/admin/pending-sellers`, `/admin/products`, `/admin/categories`,
  `/admin/category-requests`.
- Riders: `/admin/riders`: cash held, settle up, payouts, adjustments, per-rider cash limit.
- `/admin/users` (People), `/admin/communities`, `/admin/promotions`, `/admin/payouts`, `/admin/support`,
  `/admin/analytics`, `/admin/audit-log`, `/admin/settings`.
- Admin screens are English only.

### Hub manager
- Admin: `/admin/hubs/manage`: create a hub, add a hub manager by email or phone (an existing customer account only),
  assign the manager to the hub.
- Manager: sign in again, `/hub` lists their hubs: batch intake with expiry, batch status, temperature logs, stock.
  Admin sees operations at `/admin/hubs`.
- Removing the manager role from the admin screen turns the account back into a customer.

## Cross-cutting checks

### Urdu and RTL
Switch language from the top bar and from `/profile`. The choice is kept in the `nuray_locale` cookie.
- `<html lang="ur" dir="rtl">` after a reload (view source), without a flash of English.
- Customer, rider and kitchen-order screens are translated; admin screens are not.
- Layout mirrors: sidebar and drawers open on the right, icons next to text swap sides, numbers, phone numbers,
  emails and prices stay left-to-right and readable, nothing is clipped or overflows horizontally.
- Urdu uses the Nastaliq font; check line height is not cramped and buttons do not truncate.
- Server-sent notification text (push, email, SMS) is English; that is expected.
- Switch back to English and confirm nothing stays mirrored.

### Notification settings
- `/notifications/settings` (customer, rider) and `/sellers/notifications` (kitchen): switch kinds and channels (in-app,
  push, email, SMS where offered) off and on, reload, confirm they persist.
- Trigger an event (place an order) with a channel off and confirm it is not sent on that channel but still lands in
  the in-app list.
- Push: allow notifications in the browser (needs VAPID keys); a device can be switched off.

### Payment variants
At `/checkout`, one order each:
- Cash on delivery: the rider collects cash; the rider's cash held increases after delivery; admin settles up.
- Online (Safepay): only offered when keys are set. The order reaches the kitchen only after the signed webhook
  confirms payment; abandon a payment and it expires (about 15 minutes sweep) and the order is cancelled.
  Return lands on `/payment/return`.
- Nuray wallet: top up at `/wallet`, pay with it; a cancelled paid order refunds into the wallet instantly.
- Bank / JazzCash / EasyPaisa transfer: pay the kitchen directly, submit the transaction id (and receipt); the kitchen
  confirms or disputes; a dispute appears under admin "Transfers to check".
- Cancel a paid order and check a refund record exists in `/admin/refunds`; refunds never exceed what was paid.
- A kitchen that does not accept within the timeout (default 30 minutes, `ORDER_ACCEPT_TIMEOUT_MINUTES`) has the order
  cancelled automatically with stock returned.

### Nuray delivery prices
Set up at `/admin/settings` ("Nuray delivery prices": per-km rate, included km, maximum distance, fallback base fee) and
`/admin/communities` (each community's fixed fee within it and its base fee for other communities; "Prices between two
communities").
With a Nuray rider delivering, place orders and compare the delivery fee at checkout:
- Same community: that community's fixed fee.
- A pair priced by admin: that price in both directions. Remove the pair and the distance price comes back.
- Any other community: the kitchen's community's base fee for other communities plus per-km beyond the included km,
  rounded up to Rs 10; beyond the maximum distance the kitchen is not deliverable ("Nuray riders deliver up to N km").
- Self-delivery: the kitchen's own fee and free-delivery threshold apply instead, and the fee is the kitchen's.
- An address that matches no community cannot order from a kitchen with community rules until a community is picked.
- Every order total is a whole number of rupees.
