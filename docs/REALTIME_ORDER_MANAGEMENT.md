# Realtime (Socket.IO)

Nuray uses Socket.IO for live updates: new orders for kitchens, status changes, the rider's position, chat, new delivery jobs for riders, and the notification bell. Events are small "something changed" signals. Clients react by reloading what they show from the REST API, so payloads never carry anything a party may not see (signed file links, the handover code).

Everything works without the socket: pages fall back to polling (see "Frontend" below). A lost event never fails the action that caused it.

Code: `backend/src/config/socket.ts` (server), `backend/src/services/realtime-order.service.ts` (most emitters), `frontend-web/lib/realtime/socket.ts`, `frontend-web/lib/hooks/use-socket.ts`, `frontend-web/lib/hooks/use-live-refresh.ts`.

## Server setup

- Socket.IO runs on the same HTTP server as the API (`socketManager.initialize(httpServer)` in `backend/src/index.ts`), at the default `/socket.io` path, not under `/api/v1`.
- Transports: `websocket` and `polling`. CORS origin is `CORS_ORIGIN` (default `http://localhost:3000`), with credentials.
- A client frame larger than 16 KiB closes that connection (`maxHttpBufferSize`): clients only send short events (an order id).
- **Redis adapter.** When `REDIS_URL` is set, `@socket.io/redis-adapter` is attached (two dedicated connections, `socket-pub` and `socket-sub`). An event emitted on any app instance then reaches clients connected to every instance, and `socketsLeave` applies everywhere. Without Redis only the local instance is reached, which is fine for one process. Production requires `REDIS_URL` (`backend/src/config/env.ts`).
- On shutdown the server closes all sockets; clients reconnect to another instance.

### Authentication on connect

The client sends the **access token** either as `auth: { token }` in the handshake or as an `Authorization: Bearer ...` header. The connection is refused (`connect_error`) when:

- there is no token, or it is invalid, expired, or a refresh token;
- the user no longer exists or is not `active`;
- the token was revoked (issued before the user's `tokensValidAfter`), or its session was signed out.

If the database or the session store fails while a valid token is being checked, the handshake is refused with `Server unavailable: retry later` and `data: { retryable: true }`, so the client knows to try again (see "Frontend") rather than treat it as a bad token.

The user's role is read fresh from the database, not from the token, so a role change takes effect on the next connection. A socket is not re-checked after connecting: the token is only verified once. The frontend reconnects with the new token whenever it changes.

### Rooms

A connection joins automatically:

| Room | Who |
|---|---|
| `user:<userId>` | the user's own connections (all tabs and devices) |
| `role:<userType>` | everyone of that role: `role:customer`, `role:seller`, `role:rider`, `role:admin`, `role:hub_manager` |
| `riders:on-duty` | a rider's connections while the rider is approved, active and on duty (`utils/riderDuty.ts`, the dispatcher's own filter). Jobs in the open pool are announced here and not to `role:rider`: an off-duty rider cannot claim a job, so telling them would only make their dashboard reload. A connection that opens joins if the rider is on duty; going on or off duty, a suspension, an approval or a rejection move every connection of that rider in or out (`socketManager.syncRiderDuty`, across instances through the Redis adapter) |

and can join on request:

| Room | Joined with | Allowed for |
|---|---|---|
| `order:<orderId>` | client event `join:order` | admins; the order's customer; a seller with an item in the order; the order's assigned rider |

When someone stops being a party to an order (a rider unassigned by an admin retry), the server removes them from the order room (`removeUserFromOrder`), because membership is only checked at join time.

### Events sent by the client

| Event | Argument | Effect |
|---|---|---|
| `join:order` | `orderId` (string, up to 64 chars) | joins `order:<orderId>` if the user is a party to it; otherwise nothing happens (no ack, no error, a warning in the server log) |
| `leave:order` | `orderId` (string, up to 64 chars) | leaves the room |

A user can send 120 events a minute (`SOCKET_EVENTS_PER_MINUTE`), counted over all their connections on an instance; the rest are dropped without an answer and logged once. An event whose argument is not such a string is ignored. An exception inside a handler is logged and never thrown, because one that escaped would shut the whole server down. Each event runs under its own log id (`requestId: "socket:<uuid>"`), so its log lines can be found together. There are no other client-to-server events. The rider's position is sent over HTTP (`POST /riders/deliveries/:id/location`), not over the socket.

Room membership is lost when a connection drops, so clients must re-send `join:order` after every reconnect (the frontend does).

## Events sent by the server

Order events go through `emitToRooms`, which sends one event to the union of several rooms, so a connection that is in more than one of them (a customer in both the order room and their user room) gets it once.

"Order audience" below means: `order:<id>`, plus `user:` rooms of the customer, of every seller with an item in the order, and of the assigned rider (`orderAudience()` in `realtime-order.service.ts`).

| Event | Sent to | Payload | Emitted when |
|---|---|---|---|
| `order:new` | each seller's `user:` room | `{ orderId, orderNumber, totalAmount, items: [{ productName, quantity, totalPrice }], createdAt }`. `items` are only that seller's items. | an order is placed (`order-placement.service.ts`, via `emitNewOrderNotification`), including online-payment orders that are not paid yet |
| `order:new` | `role:admin` | `{ orderId, orderNumber, totalAmount, customerId, createdAt }` | same moment |
| `order:status:update` | order audience and `role:admin` | `{ orderId, orderNumber, status, updatedAt }` | the order's status changes or its payment is settled: kitchen accepts/rejects/prepares/readies/cancels, rider updates the delivery, customer cancels, admin changes status/cancels/retries/refunds, sweeps cancel an order, Safepay confirms a payment |
| `order:item:status:update` | order audience | `{ orderItemId, orderId, orderNumber, status, updatedAt }` | a single item's status changes (seller item routes) |
| `order:message` | order audience | `{ orderId, messageId, senderRole }` | a chat message is posted on the order |
| `order:messages:read` | order audience | `{ orderId }` | someone read the order's messages |
| `order:delivery:tracking` | the customer's `user:` room only (not the order's room: it holds the kitchens; and not `role:admin`: no admin screen shows a rider's position) | `{ orderId, location: { latitude, longitude }, distanceKm?, estimatedArrival?, updatedAt }` | the rider reports a position (see below) |
| `delivery:new` | `riders:on-duty` | `{ deliveryId, orderId }` | a Nuray delivery job is created (`ensureDeliveryForOrder`, when the kitchen accepts or starts preparing, or an admin moves the order on), handed back by its rider, reopened by an admin retry, or released when a rider is suspended, **and no rider could take it automatically**. The job is offered to the best rider first (`postDelivery`); one that is assigned at once is never announced to the pool |
| `delivery:removed` | `riders:on-duty` | `{ deliveryId, orderId, reason: 'claimed' }` when a rider claims it; `{ deliveryId, orderId }` when it is cancelled | the job is no longer available. A job taken automatically the moment it was posted sends no `delivery:removed` (no rider ever heard of it); the order's parties still get `delivery:assigned` |
| `delivery:assigned` | order audience | `{ deliveryId, orderId }` | a rider claimed the job |
| `delivery:cancelled` | the assigned rider's `user:` room | `{ deliveryId, orderId }` | the order was cancelled while the rider held the job |
| `notification:new` | the recipient's `user:` room | `{ id, type, title, message, actionUrl, createdAt }` | any in-app notification is created (`notify()` in `notify.service.ts`) |

Notes:

- `status` in `order:status:update` is the order status (`pending`, `confirmed`, `preparing`, `ready`, `dispatched`, `in_transit`, `delivered`, `delivery_failed`, `completed`, `cancelled`, `refunded`). Who made the change (a user, the system or a payment) decides who is notified but is not in the payload: this event reaches the customer, every kitchen and the rider, and none of them learns another's account id. The chat events likewise name the sender by role only.
- `emitOrderStatusUpdate` and `emitOrderItemStatusUpdate` run after the change is committed and never throw: a failure there (the database blipping) is logged and does not turn the committed change into an error for the caller.
- `emitOrderStatusUpdate` also creates the in-app notification (and push/email/SMS where applicable) for the customer for statuses with a message, and tells kitchens about cancellations they did not make. That is where most `notification:new` events for orders come from (`backend/src/services/notify.service.ts`).
- Alongside `order:new`, each kitchen gets a notification (`notification:new`, plus push, email and SMS). For online-payment orders (`safepay` or `card`) still unpaid, it is a "waiting for payment" notification without push/email/SMS, and the "New paid order" notification follows once Safepay confirms (`online-payment.service.ts`). The `order:new` socket event itself is not held back, so the seller pop-up can appear before payment.
- `order:new` goes to each seller only, never to the customer; the customer gets an "Order placed" notification instead.
- `notification:new` is emitted regardless of the user's notification preferences; preferences only decide the extra channels (push, email, SMS) queued afterwards.

### Rider live location

1. While the rider has jobs in progress, the rider's page (`useRiderLocation`) calls `POST /api/v1/riders/deliveries/:id/location` with `{ latitude, longitude }` for each active job. It sends every 10 s, or after 3 s once the rider has moved 30 m. The route is rate limited to 90 per minute per user (`locationLimiter`, production).
2. The server (`rider.service.ts`, `updateRiderLocation`) accepts it only for a job assigned to that rider and still active (`assigned`, `arrived_at_pickup`, `picked_up`, `in_transit`, `arrived_at_customer`), otherwise 403 or 409.
3. It stores the position on the delivery at most once every 3 s (`LOCATION_MIN_INTERVAL_MS`); faster reports are accepted but not stored.
4. If the job is `assigned` and the rider is within 150 m of the kitchen, or `in_transit` and within 150 m of the customer, the job advances by itself (`arrived_at_pickup` / `arrived_at_customer`); the response says so in `autoTriggeredStatus`. A location that is not known is never guessed.
5. When a position was stored and the job is `picked_up`, `in_transit` or `arrived_at_customer`, the server emits `order:delivery:tracking` with the position and `distanceKm` (rider to customer, one decimal, only when the customer's location is known).
6. The customer's order page shows the rider on a map only while the order status is `dispatched` or `in_transit`. It uses the latest `order:delivery:tracking` payload, otherwise `delivery.riderLocation` from `GET /orders/:id` (which is returned only to viewers allowed to see it, and only while on the way).

Only the customer receives `order:delivery:tracking`: the order's room also holds the kitchens, who see the status but never where the rider is, and admins are not sent a sample every few seconds for every delivery on the platform.

## Order tracking endpoint

`GET /api/v1/realtime/orders/:id/track` (authenticated) returns a status snapshot: `orderId`, `orderNumber`, `orderStatus`, `paymentStatus`, `estimatedDeliveryAt`, `deliveredAt`, the last 10 `statusHistory` rows (status, notes, time; not who made the change), `items` (id, name, quantity, status; a kitchen sees its own items only, the customer and admins all of them) and `delivery` (status, estimated arrival, distance, duration) or `null`. Allowed for the order's customer, a seller with an item in it, or an admin; others get 403 `ACCESS_DENIED`. Note that an assigned rider is not allowed here (they can still join the socket room). The shipped frontend does not call this endpoint.

## Frontend

### The shared connection (`lib/realtime/socket.ts`)

- One socket per browser tab, shared by every component. Opened with `io(socketUrl(), { auth, transports: ['websocket', 'polling'], reconnectionDelay: 3000, reconnectionDelayMax: 30000, randomizationFactor: 0.5 })`; `auth` reads the current access token at every (re)connect.
- `socketUrl()` (`lib/config.ts`) is `NEXT_PUBLIC_WS_URL` if set, otherwise the origin of `NEXT_PUBLIC_API_URL`, otherwise the page's own origin.
- It watches the `auth:tokens-changed` event (fired by the API client when tokens are set, refreshed or cleared) and the `storage` event (another tab logging in or out). When the access token changes it closes the socket and opens a new one with the new token; with no token it closes.
- Socket.IO's own reconnection handles dropped connections: the first retry 1.5 to 4.5 s after the drop, then doubling up to 30 s, each spread ±50%, so the clients of a restarted server come back over seconds instead of all at once.
- A refused handshake stops the library's retries. When the server marked it `retryable`, the client retries it itself on its own back-off (3 s doubling up to 60 s, ±50%, reset on a successful connect). Otherwise the token was refused, most often because it expired while the connection was down: the client makes one `GET /auth/me` per token (after a jittered ~3 s), which lets the API client renew it, and the new token re-opens the socket. `connect_error` logs only in development.

### Hooks

- `useSocket()` (`lib/hooks/use-socket.ts`) opens or releases the shared socket as the auth store's `isAuthenticated` changes, and returns `socket`, `connected`, `subscribe(event, cb)`, `joinOrderRoom(orderId)`, `leaveOrderRoom(orderId)` and shortcuts `onOrderStatusUpdate`, `onDeliveryTracking`, `onNewOrder`, `onOrderItemStatusUpdate`. `joinOrderRoom` re-emits `join:order` on every `connect`, and its returned cleanup emits `leave:order`. The returned functions change when the connection is replaced, so effects re-subscribe.
- `useLiveRefresh(refresh, { events, match, intervalMs = 60000, offlineMs = 30000, offlineMaxMs = max(intervalMs, 120000), coalesceMs = 250, enabled, eventsOnly })` (`lib/hooks/use-live-refresh.ts`, timing in `lib/realtime/backoff.ts`) reloads a screen:
  - when a listed event arrives (optionally filtered by `match`): the reload waits `coalesceMs` and every event in that time joins it (the admin dashboard and approvals pages use 30 s, so at most one event reload per 30 s);
  - after a reconnect, at a random moment within 5 s, so the clients of a restarted server do not all reload at once;
  - when the tab becomes visible, unless the last reload is under 15 s old;
  - on a safety timer: `intervalMs` ±20% while connected; while disconnected the first reload comes after `offlineMs` (or `intervalMs` if sooner) and the wait then doubles up to `offlineMaxMs`, ±20%. With the defaults (60 s live; 30 s, 60 s, then 120 s offline) losing the socket makes a page poll at most twice as often as live for one poll, and less often than live from the third. The order chat polls at 15 s then 30 s while offline.

  Timer reloads are skipped while the tab is hidden. With `eventsOnly` only the event reloads run.
- `useRiderLocation(deliveryIds, onAutoAdvance)` (`lib/hooks/use-rider-location.ts`) is the sender side of live location (above).

### Who listens to what

| Screen / component | Events | What it does |
|---|---|---|
| `app/orders/[id]/page.tsx` (customer order page) | `join:order`; `order:status:update`, `order:delivery:tracking`; via `useLiveRefresh`: `order:status:update`, `order:item:status:update`, `delivery:assigned` | updates the status badge at once, reloads the order, toasts and plays a sound on cancellation, moves the rider on the map; live refresh stops once the order is delivered, completed, cancelled, refunded or delivery_failed |
| `app/orders/page.tsx` (customer order list) | `order:status:update` | updates the row and the status counts, shows a toast |
| `components/CustomerOrderNotification.tsx` | `order:item:status:update` | pop-up with a sound for the statuses in its `NOTIFY_STATUSES` |
| `components/SellerNewOrderNotification.tsx` | `order:new` | pop-up with a chime on `/sellers` pages; orders already waiting are also fetched on open |
| `app/sellers/orders/page.tsx` | `order:new`, `order:status:update`, `order:item:status:update`, `delivery:assigned` | reloads the list |
| `app/sellers/orders/[id]/page.tsx` | `order:status:update`, `order:item:status:update`, `delivery:assigned` | reloads the order |
| `app/riders/dashboard/page.tsx` | `delivery:new`, `delivery:removed`, `delivery:cancelled`, `delivery:assigned`, `order:status:update`; also sends location | `delivery:new` and `delivery:removed` reload only the list of available jobs (a second `useLiveRefresh` with `eventsOnly`); the list is also reloaded when the rider goes on duty, because pool events reach only riders on duty and it may have moved on meanwhile. The other three events reload available and own jobs |
| `app/riders/earnings/page.tsx` | `order:status:update` | reloads earnings |
| `components/orders/OrderChatModal.tsx` | `order:message`, `order:messages:read` | reloads the conversation |
| `components/layout/DashboardNavbar.tsx` | `notification:new` | increments the unread bell counter |

No frontend code listens to `order:new` for admins, or to the `role:hub_manager` room; those are available to the server only.

## Limitations

- `join:order` fails silently: a client that is refused gets no error.
- The socket token is checked only at connect. A socket stays open after its token expires or its account is suspended until it disconnects; the frontend reconnects whenever the token is refreshed.
- Events are not queued. A client that is offline misses them and catches up by reloading (reconnect, tab focus, timers).
- `userSockets` in `socket.ts` (the connected-user counter) is per instance and only used for `getConnectedUsersCount()`.
