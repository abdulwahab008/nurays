# Nuray web app

The Next.js 16 (App Router) front end for Nuray: React 19, Tailwind CSS 4, Zustand, React Hook Form, Leaflet,
Socket.IO client. English and Urdu (right-to-left). Customers, kitchens, riders, admins and hub managers all use this
one app. There is no mobile app in this repository.

Product overview and environment variables: [root README](../README.md). Local setup and conventions:
[`docs/DEVELOPER_ONBOARDING.md`](../docs/DEVELOPER_ONBOARDING.md).

## Run it

The backend must be running (see [`../backend/README.md`](../backend/README.md)).

```bash
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1" > .env.local
npm run dev        # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development server, production build, production server |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | typecheck (also run in CI) |
| `npm run test:e2e`, `test:e2e:ui` | Playwright (see below) |

## Environment

Read at build time, from `.env.local`:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | backend API base, e.g. `http://localhost:3001/api/v1` |
| `NEXT_PUBLIC_WS_URL` | Socket.IO server (defaults to the API URL's origin) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | optional, Google sign-in |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_RELEASE` | optional, browser error tracking |
| `NEXT_PUBLIC_ENABLE_DEMO_LOGIN` | `true` shows the demo-account shortcuts in a production build (always shown in development) |

`next.config.ts` builds a standalone bundle for Docker and proxies `/uploads`, `/media` and `/files` to the backend.

## Layout

```
app/           pages: customer pages at the top level (products, kitchens, cart, checkout, orders, wallet, profile, ...),
               sellers/ (kitchen studio), riders/, admin/, hub/, login and register pages
components/    UI by area: layout/ (sidebars in DashboardShell.tsx), ui/, orders/, riders/, hubs/, admin/, ...
lib/           api-client.ts (axios, token refresh), services/ (API calls), store/ (Zustand), hooks/ (socket, auth),
               i18n/
tests/e2e/     Playwright specs
```

## Languages

Strings live in typed modules in `lib/i18n/messages/`, written with `defineMessages({ en, ur })` and used as
`const t = useT(messages)`. TypeScript requires an Urdu string for every English one. The language is stored in the
`nuray_locale` cookie so the server renders `<html lang dir>` correctly; switch it from the top bar or `/profile`.
Use direction-neutral classes (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`) so Urdu pages mirror. Customer, rider and
kitchen-order screens are translated; admin screens are English.

## End-to-end tests

`playwright.config.ts` runs `tests/e2e/` in Chromium against `http://localhost:3000` (override with
`PLAYWRIGHT_BASE_URL`) and starts `next dev` for you if nothing is running. The backend with a migrated, seeded database
(`npm run seed:e2e` in `backend/`) must already be up on port 3001. Some specs read the email-verification token with
`psql`; set `E2E_DB_URL` to your database. CI runs only `tests/e2e/smoke.spec.ts`. Details:
[`docs/TESTING_STRATEGY.md`](../docs/TESTING_STRATEGY.md).
