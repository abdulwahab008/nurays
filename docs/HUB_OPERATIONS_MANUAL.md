# Hub Operations Manual

A hub is a cold-storage centre that holds frozen stock for kitchens. Stock sits in the hub as **batches** (one product,
one batch number, one expiry date). This manual is for hub managers and the admins who set hubs up. It covers only
what the system does today.

Code: `backend/src/services/hub.service.ts`, `backend/src/services/hub-allocation.service.ts`,
`backend/src/utils/hubStock.ts`, `backend/src/services/admin-places.service.ts` (hub setup),
`backend/src/services/admin-people.service.ts` (hub-manager role), `backend/src/routes/hub.routes.ts`,
`frontend-web/components/hubs/HubOperationsConsole.tsx` (the console), `frontend-web/app/admin/hubs/manage/page.tsx`.

## Who does what

| Who | Where | Can do |
|---|---|---|
| Admin | Admin → Hubs → **Hubs & managers** (`/admin/hubs/manage`) | Create and edit hubs, switch them off, give accounts the hub-manager role, assign a manager to each hub |
| Admin | Admin → Hubs → **Operations** (`/admin/hubs`) | The same console a manager uses, for any active hub |
| Hub manager | **My hubs** (`/hub`) | Run the console for the hubs assigned to them, and only those |

A hub with no manager is run by admins until one is assigned. The backend enforces this: every console endpoint
(`/hubs/:id/stats`, `/batches`, `/intake`, `/batches/:batchId/status`, `/temperature-logs`) checks that the caller is an
admin or the hub's assigned manager, and refuses with `HUB_ACCESS_DENIED` (403) otherwise
(`HubService.assertHubAccess`).

## Setting up (admin)

### Create or edit a hub

Admin → Hubs → Hubs & managers → **New hub** (or **Edit** on a row).

| Field | Rule |
|---|---|
| Name, Code, City, Area, Street address | All required. The code is upper-cased, spaces become dashes, and it must be unique (`HUB_CODE_TAKEN`). |
| Location | Required: click the map or drag the pin. |
| Capacity (cu ft) | Required, 1 to 1,000,000. |
| Freezer units | 1 to 500 (default 1). |
| Status | `active`, `maintenance` or `inactive`. |
| Contact phone | Optional. |

Hubs are never deleted (orders and stock point at them). To stop using one, set its status to `maintenance` or
`inactive`. Effects of a non-active status:

- New batches cannot be received there (`HUB_INACTIVE`).
- It disappears from the public hub list (`GET /hubs`, active hubs only), and so from the admin **Operations** console,
  which loads that list. Its assigned manager still sees it in `/hub`.

The hub's location matters for pricing: when an order line names a hub, the delivery fee is calculated from the hub's
position, not the kitchen's (`backend/src/services/order-placement.service.ts`, delivery fee section).

### Make someone a hub manager

1. Ask them to sign up as a normal customer first.
2. Admin → Hubs → Hubs & managers → **Hub managers**: enter the email or phone of their account → **Make hub manager**.
3. They must sign in again (their existing sessions are ended).

Only an active, plain **customer** account can become a hub manager. Sellers, riders, admins and anyone with a rider
application are refused (`ROLE_NOT_ALLOWED`).

**Remove role** turns the account back into a customer, takes it off every hub it ran, and signs it out.

### Assign a manager to a hub

In the Hubs table, pick a manager in the hub's **Manager** drop-down (or "No manager (admins run it)" to clear it). The
manager must be an active hub-manager account (`INVALID_MANAGER`). One manager can run several hubs; each hub has at
most one manager.

## The hub console

Hub managers open `/hub`; admins open Admin → Hubs → Operations. If a manager has no hub yet, the page says so and
there is nothing to do until an admin assigns one. If a manager runs several hubs, a selector at the top switches
between them.

The console has four tabs.

### Overview

Headline numbers for the selected hub:

| Card | Meaning |
|---|---|
| Core temperature | The last reading recorded (by an intake or a probe). Green at -18.0 °C or colder, red above. |
| Sellable units | Total units in batches with status `available`. |
| Active batches | Number of `available` batches. |
| Quarantined | Number of batches with status `damaged` (the console calls this "Quarantined"). |
| Expiring < 7 days | Batches whose expiry is 1 to 7 days away. |

Below that: capacity (cu ft), freezer units and the temperature compliance rate (share of the last 50 readings that
were not alerts).

Notes on what the numbers are not:

- **Utilisation %** is the hub's stored `currentUtilization` field. Nothing in the code updates it, so it stays at
  whatever it was set to (0 for a new hub).
- When the hub has never had a reading, the temperature card shows a placeholder value, not a real measurement.
- "Operating hours: 24/7" is fixed text in the page.

### Intake (receiving stock)

Use this every time a kitchen drops off frozen stock.

1. **Product**: pick from the list. It shows frozen products from the catalogue (first 100 returned by
   `GET /products?productType=frozen`). The seller is always taken from the product.
2. **Batch number**: type the number on the delivery, or press **Auto-generate batch ID**. Required, up to 100
   characters.
3. **Quantity** (packs): a positive whole number.
4. **Storage location** and **Barcode**: optional free text.
5. **Manufacturing date** (optional, not in the future) and **Expiration date** (required, must be in the future;
   +30/60/90/180-day shortcuts are provided).
6. **Measured temperature**: probe the delivery and enter the reading in °C. Required.
7. Confirm.

What happens:

| Reading | Result |
|---|---|
| -18.0 °C or colder | Batch saved as `available` (sellable). |
| Warmer than -18.0 °C | Batch saved as `damaged` (quarantined) and an alert temperature log is written. It is never sold until someone releases it. |

Every intake also writes a temperature log, updates the hub's current temperature, and writes an inventory log entry
(`stock_in`, or `expired` for a failed intake).

**Receiving more of a batch that already exists** (same hub, product and batch number): the quantity is added to the
existing batch, and the batch keeps the **earlier** of the two expiry dates. Rules:

- A failed (warm) delivery cannot be merged into an existing batch: log it under a new batch number
  (`BATCH_EXISTS`). This stops a bad delivery from quarantining good stock.
- A good delivery does not release a quarantined batch; the batch stays quarantined until someone releases it.
- A batch on manual hold (`reserved` with stock) stays on hold; an emptied batch (quantity 0) reopens as `available`.
- An expired batch cannot take more stock: use a new batch number (`BATCH_EXPIRED`).

### FEFO queue (the batch list)

All batches in the hub, sorted by expiry date, earliest first (first-expired, first-out). Each row shows the product
and kitchen, batch number and barcode, expiry with days left (or "Expired"), quantity, storage slot, status, and an
action button. Filters: All, Sellable, Quarantined, Expiring soon (7 days); the search box matches batch number,
product, barcode or kitchen.

Actions:

- **Quarantine** (on an `available` batch): moves it to `damaged`. It is immediately excluded from sale. Enter the
  reason; it goes into the inventory log.
- **Release** (on any other batch): moves it to `available`. Rules enforced by the backend:
  - An expired batch can never be released (`BATCH_EXPIRED`).
  - Releasing a quarantined batch needs a written reason of at least 5 characters (`REASON_REQUIRED`).

The API also accepts `reserved` and `expired` as target statuses (`PATCH /hubs/:id/batches/:batchId/status`); the
console offers only Available and Quarantined.

### Temperature

Record routine probe readings here: pick the freezer unit (1 to 3 in the form; the API accepts 1 to 100), enter the
reading, and **Log probe reading**. A reading warmer than -18.0 °C is flagged as an alert. Each reading updates the
hub's current temperature.

The tab shows the readings count, alert count, compliance rate and average for the last 50 readings, and a table of
those readings (time, unit, temperature, pass/alert).

A probe reading does not change any batch. If a freezer is found warm, quarantine the affected batches yourself in
the FEFO queue.

The "Audit notes" field is accepted by the API but not stored anywhere; put anything important in the batch status
reason instead.

## Which stock is sold

A batch is sellable only when **all** of these hold (`backend/src/utils/hubStock.ts`):

- status is `available`,
- quantity is above 0,
- expiry is **more than 24 hours away** (frozen goods about to expire are not offered).

The product must also be approved and active (and, for the public inventory, the kitchen active). This is what the
public hub list (`GET /hubs`, product counts), the public hub inventory (`GET /hubs/:id/inventory`), the cart's hub
stock check, and order allocation use.

So a batch can show as `available` in the console but not be sold, if it expires within 24 hours. Treat that as
"pull from the shelf".

## Hub-fulfilled products and orders

### How a product becomes a hub product

When a kitchen creates or edits a product (Seller studio → product form → **Fulfillment method**), it picks
`stockType`:

| stockType | Label in the form |
|---|---|
| `direct` | Direct delivery (the kitchen's own stock) |
| `hub` | Via hub |
| `both` | Either |

On the product page the customer chooses hub or direct delivery; the cart line and order line keep that choice
(`CartItem.stockType`, `OrderItem.fulfillmentType`). Variants are always direct: hub stock is tracked per product, not
per variant (`backend/src/services/cart.service.ts`).

### What happens when an order includes hub stock

For each order line with `fulfillmentType = 'hub'` **and** a `hubId` (`backend/src/services/order-placement.service.ts`):

1. Units are taken from that hub's sellable batches, earliest expiry first, with the batch rows locked so two orders
   cannot take the same units. If the hub is short, the whole order fails with `INSUFFICIENT_STOCK`.
2. Each batch emptied to 0 is marked `reserved` (depleted).
3. What was taken is recorded per batch (`HubBatchAllocation`), and a `stock_out` inventory log entry is written for
   each batch.

When the order is cancelled (by the customer, the kitchen, an admin, or the automatic stale-order sweep), or the kitchen
cancels or rejects the hub lines, the units go back into the **same batches** (`releaseHubAllocations`). An emptied batch
reopens as `available` unless it has expired; a batch on manual hold stays held. Each release is logged as an
`adjustment`.

### Delivery: always a Nuray rider

An order containing any hub line is delivered by the Nuray rider fleet, even if the kitchen normally delivers itself.
This is snapshotted on the order (`deliveryProvider = 'platform'`) when it is placed, and a rider job is created as for
any platform delivery (`backend/src/services/rider.service.ts`). The delivery fee is Nuray's delivery price, measured
from the hub when a hub is named. The customer's PIN handover works as for any order.

The order is accepted, prepared and marked ready by the kitchen in its normal order screens; there is no separate hub
order queue.

## Batch expiry sweep

A background job (`hub-expiry`, in `backend/src/index.ts`) runs a few seconds after the server starts and then every
hour. It sets every `available` batch whose expiry date has passed to `expired` and writes an `expired` inventory log
entry (performed by "System") for each one (`HubService.expireStaleBatches`). Only one server instance runs it at a
time (Postgres advisory lock, `backend/src/jobs/scheduler.ts`).

Batches that are `damaged` or `reserved` keep their status after expiry, but the backend still refuses to release
them.

## Daily routine (hub manager)

1. **Start of shift**: open `/hub`, check the Overview. Log a probe reading for each freezer in the Temperature tab.
2. **Expiring stock**: FEFO queue → **Expiring soon**. Anything expiring within 24 hours is no longer sold; pull it.
   Check the "Expired" rows and remove that stock physically.
3. **Receiving**: for each drop-off, probe it and record it in Intake. Use the batch number printed on the delivery,
   or generate one and label the packs.
4. **Quarantined stock**: review the Quarantined filter. Release only after re-checking the stock, and write why.
5. **Picking for orders**: pick from the top of the FEFO queue (earliest expiry first), which matches how the system
   allocates.
6. **End of shift**: log another probe reading per freezer.

## When something goes wrong

| Situation | What to do |
|---|---|
| Intake refused: "already expired" | The expiry date is today or earlier. Check the date; expired stock cannot be received. |
| Intake refused: batch exists (warm delivery) | Log the warm delivery under a new batch number. It will be quarantined on its own. |
| Intake refused: batch has expired | Receive the new stock under a new batch number. |
| Intake refused: hub not active | An admin has set the hub to maintenance or inactive. Ask an admin to set it back to active. |
| A delivery arrives warm | Record it with the real reading; the system quarantines it. Do not release it without a re-check and a written reason. |
| A freezer reads warm on a probe | The reading is logged as an alert, but batches are not changed automatically. Quarantine the batches stored in that freezer from the FEFO queue. |
| "Release" refused: expired | Expired batches cannot go back on sale. Dispose of the stock. |
| "Release" refused: reason required | Write a reason of at least 5 characters. |
| "You do not manage this hub" | The hub is not assigned to your account. Ask an admin to assign it (Hubs & managers). |
| `/hub` says no hub is assigned | Same: an admin must assign you to a hub. If you were just made a manager, sign out and in again. |
| A customer order failed for hub stock | The hub did not have enough sellable units (available, in stock, more than 24 hours of shelf life). Receive more stock or release a checked batch. |
| An order with hub stock was cancelled | Nothing to do: the units return to the batches automatically and the release is logged. |

## Limitations

- **The web checkout does not choose a hub.** The product page has a hub/direct choice, but it never sets a `hubId`,
  so orders placed from the website carry `fulfillmentType = 'hub'` without a hub. Those lines still force a Nuray
  rider, but **no hub batches are allocated**: only an API client that sends `hubId` draws down hub stock.
- **Hub lines also use the product's own stock.** Order placement checks and decrements `Product.stockQuantity` for
  every line, including hub lines, in addition to the hub batch allocation.
- **The rider's pickup point is the kitchen**, not the hub: the delivery job uses the kitchen's name and location
  (`rider.service.ts`). For stock held in a hub, the rider has to be told to collect from the hub.
- **Hub managers are not notified of orders**, and the console has no order list. The kitchen sees and handles hub
  orders in its own order screens.
- There is no screen to read the inventory log (`hub_inventory_logs`); it is in the database only.
- Temperature alerts are not sent as notifications; they show in the console only.
- Hub pickup (`deliveryType = 'hub_pickup'`) exists in the API (a hub is required, no delivery fee, Nuray collects any
  cash), but the web checkout does not offer it.
