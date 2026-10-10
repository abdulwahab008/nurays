# API reference

The Nuray backend is an Express 5 REST API. This document lists every route in `backend/src/routes/*.ts`, who may call it, the important request fields and what it returns. Live updates use Socket.IO and are described in [REALTIME_ORDER_MANAGEMENT.md](./REALTIME_ORDER_MANAGEMENT.md).

Field lists come from the zod schemas in `backend/src/validators/*.ts`. Where a route has no schema, the controller or service reads the body directly; those fields are marked "not schema-validated". Response bodies are only described in outline: the exact shape is whatever the service returns (`backend/src/services/`).

## Conventions

### Base URL

`/api/v1` (the version comes from `API_VERSION`, default `v1`; the port from `PORT`, `3001` in `backend/.env.example`). Every path below is relative to it. The frontend takes it from `NEXT_PUBLIC_API_URL`. `GET /` (outside `/api/v1`) returns `{ success, message: "Nuray API", version, timestamp }`.

Request bodies are JSON (limit 1 MB), except uploads (multipart) and the Safepay return (form post). CORS allows the `CORS_ORIGIN` origin with the headers `Content-Type`, `Authorization`, `Idempotency-Key`, `X-Request-Id`, and exposes `X-Request-Id`.

### Authentication

Send `Authorization: Bearer <access token>`. Tokens are JWTs signed with `JWT_SECRET`. The access token lives `JWT_EXPIRES_IN` (default 24h), the refresh token `JWT_REFRESH_EXPIRES_IN` (default 30d). A refresh token is rejected as an API credential.

On every authenticated request the server loads the user: it must exist, be `active` (else 403 `ACCOUNT_SUSPENDED`), and the token must not predate the user's `tokensValidAfter` (a password reset or account takeover revokes older tokens, 401 `SESSION_REVOKED`). The role used for authorization is the one in the database, not the one inside the token.

Roles (`userType`): `customer`, `seller`, `rider`, `admin`, `hub_manager`. Only `customer`, `seller` and `rider` can self-register; `admin` and `hub_manager` are provisioned (an admin can grant `hub_manager`, see Admin).

Access labels used below:

| Label | Meaning |
|---|---|
| public | no token needed |
| optional auth | works without a token, personalised with one |
| authenticated | any valid token, any role |
| role X | `authorize(...)` on the route; other roles get 403 `INSUFFICIENT_PERMISSIONS` |
| seller (approved) | `requireSeller`: seller role, a seller profile, `verificationStatus = approved`, `status = active` |
| seller (not suspended) | role `seller` plus `blockSuspendedSeller`: a seller whose profile is not active gets 403 `SELLER_ACCOUNT_INACTIVE` (approval is not required) |

Where a route is only "authenticated" but the service enforces ownership or a role (for example order access, or seller-only variant writes), the table says so.

### Refresh flow

1. Log in or register: the response carries `tokens: { access_token, refresh_token, expires_in }` (snake_case; `expires_in` is the access token's lifetime in seconds).
2. When a request returns 401, call `POST /auth/refresh` with `{ refreshToken }`.
3. The response is `{ success, data: { accessToken, refreshToken } }` (camelCase, no `expires_in`): both tokens are replaced. The old refresh token is not invalidated server-side.
4. Retry the original request once. If refresh fails (401 `INVALID_REFRESH_TOKEN`), sign out.

The web client (`frontend-web/lib/api-client.ts`) does exactly this, shares one in-flight refresh between concurrent 401s, and never retries `/auth/refresh`, `/auth/login`, `/auth/logout` or `/auth/register`. `POST /auth/logout` ends every session the account has (it sets `tokensValidAfter`), so the client discards its tokens and every other device has to sign in again.

### Response envelope

Success:

```json
{ "success": true, "data": { }, "message": "optional human text" }
```

Lists return an object under `data` with the array and a pagination block, for example `data: { products: [...], pagination: { page, limit, total, totalPages } }`. Some list routes return a bare array in `data` (noted per route).

Error (`backend/src/middleware/errorHandler.ts`):

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Validation failed: ...", "details": [{ "field": "quantity", "message": "..." }] },
  "requestId": "...",
  "timestamp": "2026-..."
}
```

`details` is present for validation errors; `stack` only when `NODE_ENV=development`. The `requestId` matches the `X-Request-Id` response header (a client may send its own `X-Request-Id`). Unknown routes return 404 `NOT_FOUND`. Unexpected errors return 500 `INTERNAL_ERROR` with a generic message.

A few handlers in `community.controller.ts` return a different 400 shape, `{ success: false, message }` without `error`.

### Common error codes

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | body or query failed its zod schema (body: `Validation failed: <first message>`; query: `Query validation failed`) |
| 400 | `INVALID_JSON` | malformed JSON body |
| 401 | `NO_TOKEN`, `INVALID_TOKEN`, `USER_NOT_FOUND`, `SESSION_REVOKED`, `AUTH_REQUIRED` | missing, bad or revoked token |
| 403 | `ACCOUNT_SUSPENDED`, `INSUFFICIENT_PERMISSIONS`, `SELLER_REQUIRED`, `SELLER_NOT_APPROVED`, `SELLER_ACCOUNT_INACTIVE`, `ACCESS_DENIED` | role or ownership |
| 404 | `NOT_FOUND`, `*_NOT_FOUND` | unknown route or record (`ORDER_NOT_FOUND`, `SELLER_NOT_FOUND`, ...) |
| 409 | `DUPLICATE_RECORD` | unique constraint hit |
| 413 | `PAYLOAD_TOO_LARGE`, `FILE_TOO_LARGE` | body or upload too big |
| 429 | `RATE_LIMITED` | a rate limit below |

Business-rule errors use specific codes defined next to the check in the services (for example `ORDER_NOT_CANCELLABLE`, `BID_OUT_OF_BOUNDS`, `DELIVERY_NOT_ACTIVE`).

### Rate limits

`backend/src/middleware/rateLimiter.ts`. Counters live in Redis when configured (shared by all instances), otherwise in process memory. If Redis is unreachable the request is let through. Limited requests get 429 `RATE_LIMITED` and the standard `RateLimit-*` headers. Numbers below are the production values; development and test are far looser.

| Limiter | Limit | Key | Applied to |
|---|---|---|---|
| api | 1200 / minute | IP | everything under `/api` except `/health` |
| login | 10 failures / 15 min | IP + account | `POST /auth/login`, `/auth/google`, `/auth/reset-password`, `/auth/phone/verify` |
| login-ip | 100 failures / 15 min | IP | `POST /auth/login`, `/auth/google` |
| otp-ip | 30 / 15 min | IP | `POST /auth/otp/request` |
| otp-phone | 3 / 15 min | phone number | `POST /auth/otp/request`, `/auth/phone/request` |
| phone-request | 5 / hour | user | `POST /auth/phone/request` |
| forgot-ip | 20 / 15 min | IP | `POST /auth/forgot-password` |
| forgot-email | 3 / hour | e-mail address | `POST /auth/forgot-password` |
| resend-verification | 3 / hour | user | `POST /auth/resend-verification` |
| register | 10 / hour | IP | `POST /auth/register` |
| promo | 20 / minute | IP | `POST /promotions/validate` |
| order | 20 / 10 min | user | `POST /orders` |
| message | 60 / 5 min | user | order chat and support replies |
| submission | 30 / hour | user | `POST /reviews`, `POST /support/tickets`, `POST /orders/:id/submit-payment`, `POST /payments/process`, `POST /payments/wallet/topup`, `PUT /riders/me/application` |
| upload | 60 / 10 min | user | every `/upload` POST |
| location | 90 / minute | user | `POST /riders/deliveries/:id/location` |

### Idempotency key on order creation

`POST /orders` accepts a key in the `Idempotency-Key` header (or `idempotencyKey` in the body). It must match `^[A-Za-z0-9_-]{8,100}$`, otherwise 400 `INVALID_IDEMPOTENCY_KEY`. The key is stored per customer on the order (`customerId` + `idempotencyKey` is unique). A second request with the same key returns the order the first one placed instead of creating another, including when two identical requests race. Clients should generate one key per checkout attempt and reuse it on retry. The web checkout does this.

### Pagination

List routes take `page` (default 1) and usually `limit` (default 20 for products, orders, seller orders, notifications, support tickets, wallet transactions; 25 for admin users and rider money; 50 for the audit log; 10 for product reviews). Maximums differ per route (for example 100 for wallet, users and audit log, 50 for product reviews, 24 for the recommended lists). The block is `pagination: { page, limit, total, totalPages }`.

### Files

Uploaded public images are served from the storage layer's public URL. Private files (receipts, chat media, verification documents) are stored as private references and shown to authorised parties through short-lived signed links at `/files/<key>?exp&sig` (outside `/api/v1`, `backend/src/storage/serve.ts`).

---

## Auth: `/auth`

`backend/src/routes/auth.routes.ts`, `controllers/auth.controller.ts`, `validators/auth.validator.ts`.

| Method and path | Access | Body / notes | Returns |
|---|---|---|---|
| `POST /auth/otp/request` | public, otp limit | `phone` (10-15 chars), `purpose`: `registration` \| `login` (a code for a password reset is not offered, a reset goes through the e-mailed link: 400 `VALIDATION_ERROR`) | `{ message, phone }` (the normalised number); sends an SMS code |
| `POST /auth/register` | public, register limit | `email`, `password` (8-200 characters; a common password, or one built from the person's own name, phone or e-mail, is refused with 400 `WEAK_PASSWORD` and `details.reason`; one that is too short is refused by the request schema as 400 `VALIDATION_ERROR`), `user_type`: `customer` \| `seller` \| `rider`, `full_name` (2-255); optional `phone`, `phone_otp` (6 digits, from `/otp/request` with purpose `registration`; without it the phone is saved unverified), `city`, `area`, `business_name` (required for sellers, else 400 `BUSINESS_NAME_REQUIRED`) | 201 `{ user, seller?, tokens, requiresEmailVerification: true, emailSendFailed }`; seller and rider accounts start pending approval |
| `POST /auth/login` | public, login limit | `loginMethod`: `email` (default) or `otp`; `phoneOrEmail`; `otpCodeOrPassword` (password min 6, or 6-digit OTP). Email login needs a valid email, OTP login a phone of 10-15 chars | `{ user, tokens, requiresEmailVerification }`. An unverified email does not block login |
| `POST /auth/google` | public, login limit | exactly one of `accessToken` (the web button's Google access token) or `idToken` (a native app's Google ID token, a signed JWT verified against Google's keys); both or neither is 400 `VALIDATION_ERROR` | same shape as login. 401 `INVALID_GOOGLE_TOKEN`, 401 `GOOGLE_EMAIL_UNVERIFIED`, 503 `GOOGLE_NOT_CONFIGURED` / `GOOGLE_UNAVAILABLE` |
| `POST /auth/verify-email` | public | `token` | message only |
| `POST /auth/forgot-password` | public, otp limit | `email` | always the same message, whether or not the account exists; emails a reset link |
| `POST /auth/reset-password` | public, login limit | `token` (20-200 chars), `password` (the same rules as sign-up; a staff member needs 12 characters, refused with 400 `WEAK_PASSWORD` and `details.minLength`) | message; revokes older sessions |
| `POST /auth/refresh` | public | `refreshToken` | `{ accessToken, refreshToken }` (see Refresh flow) |
| `GET /auth/me` | authenticated | none | `{ id, phone, email, userType, status, emailVerified, phoneVerified, profile, defaultAddress }` |
| `POST /auth/resend-verification` | authenticated | none | message |
| `POST /auth/change-password` | authenticated | `currentPassword` (asked for again: a wrong one is 400 `INVALID_PASSWORD`, never 401, and five wrong ones in 15 minutes stop even the right one with 429 `RATE_LIMITED`, the same budget as changing the e-mail or closing the account), `newPassword` (the same rules as sign-up, judged first, so a weak one costs no attempt: 400 `WEAK_PASSWORD` with `details.reason` and `details.minLength`, staff 12 characters; the same password again is 400 `PASSWORD_UNCHANGED`) | `{ tokens: { access_token, refresh_token, expires_in } }` for this session; every older session, on this device and every other, is void (401 `SESSION_REVOKED`) and the account's sockets are closed. An account with no password (it signs in with Google) is refused with 400 `NO_PASSWORD_SET`: it sets one through `forgot-password`, which writes to its verified address. The change is audited (`auth:PASSWORD_CHANGED`) and the verified address is e-mailed a notice |
| `POST /auth/logout` | authenticated | none | message; ends every session the account has, on every device (older access and refresh tokens are refused with 401 `SESSION_REVOKED`), closes its sockets and forgets every push subscription the account has (nobody is signed in on those devices any more; the web app registers a browser's own subscription again for whoever signs in on it) |
| `POST /auth/phone/request` | authenticated, otp limit | `phone` | `{ message, phone }`; sends a code to that number |
| `POST /auth/phone/verify` | authenticated, login limit | `phone`, `otp` (6 digits) | `{ phone, phoneVerified }`; the number becomes the account's |

## Users: `/users`

All routes need authentication (`user-profile.routes.ts`).

| Method and path | Body / notes | Returns |
|---|---|---|
| `GET /users/me` | none | `{ id, phone, phoneVerified, email, emailVerified, hasPassword, userType, status, profile, createdAt }`: `hasPassword` says whether there is a password to change (a Google account has none); the password itself never leaves the server |
| `PATCH /users/me` | optional `fullName` (min 2), `email`, `city`, `area`, `languagePreference`: `en` \| `ur`; `currentPassword` is required when `email` changes on an account that has a password (400 `PASSWORD_REQUIRED`, 400 `INVALID_PASSWORD` for a wrong one, never 401, which would make the web app refresh its session and retry; five wrong passwords an hour per account end in 429 `RATE_LIMITED`, and so does the fourth e-mail change an hour) | updated profile; a changed email is unverified until confirmed, and the address the account leaves is e-mailed a notice (only if its owner had verified it) that names the new address in part |
| `DELETE /users/me` | `confirm: "DELETE"`, `password` (required when the account has one) | closes the account (see Security: account closure); 409 `OPEN_ORDERS` \| `WALLET_BALANCE` \| `ACTIVE_DELIVERIES` \| `RIDER_BALANCE` \| `PENDING_PAYOUT`, 403 `STAFF_ACCOUNT` |
| `POST /users/me/avatar` | `avatarUrl` (a URL; upload the image first with `POST /upload/avatar`) | updated avatar |
| `GET /users/me/addresses` | none | the user's addresses (bare array) |
| `POST /users/me/addresses` | `addressLine1` (min 5), `area` (min 2), `city` (min 2); optional `label`, `addressLine2`, `houseNumber` (max 50, spaces trimmed: the house, flat or shop number a rider looks for on the door), `postalCode`, `landmark`, `latitude` (23.5..37.5), `longitude` (60.5..77.5) (the pin must be inside Pakistan, else 400 `VALIDATION_ERROR`), `communityId`, `isDefault` | 201 the address |
| `PATCH /users/me/addresses/:id` | any subset of the address fields, at least one (for example `{ isDefault: true }`) | the address |
| `DELETE /users/me/addresses/:id` | none | message |

## Sellers: `/sellers`

`seller.routes.ts`, `controllers/seller.controller.ts`, `validators/seller.validator.ts`. Public discovery first, then the seller's own console. Order of routes matters: `/me` paths are matched before `/:id`.

| Method and path | Access | Body / query | Returns |
|---|---|---|---|
| `GET /sellers` | public | query `communityId`, `city`, `businessType`, `search` (name or description), `sort` (`trending`, otherwise best rated), `limit` (max 50, default 30) | `{ data: [kitchen cards], count }`: only approved, verified, active sellers; each has rating, community, `availability`, delivery terms, up to 4 products. Not paginated |
| `GET /sellers/:id` | public | `:id` is the seller id or its user id | one kitchen with its products, `availability`, delivery terms and the 10 latest reviews; 404 `SELLER_NOT_FOUND` if not approved and active |
| `POST /sellers/register` | authenticated | `businessName` (min 3); optional `businessNameUrdu`, `businessType` (`restaurant` \| `home_kitchen` \| `bakery` \| `cafe` \| `cloud_kitchen`, default `home_kitchen`), `description`, `kitchenVideoUrl`, `coverImageUrl`, `cnicFrontUrl`, `cnicBackUrl`, `kitchenPhotoUrls[]`, `communityId`, `primaryCommunityName`, `latitude`, `longitude`, `address`, `houseOrUnitNumber`, `mealCategories[]`, `deliveryModes[]`, `bankAccountName`, `bankAccountNumber`, `bankName`, `jazzcashNumber`, `jazzcashAccountTitle`, `easypaisaNumber`, `easypaisaAccountTitle`, `agreeToTerms` | 201 application; 400 `SELLER_ALREADY_EXISTS` unless the previous application was rejected |
| `GET /sellers/me` | authenticated | none | the caller's seller profile (also while pending or rejected) |
| `GET /sellers/me/dashboard` | authenticated | none | dashboard numbers for the caller's seller account (404 `SELLER_NOT_FOUND` without one) |
| `PATCH /sellers/me`, `PUT /sellers/me` | role seller (not suspended) | all optional, most nullable: `businessName`, `businessNameUrdu`, `description`, `kitchenVideoUrl`, `coverImageUrl`, payment fields (`jazzcash*`, `easypaisa*`, `bank*`), `lowStockThreshold`, `enableStockAlerts`, `latitude`, `longitude` (inside Pakistan, else 400 `VALIDATION_ERROR`), delivery settings (`deliveryProvider`: `platform` \| `self`, `allowCrossCommunity`, `deliveryFeeType`: `fixed` \| `distance`, `deliveryFeeFixed`, `deliveryFeeBase`, `deliveryFeePerKm`, `distancePricingTiers[{maxKm,fee}]`, `maxDeliveryDistanceKm`, `minOrderAmountForDelivery`, `freeDeliveryThreshold`, `freeDeliveryAreas[]`, `freeDeliveryRadiusKm`, `allowedPostalCodes[]`, `deliveryZones[]`, `deliveryModes[]`), `businessType`, `mealCategories[]`, `storeNotice` (max 500), availability (`scheduleMode`, `operatingHours` as `{ fixedDaily?, weekly? }` with `HH:MM` times, `availabilityOverride` such as `open`, `closed`, `busy`, `vacation`, `holiday`, `preorder_only`, `availabilityOverrideUntil`, `availabilityNote` max 300), `orderCutoffTime`, `maxDailyOrders`, `minPrepTimeMinutes`, `preOrderOnly`, `advanceBookingMinDays`, `advanceBookingMaxDays` | the updated profile |
| `POST /sellers/me/toggle-live` | role seller (not suspended) | none | `{ availabilityOverride, isOpen, message }`: flips the store between open and closed (sets `availabilityOverride` to `open` or `closed`, clearing any end date) |
| `GET /sellers/me/community-delivery` | role seller (not suspended) | none | the kitchen's per-community delivery terms |
| `PUT /sellers/me/community-delivery` | role seller (not suspended) | `terms[]` (max 200), each `{ communityId, fee (0-100000, default 0), freeAbove?, minOrderAmount?, isEnabled? }`. The fee is only used for self-delivery; with Nuray riders the delivery fee is Nuray's | saved terms |
| `GET /sellers/me/analytics` | role seller (not suspended) | query `period` (default `30d`) | sales analytics |
| `POST /sellers/me/payouts` | role seller (not suspended) | `amount` (min 100), `payoutMethod`: `bank_transfer` \| `jazzcash` \| `easypaisa`, `accountNumber` | 201 the payout request; the amount must reach the minimum payout (`minPayoutAmount` setting or the seller's payout schedule) and not exceed the available balance (400 `INSUFFICIENT_BALANCE`) |
| `GET /sellers/me/payouts` | role seller (not suspended) | none | the seller's payout history |

## Seller orders: `/seller`

Note the singular. `seller-order.routes.ts`. All routes need role `seller` or `admin` and a non-suspended seller. 

| Method and path | Body / query | Returns |
|---|---|---|
| `GET /seller/orders` | query `page`, `limit`, `status` (`pending`, `preparing`, `ready`, `dispatched`, `cancelled`; item status), `orderStatus` (any order status), `dateFrom`, `dateTo` | `{ orders, pagination }` containing the seller's items |
| `GET /seller/orders/:id` | none | the kitchen's view of one order: its own items, the customer's name and phone, the door (address as at checkout), payment details for a manual transfer, status history and the kitchen's earnings. Never the customer's account id, map pin, postcode, idempotency key or payment-gateway transaction id |
| `POST /seller/orders/:id/accept` | none | accepts the order (starts preparation); when Nuray delivers, a delivery job is created for riders |
| `POST /seller/orders/:id/reject` | `reason` (not schema-validated) | rejects and notifies the customer |
| `POST /seller/orders/:id/ready` | none | marks it ready for pickup |
| `POST /seller/orders/:id/dispatch` | none | self-delivery or pickup: the kitchen hands the order out |
| `POST /seller/orders/:id/deliver` | `handoverCode` (exactly 4 digits, the customer's code) | self-delivery or pickup: marks delivered |
| `POST /seller/orders/:id/delivery-failed` | `reason` (3-500) | self-delivery: reports a failed handover |
| `PATCH /seller/orders/items/:id/status` | `status`: `pending` \| `confirmed` \| `preparing` \| `ready` \| `dispatched` \| `in_transit` \| `delivered` \| `delivery_failed` \| `cancelled`; optional `reason` (1-500, required for `delivery_failed`), `handoverCode` (4 digits, to mark a self-delivery or pickup `delivered`) | the updated item |
| `POST /seller/orders/items/:id/cancel` | `reason` (5-500) | cancels one item |

## Products: `/products`

`product.routes.ts`, `product.controller.ts`, `product.validator.ts`. Route order matters: the fixed paths come before `/:identifier`.

| Method and path | Access | Body / query | Returns |
|---|---|---|---|
| `GET /products` | public | query `page`, `limit`, `categoryId` (uuid), `sellerId` (uuid), `city`, `area`, `communityId`, `minPrice`, `maxPrice`, `dietary` (comma list), `stockType` (`direct` \| `hub` \| `both`), `productType` (`frozen` \| `fresh` \| `ready_to_eat` \| `ready_to_cook`), `search`, `sort` (`popular` \| `trending` \| `newest` \| `price_low` \| `price_high` \| `rating`), `isActive`, `mealCategory`, `businessType`, flags `openNow`, `open247`, `deliveryAvailable`, `pickupAvailable`, `offersAvailable`, `freeDelivery`, `preOrderOnly`, `currentlyBusy`, `newKitchens`, `fastDelivery` (all `"true"` to enable), `customerLat`, `customerLng`, `maxDistanceKm` | `{ products, pagination }` |
| `GET /products/recommended` | optional auth | query `limit` (default 12, max 24), `customerLat`, `customerLng`, `communityId` | `{ products }`, each with `recommendationReason` (`trending` for visitors and new customers; personalised for signed-in users, `utils/ranking.ts`) |
| `GET /products/order-again` | authenticated | same query | `{ products }`: the customer's own past dishes, often and recent first |
| `GET /products/seller/my-products` | role seller (not suspended) | query `page`, `limit`, `isActive`, `approvalStatus` (`pending` \| `approved` \| `rejected`), `productType` | `{ products, pagination }` |
| `POST /products` | role seller (not suspended) | `name` (2-255), `price` (>0), `unit`, `stockQuantity` (>=0), `stockType` (`direct` \| `hub` \| `both`); optional `nameUrdu`, `description`, `descriptionUrdu`, `categoryId` (uuid), `originalPrice`, `costPrice`, `productType` (default `frozen`), `shelfLifeHours`, `preparationTime`, `unitUrdu`, `weightGrams`, `ingredients`, `allergens`, `dietaryInfo[]`, `storageDays`, `heatingInstructions`, `heatingInstructionsUrdu`, `minOrderQuantity`, `maxOrderQuantity`, `images[]` (URLs or paths from `/upload/product-images`), `tags[]`, menu: `menuType` (`fixed` default \| `weekly` \| `daily`), `availableDays[]` (0 = Sunday ... 6; at least one for weekly, else 400 `MENU_DAYS_REQUIRED`), `menuDate` (`"today"`, a `YYYY-MM-DD` date, or null) | 201 the product (goes through admin moderation) |
| `PATCH /products/:id` | role seller (not suspended) | any subset of the create fields. `{ "menuDate": "today" }` puts a daily dish on today's menu, `{ "menuDate": null }` takes it off | the product |
| `DELETE /products/:id` | role seller (not suspended) | none | message |
| `GET /products/:id/reviews` | public | query `page`, `limit` (1-50, default 10), `rating` (1-5) | `{ reviews, summary: { averageRating, totalReviews, ratingBreakdown }, pagination }` |
| `GET /products/:identifier` | optional auth | `:identifier` is the product id or slug; query `customerLat`, `customerLng`, `communityId` | the product with seller, images, variants and delivery info for the location |

`GET /reviews/products/:id/reviews` is an alias of the reviews route (see Reviews).

### Product variants: `/product-variants`

`product-variant.routes.ts`. Every route needs authentication; reads return data to any signed-in user, and the write services check that the variant's product belongs to the caller's seller account.

| Method and path | Body | Returns |
|---|---|---|
| `POST /product-variants` | `productId` (uuid), `name` (1-200); optional `nameUrdu`, `sku`, `price` (>0, required), `originalPrice`, `costPrice`, `stockQuantity` (default 0), `stockThreshold` (default 10), `weightGrams`, `isDefault`, `isActive`, `sortOrder` | 201 the variant |
| `POST /product-variants/bulk` | `productId`, `variants[]` (1-20, same fields without `productId`) | 201 the created variants |
| `GET /product-variants/product/:productId` | none | the product's variants |
| `GET /product-variants/:variantId` | none | one variant |
| `PATCH /product-variants/:variantId` | any subset of the fields above | the variant |
| `DELETE /product-variants/:variantId` | none | message |

### Stock alerts: `/stock-alerts`

Authenticated; the controller looks up the caller's seller profile (404 `SELLER_NOT_FOUND` otherwise).

| Method and path | Notes |
|---|---|
| `GET /stock-alerts` | query `isRead`, `isDismissed` (`true`/`false`), `alertType` (`low_stock` \| `out_of_stock`) |
| `PATCH /stock-alerts/:alertId/read` | marks one read |
| `PATCH /stock-alerts/:alertId/dismiss` | dismisses one |

### Profit and loss: `/profit-loss`

Authenticated; computed for the caller's seller account.

| Method and path | Notes |
|---|---|
| `GET /profit-loss` | query `startDate`, `endDate`; the seller's P&L statement |
| `GET /profit-loss/product/:productId` | profitability of one product |

## Categories: `/categories`

`category.routes.ts`, `category.validator.ts`.

| Method and path | Access | Body / query | Returns |
|---|---|---|---|
| `GET /categories` | public | query `includeInactive=true` | category list |
| `GET /categories/grouped` | public | query `includeInactive` | categories keyed by product type (`frozen`, `fresh`, `ready_to_eat`, `ready_to_cook`) |
| `GET /categories/:identifier` | public | id or slug | one category |
| `POST /categories` | role admin | `name` (2-255); optional `nameUrdu`, `description`, `iconUrl`, `parentId` (uuid, nullable), `productType`, `sortOrder`, `isActive` (extra fields pass through) | 201 |
| `PATCH /categories/:id` | role admin | any subset | updated |
| `DELETE /categories/:id` | role admin | none | message |

## Category requests: `/category-requests`

`category-request.routes.ts`. Sellers ask for a new category; admins decide. Bodies are not schema-validated.

| Method and path | Access | Body / query | Notes |
|---|---|---|---|
| `POST /category-requests` | seller (approved) | `productType` and `name` (or `suggestedName`) required, else 400; optional `nameUrdu` (or `suggestedNameUrdu`), `description`, `parentCategoryId` | creates a request |
| `GET /category-requests/my-requests` | seller (approved) | none | the seller's requests |
| `GET /category-requests` | role admin | query `status` | all requests |
| `GET /category-requests/pending-count` | role admin | none | number of pending requests |
| `GET /category-requests/:id` | role admin | none | one request |
| `POST /category-requests/:id/approve` | role admin | optional `customSlug` | creates the category from the request |
| `POST /category-requests/:id/reject` | role admin | `reason` | rejects |

## Cart: `/cart`

All routes need authentication (`cart.routes.ts`, `cart.validator.ts`). One cart may hold several sellers.

| Method and path | Body / query | Returns |
|---|---|---|
| `GET /cart` | none | `{ items, summary: { subtotal, totalItems, totalSellers }, activeSeller }`: the dishes at the kitchens' prices. The summary carries no delivery fee, discount or total: those are worked out where they are known (the estimate below, and checkout) |
| `GET /cart/validate` | none | checkout validation of the cart (stock, availability, rules) |
| `GET /cart/delivery-estimate` | query `addressId` (required, else 400 `VALIDATION_ERROR`) | what delivering the cart to that address costs the customer, worked out as an order for the same dishes would be: `{ deliveryFee, isFree, isDeliverable, reason, kitchenPaysDelivery, freeDeliveryThreshold, deliverySubtotal }`. `deliverySubtotal` is the amount the kitchen's rules were checked against: the dishes at today's prices after the kitchen's own deals, before any voucher code. `freeDeliveryThreshold` is the order amount at which a self-delivering kitchen's fee is waived (still to reach while the fee is charged, reached once it is waived) and is `null` when no rule says so or a Nuray rider delivers (the kitchen pays that fee); progress is `deliverySubtotal / freeDeliveryThreshold`. `isDeliverable: false` means the kitchen does not deliver to that address (`reason` says why) and `deliveryFee` is then 0 and must not be shown as free |
| `POST /cart/items` | `productId` (id or slug), `quantity` (>=1); optional `variantId` (uuid), `stockType`, `hubId`, `clearAndAdd` (empty the cart first) | 201 the item |
| `PATCH /cart/items/:id` | optional `quantity` (>=0; 0 removes the item), `stockType`, `hubId` | the item, or a message when removed |
| `DELETE /cart/items/:id` | none | message |
| `DELETE /cart` | none | message |

## Orders: `/orders`

All routes need authentication (`order.routes.ts`, `order.validator.ts`). Access to a single order is checked in the service (the customer, a seller with an item in it, the assigned rider or an admin, depending on the route).

| Method and path | Body / query | Returns |
|---|---|---|
| `POST /orders` | order limit, `Idempotency-Key`. Body: `items[]` (min 1; each `productId` uuid, `quantity` int >0, optional `variantId`, `stockType`, `hubId`), `deliveryType`: `home_delivery` \| `hub_pickup` \| `self_pickup`, `paymentMethod`: `jazzcash` \| `easypaisa` \| `bank` \| `cod` \| `wallet` \| `card` \| `safepay`; optional `deliveryAddressId` (uuid), `hubId`, `deliverySlotDate`, `deliverySlotTime`, `promotionCode` (refused with `INVALID_PROMO_CODE` \| `PROMO_INACTIVE` \| `PROMO_EXPIRED` \| `PROMO_LIMIT_REACHED` \| `PROMO_ALREADY_USED` \| `MIN_ORDER_NOT_MET` \| `PROMO_NOT_APPLICABLE` when it cannot be used), `deliveryInstructions` (max 500). An item `hubId` is only allowed on hub stock (`HUB_NOT_APPLICABLE` otherwise). `safepay` / `card` is refused with 503 `GATEWAY_UNAVAILABLE` while online payment is not configured, before anything is reserved | 201 `{ order: { id, orderNumber, totalAmount, paymentMethod, paymentStatus, orderStatus, items }, payment: { gateway, status: "pending" } }`. For an online payment, follow with `POST /payments/process`. Totals are whole rupees |
| `GET /orders/me` | query `page`, `limit`, `status` (`pending` ... `cancelled`, `refunded`) | `{ orders, pagination, statusCounts }` where `statusCounts` is the count per order status across the whole history |
| `GET /orders/:id` | none | full order (items, delivery, payment, status history) for the customer and admins. A rider gets the order without payment details and internal keys; a kitchen gets the same view as `GET /seller/orders/:id` |
| `POST /orders/:id/cancel` | `reason` (5-500) | cancels. Customers can only cancel while the order is `pending` (400 `ORDER_NOT_CANCELLABLE` otherwise); stock is restored and a refund created if it was paid |
| `GET /orders/:id/payment-details` | none | the kitchen's transfer details (bank, JazzCash, EasyPaisa) for a manual-transfer order |
| `POST /orders/:id/submit-payment` | submission limit. Body (not schema-validated): `referenceNumber` (required), optional `senderName`, `senderAccount`, `proofUrl` (from `POST /upload/payment-proof`), `notes` | records the customer's transfer, status `payment_submitted`; 400 for paid, cancelled, COD or wallet orders |
| `POST /orders/:id/confirm-payment` | `confirmed` (boolean), `disputeReason` (not schema-validated) | for the receiving kitchen only (403 `NOT_PAYEE` otherwise): `confirmed: true` marks the order paid, `false` marks the payment `disputed` for admins |
| `GET /orders/:id/messages` | query `role` (`customer` \| `seller` \| `rider`) | the order's chat messages (each with `senderRole`, `senderName` and `isMe`, never the sender's account id); reading marks them read and emits `order:messages:read` |
| `POST /orders/:id/messages` | message limit. Body: `message` (text, max 2000) or `mediaUrl`; optional `messageType` (`text` \| `voice` \| `image`), `role`, `duration` (seconds, 0-3600). `mediaUrl` must be a chat upload by the sender (`POST /upload/chat-media`) | 201 the message (same fields as above); emits `order:message` |

## Payments, wallet and Safepay: `/payments`

`payment.routes.ts`, `payment.controller.ts`, `payment.validator.ts`, `services/online-payment.service.ts`. Card details are never sent to this API; online payment is Safepay's hosted checkout.

| Method and path | Access | Body / notes | Returns |
|---|---|---|---|
| `GET /payments/methods` | public | none | array of `{ id, name, kind, isAvailable, description }` for `cod`, `safepay` (available only when Safepay is configured), `wallet`, `jazzcash`, `easypaisa`, `bank` (`kind`: `cash`, `online`, `wallet`, `manual_transfer`) |
| `GET /payments/safepay/return`, `POST /payments/safepay/return` | public, authenticated by signature | where Safepay sends the customer back: `tracker`, `sig`, `reference` (form body or query). The signature is an HMAC-SHA256 of the tracker | settles the checkout attempt once, then 303-redirects to a page of the web app (an invalid signature redirects to the "unknown" landing page, nothing is settled) |
| `POST /payments/safepay-webhook` | public, authenticated by the `X-SFPY-SIGNATURE` header | Safepay's event | 401 on a bad signature; 200 `{ received: true }` for events that are ignored; 200 `{ received: true, outcome }` after settling a successful payment; 500 on a server error so Safepay retries |
| `POST /payments/process` | authenticated, submission limit | `orderId` (uuid), `paymentMethod`: `jazzcash` \| `easypaisa` \| `bank` \| `card` \| `cod` \| `wallet` \| `safepay` | `wallet`: pays from the wallet. `cod`: sets cash on delivery, `{ paymentId: "COD-<orderId>", status: "pending", redirectUrl: null }`. `safepay`/`card`: `{ paymentId, token (the Safepay tracker), status: "pending", redirectUrl, expiresAt (30 min), gateway: "safepay" }`, send the customer to `redirectUrl`. `jazzcash`/`easypaisa`/`bank`: 400 unless a bank gateway is configured, because these are transfers made from the order page (`/orders/:id/payment-details`, `/submit-payment`) |
| `POST /payments/verify` | authenticated | `paymentId` (the tracker), optional `transactionId` | read-only: `{ paymentStatus: "completed", orderStatus, transactionId, paidAt }` once paid, else 400 `VERIFY_PENDING`; it does not settle anything |
| `GET /payments/orders/:orderId/status` | authenticated (the order's customer) | none | `{ paymentStatus, paymentMethod, orderStatus, paidAt, canPayOnline, lastAttempt }` |
| `GET /payments/wallet` | authenticated | none | `{ balance, currency, isLocked, recentTransactions, topUp: { available, min, max } }` (top-up limits: Rs 100 to `WALLET_TOPUP_MAX`, default Rs 50,000) |
| `GET /payments/wallet/transactions` | authenticated | query `page`, `limit` (default 20, max 100) | `{ transactions: [{ id, type, amount, balanceAfter, description, status, orderId, orderNumber, createdAt }], pagination }` |
| `POST /payments/wallet/topup` | authenticated, submission limit | `amount` (>0; checked against the limits above, 400 `INVALID_TOPUP_AMOUNT`) | `{ redirectUrl, tracker, amount }`; the wallet is credited when Safepay confirms |

An order paid online only becomes visible to the kitchen's payment flow once the webhook or the signed return settles it; abandoned attempts expire (`expireAbandonedAttempts` job).

## Communities: `/communities`

`community.routes.ts`. Detection and lookup are public.

| Method and path | Access | Body / query | Returns |
|---|---|---|---|
| `GET /communities` | public | none | active communities with counts |
| `GET /communities/detect`, `POST /communities/detect` | public | `lat`/`lng` in the query, or `latitude`/`longitude` in the body; non-numeric gives 400 `{ success: false, message }` | `{ community, distanceKm, isInsideRadius }` for the nearest active community |
| `GET /communities/:identifier` | public | id or slug | the community and its sellers |
| `POST /communities/me/primary` | authenticated | `communityId` (required, else 400) | `{ success, primaryCommunity }`; also sets the profile's area and city |

## Hubs: `/hubs`

`hub.routes.ts`, `hub.validator.ts`. Hub centers hold cold-chain stock. `hub_manager` users operate only the hub they are assigned to (`assertHubAccess`); admins can operate any.

| Method and path | Access | Body / query | Returns |
|---|---|---|---|
| `GET /hubs` | public | query `city` | hub centers |
| `GET /hubs/mine` | role hub_manager or admin | none | the hubs the caller manages |
| `GET /hubs/:id/inventory` | public | query `categoryId`, `search` | stock available at the hub |
| `GET /hubs/:id/stats` | hub access | none | hub numbers |
| `GET /hubs/:id/batches` | hub access | query `status`, `search` | stock batches |
| `POST /hubs/:id/intake` | hub access | `productId`, `quantity` (1 to 1,000,000), `batchNumber` (1-100), `expiryDate`, `measuredTemperatureCelsius` (-100..100); optional `sellerId`, `manufacturedDate`, `storageUnit`, `barcode` | 201 the recorded batch |
| `PATCH /hubs/:id/batches/:batchId/status` | hub access | `status`: `available` \| `damaged` \| `reserved` \| `expired`; optional `reason` | the batch |
| `POST /hubs/:id/temperature-logs` | hub access | `temperatureCelsius` (-100..100); optional `freezerUnit` (1-100), `notes` | 201 the log |
| `GET /hubs/:id/temperature-logs` | hub access | query `limit` (default 50, bounded in the service) | logs |
| `PUT /hubs/:id/manager` | role admin | `managerId` (string or `null` to clear) | the hub |

## Riders: `/riders`

`rider.routes.ts`, `rider.validator.ts`. Every route needs role `rider`.

| Method and path | Body / query | Returns |
|---|---|---|
| `GET /riders/me` | none | the rider's profile |
| `GET /riders/me/earnings` | query `page` | earnings, cash held and ledger entries |
| `GET /riders/me/application` | none | the rider's application status |
| `PUT /riders/me/application` | submission limit. `city` (2-60), `vehicleType`: `motorcycle` \| `bicycle` \| `scooter` \| `car` \| `rickshaw`, `vehicleNumber` (2-20); optional `licenseNumber`, `cnicFrontUrl`, `cnicBackUrl`, `licenseUrl` (private refs from `POST /upload/documents`) | the application, back to `pending` review |
| `PATCH /riders/duty-status` | optional `isAvailable` (boolean; omitted toggles) | `{ isAvailable }` |
| `GET /riders/deliveries/available` | query `lat`, `lng` (optional; closest pickups first) | open delivery jobs the rider may claim (riders over their cash limit are only offered prepaid jobs) |
| `GET /riders/deliveries/mine` | query `history` (optional whole number, 0 to 200; anything else is ignored) | every job still running, and the latest `history` finished ones, newest first: 30 unless asked, none for 0, at most 200 (cancelled jobs disappear after a day). The full record of money is under `GET /riders/me/earnings`; the rider's lifetime count is `totalDeliveries` on `GET /riders/me` |
| `POST /riders/deliveries/:id/claim` | optional `askFee` (rupees; must lie in the allowed corridor for the job, else 400 `BID_OUT_OF_BOUNDS`) | the claimed delivery. A rider holds at most two active jobs; 409 `RIDER_OFF_DUTY` when off duty |
| `PATCH /admin/riders/:id/community` (admin) | `communityId` (uuid or null) | `{ communityId }`. Sets the community the rider serves, for automatic assignment |
| `POST /riders/deliveries/:id/release` | none | `{ released: true }`. Hands a job back to the pool before pickup (`assigned` or `arrived_at_pickup`), else 409 `CANNOT_RELEASE` |
| `PATCH /riders/deliveries/:id/status` | `status`: `arrived_at_pickup` \| `picked_up` \| `in_transit` \| `arrived_at_customer` \| `delivered` \| `delivery_failed`; `reason` (1-500, required for `delivery_failed`); `otp` (4 digits, the customer's handover PIN, for `delivered`). `picked_up` and `in_transit` return 409 `FOOD_NOT_READY` until the kitchen has marked the order ready, and so does `delivery_failed` from `arrived_at_pickup` (hand the job back instead); `picked_up` on an order paid online or by transfer returns 409 `PAYMENT_NOT_CONFIRMED` until the payment is confirmed; any move on a cancelled or refunded order returns 409 `ORDER_ALREADY_TERMINAL` | the delivery |
| `POST /riders/deliveries/:id/location` | location limit. `latitude` (23.5..37.5), `longitude` (60.5..77.5): numbers inside Pakistan, else 400 `VALIDATION_ERROR` | `{ delivery, currentLocation, distanceToPickupMeters, distanceToDeliveryMeters, isInsidePickupGeofence, isInsideDeliveryGeofence, autoTriggeredStatus }`. 403 if not the rider's job, 409 `DELIVERY_NOT_ACTIVE` once it has finished. Details in the realtime doc |

## Reviews: `/reviews`

`review.routes.ts`, `review.validator.ts`.

| Method and path | Access | Body / query | Returns |
|---|---|---|---|
| `GET /reviews/products/:id/reviews` | public | same query as `GET /products/:id/reviews` | same |
| `POST /reviews` | authenticated, submission limit | `orderId` (uuid), `orderItemId` (uuid), `productRating` (1-5), `sellerRating` (1-5); optional `deliveryRating` (1-5), `comment`, `photos[]` (URLs) | 201 the review. The order must be the caller's and delivered (400 `ORDER_NOT_DELIVERED`); one review per item (duplicate gives 409 `DUPLICATE_RECORD`) |

## Promotions: `/promotions`

`promotion.routes.ts`, `promotion.validator.ts`.

| Method and path | Access | Body / query | Returns |
|---|---|---|---|
| `GET /promotions/catalog` | public | query `productIds` (comma list) | promotions per product, for catalog badges |
| `POST /promotions/validate` | authenticated, promo limit | `code`, `cartTotal` (>=0) | whether the code applies and the discount |
| `GET /promotions/available` | authenticated | none | promotions the caller can use |
| `GET /promotions` | role seller | none | the seller's own promotions |
| `GET /promotions/:id` | role seller | none | one of the seller's promotions |
| `POST /promotions` | role seller | `name` (1-255), `code` (1-50, upper-cased, spaces removed), `discountType`: `percentage` \| `fixed`, `discountValue` (>=0, at most 100 for percentage), `validFrom`, `validUntil` (after `validFrom`); optional `description`, `maxDiscountAmount`, `minOrderAmount` (default 0), `usageLimitTotal`, `usageLimitPerUser` (default 1), `applyTo`: `all` \| `selected` (default `all`; `selected` needs `productIds[]`), `productIds[]` | 201 |
| `PATCH /promotions/:id` | role seller | any subset, plus `isActive` | updated |
| `DELETE /promotions/:id` | role seller | none | message |

Platform-wide promo codes (paid by Nuray) are managed by admins under `/admin/promotions`.

## Favorites: `/favorites`

All routes need authentication; they act on kitchens (sellers).

| Method and path | Notes |
|---|---|
| `GET /favorites` | query `lat`, `lng` (optional); the caller's favourite kitchens |
| `POST /favorites/:sellerId` | adds a favourite |
| `DELETE /favorites/:sellerId` | removes it |
| `GET /favorites/check/:sellerId` | whether the kitchen is a favourite |

## Notifications: `/notifications`

All routes need authentication (`notification.routes.ts`, `notification.validator.ts`). A new notification is also pushed live as the `notification:new` socket event.

| Method and path | Body / query | Returns |
|---|---|---|
| `GET /notifications` | query `page`, `limit` (default 20), `isRead` (`true`/`false`) | `{ notifications, unreadCount, pagination }` |
| `GET /notifications/preferences` | none | which categories reach the user on which channels |
| `PUT /notifications/preferences` | `preferences`: object with optional keys `orders`, `payments`, `deliveries`, each an object with optional booleans `push`, `email`, `sms` | the saved preferences |
| `GET /notifications/push/public-key` | none | `{ publicKey }`: the VAPID public key for web push |
| `POST /notifications/push/subscriptions` | `endpoint` (URL), `keys: { p256dh, auth }` (the browser's `PushSubscription`) | 201 message; a device that already belonged to another account moves to this one |
| `DELETE /notifications/push/subscriptions` | `endpoint` | message |
| `PATCH /notifications/:id/read` | none | message |
| `PATCH /notifications/read-all` | none | message |

Preferences only control the extra channels (push, email, SMS); the in-app notification is always created.

## Support: `/support`

All routes need authentication. Admin support routes are under `/admin/support`.

| Method and path | Body / query | Returns |
|---|---|---|
| `POST /support/tickets` | submission limit. `category`, `subject` (min 5), `description` (min 10); optional `orderId` (uuid), `priority`: `low` \| `medium` \| `high` \| `urgent` | 201 the ticket |
| `GET /support/tickets` | query `status` (`open` \| `in_progress` \| `resolved` \| `closed`), `page`, `limit` (1-100) | the caller's tickets with pagination |
| `GET /support/tickets/:id` | none | one ticket with messages (the caller must own it) |
| `POST /support/tickets/:id/messages` | message limit. `message` (min 1) | 201 the ticket |

## Realtime: `/realtime`

| Method and path | Access | Returns |
|---|---|---|
| `GET /realtime/orders/:id/track` | authenticated; the order's customer, a seller with an item in it, or an admin | status snapshot: status, payment status, history (last 10: status, notes, time), items (a seller sees its own only), delivery summary |

The Socket.IO server itself is documented in [REALTIME_ORDER_MANAGEMENT.md](./REALTIME_ORDER_MANAGEMENT.md).

## Upload: `/upload`

`upload.routes.ts`, `controllers/upload.controller.ts`, `services/upload.service.ts`. Multipart form data, authenticated, upload limit (60 per 10 minutes per user). Images are decoded and resized to WebP; wrong or corrupt files are rejected.

| Method and path | Access | Form field and limit | Returns |
|---|---|---|---|
| `POST /upload/product-images` | role seller | `images`, up to 4 files, 8 MB each | `{ images: [{ ...stored image, originalName, size, isPrimary }] }` (first is primary). Public URLs |
| `DELETE /upload/product-images` | role seller or admin | query or body `url` of the image | message. Only the uploader (or an admin) may delete; 409 `IMAGE_IN_USE` while a product uses it |
| `DELETE /upload/product-images/:filename` | role seller or admin | none | deletes a legacy file (uploaded before the storage layer) |
| `POST /upload/payment-proof` | any authenticated | `proof`, 1 file, 5 MB | `{ url, ref, previewUrl, size, mimetype }`: private; send `url` as `proofUrl` to `/orders/:id/submit-payment` |
| `POST /upload/chat-media` | any authenticated | `file`, 1 file, 5 MB (image, or audio for a voice note) | `{ url, ref, previewUrl, mediaType: "image" \| "voice" }` |
| `POST /upload/documents` | any authenticated | `file`, 1 file, 10 MB (image or PDF) | `{ url, ref, previewUrl }`: private, for sellers' and riders' verification documents |
| `POST /upload/avatar` | any authenticated | `avatar`, 1 image, 8 MB | the stored public image |
| `POST /upload/cover` | any authenticated | `cover`, 1 image, 8 MB | the stored public image (storefront cover; also for people applying to sell) |

## Stats: `/stats`

| Method and path | Access | Returns |
|---|---|---|
| `GET /stats/public` | public, cached 5 minutes (`Cache-Control: public, max-age=300`) | `{ kitchens, communities, dishes, reviews, averageRating }` (real counts; `averageRating` is `null` below 20 reviews) |

## Health: `/health`

Outside the API rate limit (load balancers poll these).

| Method and path | Access | Returns |
|---|---|---|
| `GET /health` | public | `{ success, data: { status: "ok" \| "degraded" \| "unhealthy", timestamp, services: { database, redis ("healthy" / "unhealthy" / "not_configured"), payment_gateways }, version } }`; 503 only when the database is down (a Redis outage reports `degraded` with 200) |
| `GET /health/live` | public | `{ data: { status: "alive" } }` |
| `GET /health/ready` | public | `{ data: { status: "ready", database } }`; 503 while shutting down or without the database |

## Admin: `/admin`

Every route under `/admin` needs role `admin` (`admin.routes.ts`, `admin-order.routes.ts`). Both routers are mounted at `/admin`, and every non-GET request is written to the audit log (`middleware/audit.ts`): who, action, record, the body (with passwords, tokens and handover codes redacted) and the response status. Requests refused with 401/403 are logged as `admin:DENIED`. Reads are not logged. Admin-only routes elsewhere (categories, category requests, hub operations, an admin acting through `/seller/orders/*`) are logged too.

### Orders, refunds and analytics

| Method and path | Body / query | Returns |
|---|---|---|
| `GET /admin/analytics` | query `dateFrom`, `dateTo` | platform analytics |
| `GET /admin/statistics` | none | order statistics |
| `GET /admin/orders` | query `page`, `limit`, `orderStatus`, `paymentStatus` (`pending`, `paid`, `failed`, `refunded`, `refund_pending`, `payment_submitted`, `disputed`), `customerId`, `sellerId` (a kitchen's own id, as in `items[].seller.id` of the rows; the id of the account that owns it also works; an unknown id lists nothing), `dateFrom`, `dateTo`, `orderNumber` | `{ orders, pagination }` |
| `GET /admin/orders/:id` | none | full order |
| `PATCH /admin/orders/:id/status` | `status` (`pending` ... `completed`, `cancelled`, `refunded`), optional `notes` (max 500) | the order |
| `POST /admin/orders/:id/cancel` | `reason` (5-500) | cancels, restocks, refunds if paid, closes any delivery job |
| `POST /admin/orders/:id/retry-delivery` | none | after a failed delivery: sends the order back out for dispatch instead of cancelling; unassigns the previous rider |
| `POST /admin/orders/:id/refund` | optional `refundAmount` (>0; capped at what was paid) | refund result |
| `POST /admin/orders/:id/confirm-payment` | optional `note` (max 500) | confirms a disputed or unconfirmed transfer after support checked it |
| `GET /admin/refunds` | query `status` (`pending` \| `completed` \| `failed`), `page`, `limit` | refund records with pagination |
| `POST /admin/refunds/:refundId/complete` | optional `reference` (max 255) | marks a manual refund as sent |
| `POST /admin/refunds/:refundId/dismiss` | `reason` (5-500) | dismisses a refund that is not owed |

### Sellers, riders and products

| Method and path | Body / query | Returns |
|---|---|---|
| `GET /admin/pending-sellers` | none | sellers awaiting approval |
| `GET /admin/sellers` | query `status`, `verificationStatus`, `page`, `limit` | sellers with pagination |
| `GET /admin/sellers/:id` | none | one seller with documents |
| `POST /admin/sellers/:id/approve`, `POST /admin/sellers/:id/reject` | `approved` (boolean, required by the schema; it decides), optional `notes` | decision |
| `POST /admin/sellers/:id/status` | `status`: `active` \| `suspended` | suspends or reactivates an approved seller |
| `GET /admin/pending-riders` | none | riders awaiting approval |
| `POST /admin/riders/:id/approve`, `POST /admin/riders/:id/reject` | `approved` (boolean, required), optional `reason` | decision |
| `POST /admin/riders/:id/status` | `status`: `active` \| `suspended` | suspends or reactivates; jobs not yet picked up return to the pool (and `delivery:new` is emitted) |
| `GET /admin/products` | query `moderationStatus` (or `status`), `page`, `limit` | products for moderation |
| `POST /admin/products/:id/moderate` | `approved` (boolean), optional `reason` | decision |

### Rider money

`controllers/admin-rider.controller.ts`, `services/rider-ledger.service.ts`. Amounts are rupees with at most two decimals.

| Method and path | Body / query | Returns |
|---|---|---|
| `GET /admin/riders/money` | query `search`, `filter` (`holding_cash` = cash to collect, `owed` = the platform owes them), `page`, `limit` (default 25) | riders with their cash and balance, with pagination |
| `GET /admin/riders/:id/money` | query `page` | one rider's ledger |
| `POST /admin/riders/:id/settlements` | optional `cashHandedIn` (0 to 1,000,000), `keptAsPay` (0 to 1,000,000), at least one above zero; optional `reference` (max 100), `note` (max 300) | 201 settle up: cash handed in and pay kept from it |
| `POST /admin/riders/:id/payouts` | `amount` (>0, max 1,000,000); optional `reference`, `note` | 201 `{ id, amount }` records a payout |
| `POST /admin/riders/:id/adjustments` | `amount` (non-zero, up to 1,000,000 in size, may be negative), `note` (required, max 300) | 201 `{ id, amount }` |
| `PATCH /admin/riders/:id/cash-limit` | `cashLimit` (0 to 1,000,000, or `null` for the default `RIDER_CASH_LIMIT`, Rs 10,000 unless set); returns `{ cashLimit, isDefault }` | the updated limit |

### People

| Method and path | Body / query | Returns |
|---|---|---|
| `GET /admin/users` | query `search` (email, phone, name, business name), `type` (a role), `status`, `page`, `limit` (default 25, max 100) | `{ users, pagination }` |
| `POST /admin/users/:id/status` | `status`: `active` \| `suspended` | suspends or reactivates any account |
| `GET /admin/hub-managers` | none | users with the `hub_manager` role |
| `POST /admin/hub-managers` | `identifier` (email or phone, 3-120) | 201 grants the role; the person has to sign in again |
| `DELETE /admin/hub-managers/:id` | none | removes the role |

### Places

| Method and path | Body | Returns |
|---|---|---|
| `GET /admin/communities` | none | all communities |
| `POST /admin/communities` | required `name` (2-80), `city` (2-60), `centerLatitude`, `centerLongitude`; optional `slug`, `areaDescription`, `radiusKm` (0.2-50), `deliveryBaseFee` (0-5000), `crossCommunityBaseFee` (0-5000), `crossCommunityEnabled`, `neighborCommunityIds[]` (uuids, max 50), `isActive` | 201 |
| `PATCH /admin/communities/:id` | any subset | updated |
| `GET /admin/community-pair-fees` | none | Nuray delivery prices set between pairs of communities |
| `PUT /admin/community-pair-fees` | `communityAId`, `communityBId`, `fee` (0-5000) | saves the price (the same in both directions) |
| `DELETE /admin/community-pair-fees/:id` | none | removes the pair price |
| `GET /admin/hubs` | none | all hubs |
| `POST /admin/hubs` | required `name` (2-80), `code` (2-20), `city`, `area`, `address` (5-300), `latitude`, `longitude`, `capacityCubicFeet` (1 to 1,000,000); optional `freezerUnits` (1-500), `contactPhone`, `status`: `active` \| `inactive` \| `maintenance` | 201 |
| `PATCH /admin/hubs/:id` | any subset | updated |
| `PUT /admin/hubs/:id/manager` | `managerId` (uuid or `null`) | assigns or clears the manager (same effect as `PUT /hubs/:id/manager`) |

### Platform promo codes

Same body schemas as seller promotions (see Promotions), but the discount is paid by Nuray.

| Method and path | Notes |
|---|---|
| `GET /admin/promotions` | list |
| `POST /admin/promotions` | 201 create |
| `PATCH /admin/promotions/:id` | update |
| `DELETE /admin/promotions/:id` | delete |

### Seller payouts

| Method and path | Body / query | Returns |
|---|---|---|
| `GET /admin/payouts` | query `status`, `page`, `limit` | payout requests with pagination |
| `POST /admin/payouts/:id/complete` | optional `transactionId` | marks paid; 409 `PAYOUT_EXCEEDS_BALANCE` when a refund since the request means the kitchen's balance no longer covers it (fail it instead) |
| `POST /admin/payouts/:id/fail` | `reason` (required) | marks failed |

### Settings

| Method and path | Body | Returns |
|---|---|---|
| `GET /admin/settings` | none | all platform settings (defaults merged with saved values): `platformName` (`Nuray`), `supportEmail`, `supportPhone`, `commissionRate` (15), `minPayoutAmount` (1000), `deliveryPerKm` (20), `deliveryIncludedKm` (3), `deliveryMaxKm` (20), `deliveryFallbackFee` (150) |
| `PATCH /admin/settings` | any of: `platformName`, `supportEmail`, `supportPhone`, `commissionRate` (0-100), `minPayoutAmount` (>=0), `deliveryPerKm` (0-1000), `deliveryIncludedKm` (0-100), `deliveryMaxKm` (1-200), `deliveryFallbackFee` (0-5000) | all settings; the delivery pricing cache is invalidated when a delivery key changes |

### Support tickets

| Method and path | Body / query | Returns |
|---|---|---|
| `GET /admin/support/tickets` | query `status`, `priority`, `assignedTo` (admin id or `unassigned`), `search` (subject, ticket number, order number, customer), `page`, `limit` | tickets with pagination (each with `orderNumber`, `assignedTo`) |
| `GET /admin/support/tickets/:id` | none | one ticket with messages, including internal notes and status-change lines (`isInternal`) |
| `POST /admin/support/tickets/:id/reply` | `message` (min 1), optional `status` (`open` \| `in_progress` \| `resolved` \| `closed`), optional `internal` (true: an admin-only note, the customer is not told and never sees it) | 201 the ticket. A normal reply notifies the customer |

### Staff and approvals

| Method and path | Body | Returns |
|---|---|---|
| `GET /admin/approvals` | | `{ items: [{ key, label, href, count, oldestWaitingSince }], total }`, only the queues the caller's role can act on |
| `GET /admin/staff` | | all staff with `role`, `permissions`, `status`, `lastLoginAt` (super admin only) |
| `POST /admin/staff` | `email`, `fullName`, `role` (`admin` \| `support`), `password` (min 12) | 201 the new member |
| `PATCH /admin/staff/:id` | `role` | the member; their sessions end |
| `POST /admin/staff/:id/status` | `status` (`active` \| `suspended`) | the member; suspending ends their sessions |
| `POST /admin/staff/:id/password` | `password` (min 12) | sets a new password and ends their sessions |
| `DELETE /admin/staff/:id` | | removes staff access (account becomes a customer) |

The super admin and your own account cannot be changed. Login and `GET /auth/me` return `staffRole` and `permissions` for staff. A role that may not do something gets 403 `INSUFFICIENT_STAFF_ROLE` with `details.permission`.

### Audit log

| Method and path | Query | Returns |
|---|---|---|
| `GET /admin/audit-logs/export` | the same filters | a CSV file (at most 5,000 rows); the export is logged |
| `GET /admin/audit-logs` | `page`, `limit` (default 50, max 100), `entityType`, `entityId`, `userId`, `action` (contains, case-insensitive), `dateFrom`, `dateTo`, `result` (`ok` \| `refused`) | `{ logs: [{ id, action, entityType, entityId, responseStatus, requestData, ipAddress, createdAt, admin: { id, name, email } }], pagination }`, newest first |

## Limitations

- The refresh endpoint hands out a new refresh token without invalidating the old one (no rotation with reuse detection), and sessions are not listed per device: logout, a password reset or change, a suspension, a role change, an account takeover and account closure each end every session of the account at once (`tokensValidAfter`).
- `GET /realtime/orders/:id/track` rejects the order's assigned rider, although a rider can join the order's socket room.
- Several routes read their body without a zod schema (seller reject reason, manual payment submission, order-payment confirmation, rider location, category requests, Google sign-in). Their checks are in the controller or service.
- Error shapes are not completely uniform: `community.controller.ts` returns its 400s as `{ success: false, message }` without an `error` object.
