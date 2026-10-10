# Payments

How customers pay on Nuray, who ends up holding the money, and the code behind it. Safepay is the only live payment
gateway. Security properties of the payment code are summarised in
[SECURITY_AND_COMPLIANCE.md](SECURITY_AND_COMPLIANCE.md); environment variables are in
[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

## Payment methods

`GET /api/v1/payments/methods` (`PaymentService.getPaymentMethods`) lists them. The order's `paymentMethod` is one
of `cod`, `wallet`, `safepay` (`card` is accepted as an alias), `jazzcash`, `easypaisa`, `bank`
(`validators/order.validator.ts`).

| Method | What it is | Always available? | Money is held by (`paymentCollectedBy`) |
|---|---|---|---|
| `cod` | Cash on delivery or pickup | yes | the rider (Nuray delivery), the kitchen (self-delivery or self pickup), or the platform (hub pickup) |
| `safepay` | Card, JazzCash or EasyPaisa through Safepay's hosted checkout | only if Safepay keys are set | platform |
| `wallet` | Nuray Wallet balance | yes | platform |
| `jazzcash`, `easypaisa`, `bank` | The customer transfers to the kitchen's own account, uploads a receipt, the kitchen confirms | yes | the kitchen |

Who holds the money is decided in `backend/src/utils/paymentCustody.ts` (`codCollectorOf`, `collectorOf`). It drives
the ledger, the rider's cash balance and what the kitchen and platform owe each other: the kitchen's share of
platform-held money is paid out later by an admin; a kitchen holding the money owes the platform its commission,
platform delivery fee and tax; a rider holding cash owes it to the platform until an admin settles up.

## How each flow works

### Cash on delivery

The order is created with `paymentStatus: pending`. When the order is marked delivered (the handover needs the customer's PIN), it
becomes paid, with the collector from `codCollectorOf` (for example `admin-order.service.ts`). The rider's ledger and
cash limit (`RIDER_CASH_LIMIT`) are in `rider-ledger.service.ts`.

### Wallet

Selected at checkout: `createOrder` (`order-placement.service.ts`) debits the wallet in the same database transaction that creates the
order, so an order never exists waiting for wallet money that is not there. An existing unpaid order can also be paid
from the wallet with `POST /payments/process` (`PaymentService.processWalletPayment`). Debits are conditional
updates (`wallet.service.ts`), so two requests cannot overdraw it. Every change writes a `wallet_transactions` row
with the balance before and after.

Money enters a wallet by Safepay top-up (below), by a refund of a wallet-paid order (instant, in the cancelling
transaction), or when an online payment was not needed (a second payment for an already paid order, or the part
above a reduced total).

### Online payment with Safepay

1. At checkout the customer picks `safepay`; the order is created `pending`. The kitchen is not alerted to a
   paid-looking order yet: `emitNewOrderNotification` sends no push, email or SMS while an online order is unpaid.
2. The frontend calls `POST /payments/process` with `paymentMethod: "safepay"`. `startOrderCheckout`
   (`online-payment.service.ts`) creates a Safepay checkout session for the order total, stores a `PaymentAttempt`
   (purpose, order, amount, tracker) and returns `redirectUrl`. The customer goes to Safepay's page.
3. Safepay confirms in two ways, whichever arrives first:
   - The customer's browser is sent back to `BASE_URL/api/v1/payments/safepay/return` with `tracker` and a signature
     (`safepayReturn` verifies HMAC-SHA256 of the tracker with the secret key), and is then redirected to the right
     page of the web app (`landingUrlFor`).
   - Safepay POSTs to `/api/v1/payments/safepay-webhook`, signed in `X-SFPY-SIGNATURE`
     (`safepayWebhook`). Only successful-payment events act; everything else gets 200 and is ignored.
4. `settleAttempt` locks the attempt row, and exactly once marks the order `paid` (`paymentCollectedBy: platform`),
   records status history and then tells the kitchen ("New paid order", push, email and SMS) and the customer. If
   the order was cancelled in the meantime a refund is issued; if the customer paid more than the current total
   the difference goes to the wallet; if the order was already paid or the amount is short, the payment is credited
   to the wallet instead.
5. Sessions nobody completes are closed after 2 hours by the `expire-payment-attempts` job (a late confirmation
   still settles). Unpaid online orders are cancelled by the stale-order sweep after `ORDER_PAYMENT_TIMEOUT_MINUTES`
   (default 60).

`POST /payments/verify` and `GET /payments/orders/:orderId/status` are read-only status checks for the customer's
pages; they never settle anything.

### Wallet top-up

`POST /payments/wallet/topup` with `{ amount }` (Rs 100 up to `WALLET_TOPUP_MAX`, default 50,000) starts a session
with `purpose: wallet_topup` through the same Safepay flow. Settlement credits the wallet and notifies the customer.
Locked wallets cannot top up.

### Transfer to the kitchen (JazzCash, EasyPaisa, bank)

Nuray never touches this money. The steps are in `order-payment.service.ts`, except the reminder and the timeout (`order-maintenance.service.ts`) and the refund (`refund.service.ts`):

1. `GET /orders/:id/payment-details` (`getSellerPaymentDetails`) shows the accounts the kitchen has configured
   (JazzCash, EasyPaisa, bank). Nothing is shown if the kitchen set none; there are no placeholder accounts.
2. The customer sends the money, uploads the receipt (`POST /upload/payment-proof`, stored privately) and submits
   `POST /orders/:id/submit-payment` with a reference number. The receipt must be one this customer uploaded. The
   order goes to `payment_submitted` and the kitchen is told to check its account.
3. The kitchen confirms or disputes with `POST /orders/:id/confirm-payment`
   (`confirmManualPayment`). Only the paid seller may do it, and only from `payment_submitted`. Confirmed: order
   `paid`, collected by the seller. Disputed: `disputed` with a reason, and the customer can resubmit.
4. If the kitchen does nothing for `PAYMENT_CONFIRM_ESCALATE_HOURS` (default 6), admins are alerted once.
5. An admin can settle a disputed or unconfirmed transfer after checking the receipt:
   `POST /admin/orders/:id/confirm-payment` (`adminConfirmManualPayment`), recording the kitchen as holder.
6. If the order is cancelled while a transfer is unconfirmed, a refund is queued for an admin to check against the
   receiving account, and can be dismissed if no money arrived (`refund.service.ts`).

An order not confirmed or completed in time (`ORDER_PAYMENT_TIMEOUT_MINUTES`) is cancelled automatically.

### Refunds

`refund.service.ts`. Cancelling a paid order creates a `Refund`, capped at what was paid and still unrefunded.
Wallet-paid orders are refunded to the wallet immediately. Everything else (Safepay, transfers) creates a pending
refund in the admin queue; an admin sends the money outside Nuray (Safepay dashboard, bank transfer) and marks it
sent with a reference (`completeRefund`), or dismisses it (`dismissRefund`). There is no automated Safepay refund
API call.

## The gateway code

```
backend/src/gateways/
  types.ts              IPaymentGateway: name, isConfigured(), createPayment(), verifyPayment()
  index.ts              registry: getGateway(name), getGatewayStatuses() (shown in /health)
  safepay.gateway.ts    real integration
  jazzcash.gateway.ts   stub, refuses everything
  easypaisa.gateway.ts  stub, refuses everything
  bank.gateway.ts       generic bank/aggregator adapter, placeholder REST contract
backend/src/services/
  online-payment.service.ts   Safepay checkout sessions, settleAttempt, expiry, status
  payment.service.ts          payment methods list, /payments/process, wallet payment, read-only verify
  wallet.service.ts           debit/credit, transactions
backend/src/controllers/payment.controller.ts   return and webhook handlers
```

- **Safepay** (`safepay.gateway.ts`): `createSafepayCheckout` calls Safepay's `order/v1/init` to get a tracker and
  builds the hosted-checkout URL with the return and cancel URLs and `webhooks=true`. Sandbox or live is chosen by
  `SAFEPAY_SANDBOX` (only the exact value `false` means live). `verifySafepayReturn` and `verifySafepayWebhook`
  check the two signatures in constant time. `fetchSafepayPayment` looks a tracker up for diagnostics; it never
  settles a payment. The amount is sent in rupees; the file notes it should be confirmed in the sandbox before going
  live.
- **JazzCash and EasyPaisa adapters** are stubs: `isConfigured()` is always false and both methods return
  `GATEWAY_NOT_IMPLEMENTED`. They exist so these names can never fake a payment. Customers use those wallets either
  inside Safepay's checkout or by transfer to the kitchen.
- **Bank adapter** (`bank.gateway.ts`): configured only when `BANK_API_URL`, `BANK_MERCHANT_ID`, `BANK_API_KEY` and
  `BANK_RETURN_URL` are all set. Its endpoints and field names are a placeholder contract to be adapted to whichever
  bank or aggregator is chosen. `verifyPayment` reports `completed` only when an authenticated server call says
  paid, and fails closed on errors and unknown states. `/payments/process` with `paymentMethod: "bank"` calls it only
  when it is configured; otherwise the customer is told to pay by transfer from the order page.

**Limitations.** The bank adapter is not wired into settlement: nothing calls its `verifyPayment` and there is no
callback route for it, so a payment started through it would not mark the order paid by itself. Leave the `BANK_*`
variables empty unless you are building that integration. The `/health` endpoint lists every adapter as
`configured` or `not_configured`.

## Safepay setup

1. Create a Safepay merchant account. In the dashboard get the **public key** and **secret key** (sandbox and live
   have separate ones).
2. Set `SAFEPAY_PUBLIC_KEY`, `SAFEPAY_SECRET_KEY`, and `SAFEPAY_SANDBOX=true` while testing.
3. Set `BASE_URL` to the API's public URL. In production it must be `https://`; customers return to
   `BASE_URL/api/v1/payments/safepay/return`.
4. In Developer, Endpoints, add the webhook `BASE_URL/api/v1/payments/safepay-webhook`, subscribe to successful
   payment events, and copy its shared secret into `SAFEPAY_WEBHOOK_SECRET`. Safepay cannot reach `localhost`: for
   local testing use a tunnel, or rely on the return redirect (the webhook is what covers customers who close the
   page before returning).
5. Test in the sandbox: start an order payment and a wallet top-up, pay, and check the order becomes paid and the
   kitchen is alerted. Re-deliver the webhook from the dashboard to confirm nothing is applied twice.
6. Go live: switch to the live keys and webhook secret and set `SAFEPAY_SANDBOX=false`. Production refuses to start
   with keys set but no webhook secret, a non-https `BASE_URL`, or `SAFEPAY_SANDBOX` unset.

Without the keys, `safepay` is shown as unavailable and wallet top-up is off; COD, wallet and transfers still work.

## Adding a gateway

The only gateway the checkout actually drives is Safepay; the registry (`gateways/index.ts`) is where adapters are
declared. To add another hosted gateway:

1. Create `backend/src/gateways/<name>.gateway.ts` implementing `IPaymentGateway`. Make `isConfigured()` depend on
   environment variables, and make it fail closed: return `completed` only after verifying a signed callback or an
   authenticated server-to-server status call, never on a client's say-so.
2. Register it in `gateways/index.ts` and document its variables in `backend/.env.example`; add validation to
   `config/env.ts` if production must refuse a half-configured setup.
3. Reuse the `PaymentAttempt` pattern from `online-payment.service.ts`: store the session with its order and amount
   first, verify signatures on the return and webhook, and settle in one transaction with a row lock so a
   confirmation applies once and cannot be pointed at another order or amount.
4. Add the method name to `order.validator.ts`, `paymentCustody.ts`, `payment.service.ts` (methods
   list, `validMethods`, `processPayment`) and the checkout page in `frontend-web/app/checkout/page.tsx`.
5. Decide how refunds happen. Anything that is not a wallet refund is queued for an admin to send by hand.
6. Cover signature checking and settlement in `backend/tests` (see `gateways.test.ts`) and the real-database script
   `backend/scripts/verify-money-flows.ts`.
