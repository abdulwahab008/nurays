# Accounts

How each kind of Nuray account is created and approved, and which test accounts exist in development. No real
credentials live in this repository; the passwords below are for local test data only. Never create them in production.

Roles (`users.user_type`): `customer`, `seller` (the kitchen), `rider`, `admin`, `hub_manager`.

## How each account type is created

| Role | Created by | Approval | Lands on |
|---|---|---|---|
| Customer | `/register` (choose Customer) | none, works at once | `/dashboard` |
| Kitchen (seller) | `/register` (choose Kitchen), then the application at `/sellers/register` | admin approves at `/admin/pending-sellers` | `/sellers/dashboard` |
| Rider | `/register` (choose Rider), then the application on `/riders/dashboard` | admin approves at `/admin/riders?tab=applications` | `/riders/dashboard` |
| Admin | not self-registerable; `node scripts/create-admin.js <email> <password> "<full name>"` run from `backend/` | none | `/admin/login`, `/admin/dashboard` |
| Hub manager | not self-registerable; an admin turns an existing customer account into one at `/admin/hubs/manage` | done by the admin | `/hub` |

`registerSchema` (`backend/src/validators/auth.validator.ts`) only accepts `customer`, `seller` and `rider` as
`user_type`; admin and hub manager are provisioned out of band on purpose.

### Registering (all self-service roles)

`/register` asks for full name, email, password (6+ characters), optionally a phone number with an OTP, city and area,
and for kitchens a business name. An email verification message is sent; the user can log in before verifying, and a
banner reminds them. A phone number typed at signup without its OTP is stored as unverified and cannot be used to log
in. Login is at `/login`: email and password, phone OTP, or Google sign-in.

### Kitchen (seller) application

After registering as a kitchen, the user opens `/sellers/register` (`POST /sellers/register`). Required in the form:
business name (3+ characters), home community, a location (GPS button or typed), CNIC front and back photos, and
agreeing to the terms. Also collected: business type, description, kitchen photos, cover image, meal categories,
delivery modes, bank / JazzCash / EasyPaisa accounts for payouts. The status becomes `pending`.

Admin: `/admin/pending-sellers` lists applications; open one (`/admin/sellers/<id>`) to read the details and the
private documents, then approve, or reject with a reason. A rejected kitchen sees the reason on `/sellers/register`,
edits and resubmits (the CNIC is not asked for again), and the cycle repeats. Admins can also suspend or reactivate a
kitchen later from `/admin/sellers`. Approved kitchens still need their dishes approved (`/admin/products`) before
customers see them.

### Rider application

After registering as a rider the user lands on `/riders/dashboard`, which shows the application form
(`PUT /riders/me/application`): city, vehicle type, vehicle registration number, optional licence number, and three
photos: CNIC front, CNIC back and licence. Sending without all three documents is refused. Status becomes pending.

Admin: `/admin/riders?tab=applications` (detail at `/admin/riders/<id>`) shows the details and documents; approve, or
reject with a reason so the rider can fix and send again. Until approved, a rider cannot see or claim jobs. Admins
can later suspend a rider and set their cash limit from `/admin/riders`.

### Admin

```bash
cd backend
node scripts/create-admin.js admin@example.com 'a-strong-password' "Admin Name"
```

If the email already exists, the script promotes that account to admin and sets the new password. Related helpers:
`node scripts/list-admin-users.js` lists admins; `node scripts/reset-admin-password.js "<new password>"` resets the
password of `admin@frozennuray.com` only (a legacy default address; with no argument it sets a temporary
`Admin123!`, so always pass a password). Sign in at `/admin/login`. Admin screens are English only.

### Hub manager

1. The person registers a normal customer account.
2. An admin opens `/admin/hubs/manage`, enters their email or phone under hub managers (`POST /admin/hub-managers`).
   Only a plain active customer account qualifies; a seller, rider or admin account, or one with a rider application,
   is refused. All their sessions are signed out, so they sign in again.
3. The admin assigns the manager to a hub (`PUT /admin/hubs/:id/manager`). The manager now sees it at `/hub`.
4. Removing the role (`DELETE /admin/hub-managers/:id`) takes them off every hub and turns the account back into a
   customer.

## Seeded test accounts

### `npm run seed:e2e` (`backend/prisma/seed-e2e.ts`)

Run from `backend/`. Idempotent. Creates the Karachi communities, 13 community kitchens, and:

| Role | Email | Password |
|---|---|---|
| Kitchen (approved, "E2E Test Kitchen", Gulshan-e-Iqbal) | `e2e-seller@nuray.test` | `SellerPass123!` |

It also creates three products for that kitchen (one with a fixed id used by `purchase.spec.ts`).

The 13 community kitchens (emails like `saima.akhtar@nuray.test`, `abdul.bbq@nuray.test`) are seeded by
`prisma/seed-community-kitchens.ts` as active seller accounts, but the password hash in that file does **not**
match `Password123!` (despite the comment next to it), so treat those accounts as having no usable password. Log in
as `seller@nuray.test` (below) or reset the password through "Forgot password" if you need to act as one.

### `scripts/seed-ideal-flow-users.ts`

`cd backend && npx ts-node scripts/seed-ideal-flow-users.ts`. This is the script the dev demo panel and
`ideal-flow.spec.ts` rely on. It creates or resets (password, status, verified email) these accounts, all with
password `Password123!`:

| Role | Email |
|---|---|
| Customer (with a saved address) | `customer@nuray.test` |
| Kitchen (approved, "Saima's Craft Kitchen", with a product) | `seller@nuray.test` |
| Rider (approved, motorcycle) | `rider@nuray.test` |
| Admin | `admin@frozennuray.com` |

It also resets `e2e-seller@nuray.test` to `Password123!` when that account exists, so after running it that kitchen's
password is `Password123!`, not `SellerPass123!`.

There is no seeded hub manager. Make one as described above.

### Dev demo-login panel

On `/login`, a panel of one-click demo accounts is shown when the frontend runs in development, and in a production
build only if `NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true` (read at build time). `/dev-login` (also hidden in production
unless that flag is set; `/dev-login?role=<id>&autologin=1` signs straight in) offers the same accounts. Keep the flag
off in production: the accounts share a known password.

Accounts offered: customer, active kitchen, rider, admin (all created by `seed-ideal-flow-users.ts` above), plus
"seller-pending" (`seller.pending@nuray.test`) and "seller-rejected" (`seller.rejected@nuray.test`). No seed script
creates those last two, so their buttons fail until you create them yourself: register two kitchen accounts with those
emails and password `Password123!`, submit the application for both, reject one in `/admin/pending-sellers`.

## Password reset

- Users: `/forgot-password` asks for the email; `POST /auth/forgot-password` always answers the same way, whether or
  not the account exists. An email with a single-use link to `/reset-password?token=...` is sent through the
  background job (in development, the backend logs an "Email preview" URL). The link expires, works
  once, and on success every existing session of the account is signed out. New password: 6+ characters.
- Accounts without an email, or non-active accounts, get no email.
- Admins can use the same flow, or the scripts above (`create-admin.js` on an existing email also sets a new password).

## Limitations

- The only built-in admin tooling for a lost admin password is the script route above; there is no admin invite flow.
- Seeded accounts have verified emails and known passwords; never run the seed scripts against production.
