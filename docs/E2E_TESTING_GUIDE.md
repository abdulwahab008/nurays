# FrozenNuray – End-to-end manual testing guide

A practical, click-through checklist covering every role and every page. For account setup (how to register
or bootstrap each role), see [`ACCOUNT_CREDENTIALS.md`](./ACCOUNT_CREDENTIALS.md) first — this doc assumes
you already have (or can create) a working account for whichever role you're testing.

Local URLs: frontend `http://localhost:3000`, backend API `http://localhost:3001/api/v1`.

---

## 0. Before you start

1. Both dev servers running (`npm run dev` in `backend/` and in `frontend-web/` — see
   [`DEVELOPER_ONBOARDING.md`](./DEVELOPER_ONBOARDING.md) for first-time setup).
2. At least one account per role you want to test — customer and seller are self-serve and instant; seller
   and rider both need an **admin** to approve them before they're fully functional, so create/have an admin
   account ready too if you're testing those roles from scratch.

---

## 1. Customer

| Use case | URL | What to check |
|---|---|---|
| Register / log in | `/register`, `/login` | Account created, redirected to dashboard on success |
| Home dashboard | `/dashboard` | Hero, "Hot deals" promo tiles, categories, active/recent orders |
| Browse & filter products | `/products` | Product type, Open Now, Delivery/Pickup Available, Free Delivery, Offers, meal category, dietary (Halal/Vegetarian/Vegan), business type (Home-Based/Restaurant), Accepting Pre-orders, Currently Busy, New Kitchens, Open 24/7, Within-X-km, Fast Delivery — each filter should visibly narrow the result count |
| Product detail | `/products/:id` | Price, images, reviews, variants (if any), allergens/dietary/ingredients/heating instructions, seller Open/Closed + Accepting Orders status, delivery fee/ETA/distance (only shown once you have a saved address with coordinates) |
| Cart | `/cart` | Add/update/remove items, subtotal updates |
| Checkout | `/checkout` | Address selection, delivery fee/GST shown before placing the order, promo code entry, payment method selection, order actually gets created |
| Order history & tracking | `/orders`, `/orders/:id` | Status updates as the seller/rider progress the order; cancel button only where the order is still cancellable |
| Profile & addresses | `/profile`, `/profile/addresses` | Add/edit/delete an address with coordinates (needed for delivery-fee/ETA display elsewhere); default-address selection |
| Notifications | `/notifications` | Order-status-change notifications appear |
| Support | `/support` | Contact form actually submits; ticket reply flow if you have a prior ticket |
| Reviews | on `/products/:id`, post-delivery | Leave a review only after an order for that product is delivered |

---

## 2. Seller

Register at `/sellers/register` (or the generic `/register` with the seller toggle) — **you won't see orders
or be fully functional until an admin approves you**; see §4 below.

| Use case | URL | What to check |
|---|---|---|
| Dashboard | `/sellers/dashboard` | Stats (products/active orders/pending/earnings/payout), recent orders, low-stock alerts |
| Orders | `/sellers/orders` | Filter tabs (All/Pending/Confirmed/Preparing/Ready/Dispatched/Delivered/Cancelled); Accept/Reject a pending order; advance an accepted order through its status sequence |
| Products | `/sellers/products`, `/sellers/products/new`, `/sellers/products/:id/edit` | Create a product (starts `pending` moderation, not visible to customers until an admin approves it in `/admin/products`); edit price/stock/variants; bulk update |
| Inventory | `/sellers/inventory` | Stock levels, low-stock alert thresholds |
| Business settings | `/sellers/settings` | **This is the big one** — operating schedule (24/7, fixed daily, per-day with multiple sessions/breaks/closed days), meal categories, manual availability override (Open/Closed/Busy/Vacation/Holiday/Accepting Pre-orders), home-kitchen features (order cutoff time, max daily orders, pre-order-only, advance-booking window, min prep time), delivery configuration (delivery/pickup modes, fee type — free/fixed/distance-tiered/zone-based — min order, free-delivery threshold), delivery zones (city/area/postal/radius/custom). Every one of these should be reflected back on the customer-facing product/filter pages. |
| Promotions | `/sellers/promotions` | Create a promo code, verify it applies correctly at customer checkout (percentage/fixed, usage limits, date range) |
| Analytics | `/sellers/analytics` | Sales figures actually match real order data (today/week/month/all-time), top products |
| Earnings & payouts | `/sellers/earnings` | Total earnings, pending payout, request a payout, payout history |
| Notifications | `/sellers/notifications` | New-order alerts appear |

---

## 3. Rider

Register via `/register` with the rider option (or the API — see `ACCOUNT_CREDENTIALS.md`) — same
admin-approval gate as sellers.

| Use case | URL | What to check |
|---|---|---|
| Dashboard | `/riders/dashboard` | Before approval: a blocked-state card, not the delivery lists. After approval: "Available Deliveries" (unclaimed pool) and "My Active Deliveries" |
| Claim a delivery | `/riders/dashboard` | Claim button moves it from Available into My Active as "Assigned" |
| Advance a delivery | `/riders/dashboard` | Assigned → "Mark Picked Up" → Picked Up → "Mark In Transit" → In Transit → "Mark Delivered"; each step should also move the underlying order's status forward |
| Report a failed delivery | `/riders/dashboard` | "Report Failed" (available from Picked Up or In Transit) prompts for a reason and moves it to "Failed Deliveries" — a terminal state; only an admin can recover it (see §4) |
| Completed deliveries | `/riders/dashboard` | Delivered orders show under "Completed" |

A delivery only exists once a seller has marked every item in a `home_delivery` order "Ready" — self-pickup
orders never generate a rider delivery job at all.

---

## 4. Admin

Log in separately at `/admin/login` (not the same form as the other three roles).

| Use case | URL | What to check |
|---|---|---|
| Dashboard | `/admin/dashboard` | Platform-wide stats: today's orders/revenue, pending orders, in-transit, avg order value, pending seller applications |
| Approve/reject sellers | `/admin/pending-sellers`, `/admin/sellers`, `/admin/sellers/:id` | Approve makes the seller fully functional; reject/suspend blocks them; this is a one-shot decision on the same application |
| Approve/reject riders | `/admin/riders` | Same one-shot approve/reject pattern; note the Reject button uses a browser prompt for the rejection reason |
| Orders | `/admin/orders`, `/admin/orders/:id` | View any order, cancel (only while in an early-enough status — cancellation is not possible once a delivery has been picked up), issue a refund, retry a failed delivery (only valid on `delivery_failed` orders — resets it back into the unclaimed rider pool) |
| Products | `/admin/products` | Moderation queue — approve/reject newly-submitted products before they appear to customers |
| Categories | `/admin/categories`, `/admin/category-requests` | Manage the category tree; approve/reject seller-submitted new-category requests |
| Payouts | `/admin/payouts` | Review and complete/fail seller payout requests |
| Analytics | `/admin/analytics` | Platform-wide sales/order metrics |
| Support | `/admin/support` | Respond to customer support tickets |
| Hubs | `/admin/hubs` | Manage hub/warehouse locations used for hub-fulfilled stock |
| Settings | `/admin/settings` | Platform-level configuration |

---

## 5. Cross-cutting things worth checking regardless of role

- **Realtime updates**: order status changes (seller action, rider action, admin action) should reflect for
  the customer without a manual refresh, via the WebSocket connection.
- **Notifications**: every order-status transition should generate a notification for the affected customer
  and/or seller.
- **Responsive/contrast**: the whole app was audited for dark-on-dark text and low-contrast UI as of
  2026-08-01 — if you spot any, it's a regression, not a known issue.
- **Role isolation**: a customer token should never be able to hit seller/rider/admin-only endpoints, and vice
  versa (403, not a silent success).

---

## Reporting issues

If you find a real bug while working through this, note: the exact URL/screen, the account/role you were
using, the steps, and what you expected vs. what happened — that's enough for someone else to reproduce it
without access to your session.
