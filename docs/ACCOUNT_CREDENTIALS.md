# FrozenNuray – Account credentials (Admin, Seller, Customer)

This doc describes the **three main account types** and how to get or create credentials for each.

---

## 1. Admin account

**Role:** Platform administrator (manage sellers, orders, categories, analytics).

| Field      | Value                      |
|-----------|----------------------------|
| **Login URL** | http://localhost:3000/admin/login |
| **Email**     | `admin@frozennuray.com`    |
| **Password**  | `Admin123!` (default; change after first login) |

**Notes:**

- The admin user must exist in the database with `user_type = 'admin'` and this email. The app does **not** seed it automatically.
- If the admin does not exist, create one via API (see “Creating the admin user” below).
- To **reset** the admin password (e.g. after you’ve forgotten it), from the `backend` folder run:
  ```bash
  node scripts/reset-admin-password.js "YourNewPassword"
  ```
  If you omit the password, it is set to `Admin123!`.

**List existing admins:**

```bash
cd backend && node scripts/list-admin-users.js
```

---

## 2. Seller account (owner / homemade food seller)

**Role:** Home-based seller – add products, manage orders, earnings, payouts. Account is created as **pending** until an admin approves it.

| Field        | Value |
|-------------|--------|
| **Login URL** | http://localhost:3000/login (then redirects to seller dashboard if seller) |
| **Email**     | No default – create via registration |
| **Password**  | No default – you choose when registering |

**Notes:**

- There are **no built-in seller credentials**. Every seller is created by registering (web or API) with `user_type: 'seller'` and a `business_name`.
- After registration, the seller can log in at `/login` with **email + password** (login method: email). Until an admin approves the seller, some features may be limited.
- To have a test seller, register once (see “Creating a seller” below) and use that email/password.

**Example test seller (create via registration, then use to log in):**

- Email: `seller@example.com`
- Password: `Seller123!`
- Full name: e.g. `Test Seller`
- Business name: e.g. `Homemade Bites`
- Phone (optional): e.g. `923001234567`

---

## 3. Customer account

**Role:** Shopper – browse products, place orders, manage profile and addresses.

| Field        | Value |
|-------------|--------|
| **Login URL** | http://localhost:3000/login |
| **Email**     | No default – create via registration |
| **Password**  | No default – you choose when registering |

**Notes:**

- There are **no built-in customer credentials**. Every customer is created by registering with `user_type: 'customer'`.
- Customers log in at `/login` with **email + password** (or OTP if you use phone login).

**Example test customer (create via registration, then use to log in):**

- Email: `customer@example.com`
- Password: `Customer123!`
- Full name: e.g. `Test Customer`
- Phone (optional): e.g. `923009876543`

---

## Summary table

| Account type | Login URL              | Default email              | Default password | How to get credentials |
|-------------|------------------------|----------------------------|------------------|-------------------------|
| **Admin**   | /admin/login           | `admin@frozennuray.com`     | `Admin123!`      | Create once via API or DB; reset with `reset-admin-password.js` |
| **Seller**  | /login                 | *(none)*                   | *(none)*         | Register (web or API) with `user_type: 'seller'` + `business_name` |
| **Customer**| /login                 | *(none)*                   | *(none)*         | Register (web or API) with `user_type: 'customer'` |

---

## Creating users via API (for testing)

Base URL (local): `http://localhost:3001/api/v1` (or your backend `PORT` from `.env`).

### Creating the admin user

If no admin exists yet, create one with a single registration call:

```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@frozennuray.com",
    "password": "Admin123!",
    "user_type": "admin",
    "full_name": "Platform Admin"
  }'
```

Then log in at **http://localhost:3000/admin/login** with that email and password. Change the password after first login (e.g. using `reset-admin-password.js`).

### Creating a seller (owner / homemade)

```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "seller@example.com",
    "password": "Seller123!",
    "user_type": "seller",
    "full_name": "Test Seller",
    "business_name": "Homemade Bites",
    "phone": "923001234567"
  }'
```

Then log in at **http://localhost:3000/login** with email `seller@example.com` and password `Seller123!`. An admin must approve the seller in **Admin → Sellers** before full access.

### Creating a customer

```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer@example.com",
    "password": "Customer123!",
    "user_type": "customer",
    "full_name": "Test Customer",
    "phone": "923009876543"
  }'
```

Then log in at **http://localhost:3000/login** with that email and password.

---

## Login (email + password)

All three roles can use **email + password** login:

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phoneOrEmail": "admin@frozennuray.com",
    "otpCodeOrPassword": "Admin123!",
    "loginMethod": "email"
  }'
```

Replace `phoneOrEmail` and `otpCodeOrPassword` with the user’s email and password. Use the same for seller and customer with their respective credentials.

---

*Keep this file out of production deployments or restrict access; it contains example passwords for development only.*
