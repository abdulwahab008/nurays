# FrozenNuray – Account credentials & how to get access

This doc covers all **four account types** (customer, seller, rider, admin): how to register one from
scratch on a fresh database, and — if you're working against *this* local dev database — the accounts
that already exist and are known to work.

Local URLs used throughout this doc:

| | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001/api/v1 |

---

## Quick summary

| Role | Frontend login | Self-registration? | Needs admin approval before full access? |
|---|---|---|---|
| **Customer** | `/login` | Yes, open | No — works immediately |
| **Seller** | `/login` (or `/sellers/register`) | Yes, open | **Yes** — pending until an admin approves at `/admin/pending-sellers` |
| **Rider** | `/login` (redirects to `/riders/dashboard`) | Yes, open | **Yes** — pending until an admin approves at `/admin/riders` |
| **Admin** | `/admin/login` | **No** — cannot self-register | N/A — created via a backend script (below) |

The frontend detects the account's role automatically after login and routes it to the right dashboard —
there's no separate "log in as seller" vs "log in as customer" toggle, it's the same `/login` form for all
three self-registerable roles.

---

## 1. Customer account

Anyone can self-register and use it immediately, no approval step.

**Register via the UI:** go to http://localhost:3000/register and fill the form.

**Register via API:**
```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "password": "Customer123!",
    "full_name": "Test Customer",
    "phone": "03001234567",
    "user_type": "customer"
  }'
```
Then log in at http://localhost:3000/login with that email/password.

---

## 2. Seller account (home kitchen / restaurant)

Self-register, but the account sits in `verificationStatus: 'pending'` until an admin approves it — see
**§5 Admin** below to approve one. Before approval, a seller can still log in and see their own dashboard,
but core seller-only actions may be gated.

**Register via the UI:** http://localhost:3000/sellers/register

**Register via API** (`business_name` is optional — omitting it defaults to `"<full_name>'s Kitchen"`):
```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "seller@example.com",
    "password": "Seller123!",
    "full_name": "Test Seller",
    "business_name": "Homemade Bites",
    "phone": "03001234567",
    "user_type": "seller"
  }'
```
Log in at http://localhost:3000/login, then approve the seller as an admin at http://localhost:3000/admin/pending-sellers.

---

## 3. Rider account (delivery)

Self-register the same way, gated the same way — pending until an admin approves at
http://localhost:3000/admin/riders. Before approval, every rider API call (available deliveries, claim, etc.)
returns `403 RIDER_NOT_APPROVED`, and the rider dashboard shows a blocked-state screen instead of delivery
lists.

**Register via API:**
```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "rider@example.com",
    "password": "Rider123!",
    "full_name": "Test Rider",
    "phone": "03001234567",
    "city": "Karachi",
    "user_type": "rider"
  }'
```
Log in at http://localhost:3000/login (it redirects to `/riders/dashboard`), then approve the rider as an
admin at http://localhost:3000/admin/riders.

---

## 4. Admin account

**Admin accounts cannot be created through the public registration form or API** — `user_type` there only
accepts `customer`, `seller`, or `rider` by design (checked in `backend/src/validators/auth.validator.ts`).
There is also no seeded default admin — you must create one yourself, from the `backend/` folder:

```bash
cd backend
node scripts/create-admin.js admin@example.com "YourPassword123!" "Admin User"
```

This script also works on an **existing** user — if that email is already registered as a customer/seller,
running it again promotes that same account to `user_type: 'admin'` instead of erroring.

Other useful admin scripts (run from `backend/`):
```bash
node scripts/list-admin-users.js                    # list every admin account
node scripts/reset-admin-password.js "NewPassword!"  # reset the first admin's password (defaults to Admin123! if omitted)
```

Log in at http://localhost:3000/admin/login (a separate login page from the customer/seller/rider one).

---

## 5. Approving a pending seller or rider (as admin)

1. Log in as admin at `/admin/login`.
2. Sellers: go to **Pending Sellers** (`/admin/pending-sellers`) → Approve or Reject.
3. Riders: go to **Pending Riders** (`/admin/riders`) → Approve or Reject.

Both are one-shot decisions — approving or rejecting an already-decided application is blocked
(`RIDER_ALREADY_PROCESSED` / equivalent for sellers); there's no "undo" path back to pending.

---

## Already-registered accounts in *this* local dev database

These accounts already exist in the `frozennuray_dev` database this project has been developed against and
are known-working as of 2026-08-07. **They will NOT exist on a fresh clone with a fresh database** — use the
registration steps above in that case. If you're working against this same local DB, these work immediately:

| Role | Email | Password | Notes |
|---|---|---|---|
| Seller | `claude-seller@nuray.test` | `SellerCheck123!` | "Claude Test Kitchen" — already approved, has products & order history |
| Rider | `claude-rider@nuray.test` | `RiderCheck123!` | Already approved |
| Admin | `claude-admin@nuray.test` | `AdminCheck123!` | |

There's no long-lived seeded customer account (they're cheap to create — see §1), but if you're picking up
this exact session's DB state, `test-customer-1785579514@nuray.test` / `TestCustomer123!` was created and
verified working during this session.

---

## Login (email + password) — API

All four roles use the same login endpoint:

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phoneOrEmail": "admin@example.com",
    "otpCodeOrPassword": "YourPassword123!",
    "loginMethod": "email"
  }'
```

Response includes `data.tokens.access_token` (JWT) — pass it as `Authorization: Bearer <token>` on subsequent
API calls, or (for testing the frontend) set it as `localStorage.access_token` in the browser.

---

*This file describes development credentials only. Never reuse these passwords or account patterns in a
production deployment.*
