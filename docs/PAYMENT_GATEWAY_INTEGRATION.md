# Payment Gateway Integration Guide

How to add **JazzCash**, **EasyPaisa**, **Bank transfer**, and **Cards** to FrozenNuray.

---

## 1. Overview

| Method        | How it works                    | Best for              | Docs / Sign-up                    |
|---------------|----------------------------------|-----------------------|-----------------------------------|
| **JazzCash** | Mobile wallet, card, redirect   | Customers with Jazz   | [JazzCash Merchant](https://payments.jazzcash.com.pk) |
| **EasyPaisa**| Mobile wallet, OTC, REST API    | Customers with Telenor| [EasyPaisa Merchant](https://easypay.easypaisa.com.pk) |
| **Bank**     | IBFT / 1LINK, bank APIs         | Bank account holders | Via bank or aggregator           |
| **Card**     | Visa/Mastercard                 | Cards                 | JazzCash Card API or aggregator  |
| **COD**      | Cash on delivery                 | Already implemented   | —                                 |
| **Wallet**   | In-app balance                   | Already implemented   | —                                 |

Your app already supports **COD** and **Wallet**. This guide is for adding **JazzCash**, **EasyPaisa**, and **Bank**.

---

## 2. High-level flow

```
Customer selects "JazzCash" / "EasyPaisa" / "Bank"
        ↓
Backend: POST /payments/process { orderId, paymentMethod, paymentDetails }
        ↓
Backend calls gateway: "create payment" (amount, order ref, return URL, etc.)
        ↓
Gateway returns: paymentId, redirectUrl (or mobile deep link)
        ↓
Frontend redirects user to redirectUrl (JazzCash/EasyPaisa page or bank)
        ↓
User pays on gateway; gateway redirects back to your site (success/cancel URL)
        ↓
Backend: POST /payments/verify (or gateway calls your webhook)
        ↓
Backend verifies with gateway API, then marks order as paid
```

---

## 3. Step-by-step

### Step 1: Get merchant credentials

**JazzCash**

1. Go to [JazzCash Merchant Portal](https://payments.jazzcash.com.pk).
2. Register as merchant; complete KYC/agreement.
3. Get **Merchant ID** and **Password** (and use **Sandbox** for testing).
4. Read: [JazzCash Sandbox / API References](https://payments.jazzcash.com.pk/SandboxDocumentation/ApiReferences.html).

**EasyPaisa**

1. Go to [EasyPaisa Easypay Merchant](https://easypay.easypaisa.com.pk/easypay-merchant/).
2. Sign up for merchant / e-commerce.
3. Get **Store ID**, **API keys**, and **Sandbox** access.
4. Read: [EasyPaisa Integration Guides](https://easypay.easypaisa.com.pk/easypay-merchant/faces/pg/site/IntegrationGuides.jsf).

**Bank (IBFT / 1LINK)**

- Usually via your **acquiring bank** or a **payment aggregator** (e.g. PayPro, 1LINK member bank).
- Ask your bank for “e-commerce payment API” or “IBFT merchant API”.

### Step 2: Add credentials to backend

In `backend/.env`:

```env
# JazzCash (from JazzCash merchant portal)
JAZZCASH_MERCHANT_ID=your_merchant_id
JAZZCASH_PASSWORD=your_merchant_password
JAZZCASH_RETURN_URL=https://yourdomain.com/orders/payment-return
JAZZCASH_CANCEL_URL=https://yourdomain.com/checkout?cancel=1
JAZZCASH_SANDBOX=true

# EasyPaisa (from EasyPaisa merchant portal)
EASYPAISA_STORE_ID=your_store_id
EASYPAISA_API_KEY=your_api_key
EASYPAISA_RETURN_URL=https://yourdomain.com/orders/payment-return
EASYPAISA_SANDBOX=true

# Bank / aggregator (if you use one)
# BANK_API_URL=
# BANK_MERCHANT_ID=
# BANK_API_KEY=
```

Use **Sandbox** URLs and credentials for testing; switch to live keys and URLs for production.

### Step 3: Implement gateway adapters

The codebase has a **gateway adapter** layer under `backend/src/gateways/`:

- `jazzcash.gateway.ts` – JazzCash API (create payment, verify).
- `easypaisa.gateway.ts` – EasyPaisa REST API (create payment, verify).
- `bank.gateway.ts` – Optional; for your bank or aggregator.

Each adapter:

1. **Create payment**: call gateway “initiate” API with amount, order ref, return/cancel URLs; return `paymentId` and `redirectUrl`.
2. **Verify payment**: on return or webhook, call gateway “verify” API; then your backend marks the order as paid.

Your `payment.service.ts` already calls these adapters when `paymentMethod` is `jazzcash`, `easypaisa`, or `bank`. Fill in the real API calls and signing (e.g. HMAC) using the official docs.

### Step 4: Return and verify URLs

1. **Return URL** (success): e.g. `https://yourdomain.com/orders/payment-return?orderId=xxx&paymentId=yyy&transactionId=zzz`.
2. **Cancel URL**: e.g. `https://yourdomain.com/checkout?cancel=1`.

On **Return URL** your frontend should:

- Call `POST /payments/verify` with `paymentId` and `transactionId` (from query or body, as per gateway).
- Show success/failure and redirect to order detail or checkout.

Some gateways also send a **server-to-server webhook**. If they do, add a route (e.g. `POST /payments/webhook/jazzcash`) that verifies the webhook signature, then calls the same verify logic and marks the order paid.

### Step 5: Frontend

- On checkout, show only methods returned by `GET /payments/methods` (your backend can enable/disable by config).
- When user selects JazzCash/EasyPaisa/Bank:
  - Call `POST /payments/process` with `orderId`, `paymentMethod`, and any `paymentDetails` (e.g. phone for wallet).
  - Use the returned `redirectUrl` to redirect the user: `window.location.href = redirectUrl`.
- On the payment-return page, call `POST /payments/verify` and then show the order status.

---

## 4. Gateway-specific notes

### JazzCash

- APIs: **Mobile Account**, **Card** (Authorize/Capture), **Voucher**.
- Auth: Merchant ID + Password; many APIs use **SecureHash** (HMAC).
- Amount in **PKR, no decimals**.
- Docs: [JazzCash Sandbox Documentation](https://payments.jazzcash.com.pk/SandboxDocumentation/ApiReferences.html).

### EasyPaisa

- **REST API** for Mobile Account, OTC, etc.; **POST redirect** for cards.
- Auth: Store ID + API key (or similar; check current docs).
- Docs: [EasyPaisa Integration Guides](https://easypay.easypaisa.com.pk/easypay-merchant/faces/pg/site/IntegrationGuides.jsf).

### Bank (IBFT / 1LINK)

- Flow is bank-specific or aggregator-specific.
- Typically: redirect to bank page or open bank app; callback or webhook with transaction id; you verify with bank/aggregator API and then mark order paid.

---

## 5. Security

- Never log or expose full card numbers; use gateway **tokenization** if offered.
- Validate **webhook signatures** using the gateway’s documented method.
- Use **HTTPS** and **Sandbox** until go-live.
- Store credentials only in **environment variables** or a secrets manager, not in code.

---

## 6. Testing

1. Use **Sandbox** credentials and Sandbox URLs for JazzCash and EasyPaisa.
2. Create a test order; select JazzCash/EasyPaisa; complete redirect and return flow.
3. Call `POST /payments/verify` and confirm order moves to “paid”.
4. Repeat for EasyPaisa (and bank if implemented).

---

## 7. Summary

| Step | Action |
|------|--------|
| 1 | Sign up as merchant with JazzCash and EasyPaisa (and bank if needed). |
| 2 | Add credentials and return/cancel URLs to `backend/.env`. |
| 3 | Implement `createPayment` and `verifyPayment` in `backend/src/gateways/jazzcash.gateway.ts` and `easypaisa.gateway.ts` using official docs. |
| 4 | Add payment-return page that calls `POST /payments/verify` and optional webhook route. |
| 5 | Frontend: redirect to `redirectUrl` after `POST /payments/process`. |

Your existing **COD** and **Wallet** logic stays as-is; the same `processPayment` and `verifyPayment` flow is extended for JazzCash, EasyPaisa, and bank when you plug in the gateways.
