# Nuray: instructions for AI coding agents

Nuray is a community food marketplace for Pakistan: home kitchens sell to people in their community; Nuray riders or
the kitchen deliver. Backend: `backend/` (Node 20, Express 5, TypeScript, Prisma 6, PostgreSQL, Redis/BullMQ,
Socket.IO). Frontend: `frontend-web/` (Next.js 16 App Router, React 19, Tailwind 4; English and Urdu). There is no
mobile app. Read [README.md](../README.md) and [docs/README.md](../docs/README.md) first.

## Conventions

- **Layers**: routes (`backend/src/routes/*.routes.ts`) → validators (zod, `backend/src/validators`) → controllers →
  services (`backend/src/services`, where the logic and all database work live). Pure rules (pricing, delivery fees,
  ranking) are in `backend/src/utils` with unit tests.
- **Roles**: `customer`, `seller`, `rider`, `admin`, `hub_manager` in one `users` table; guard routes with the
  middleware in `backend/src/middleware/auth.middleware.ts` and check ownership in the service.
- **Database**: snake_case columns via `@map`, camelCase in code. Change the schema with a new migration
  (`backend/prisma/README.md`); never edit an applied migration. `docs/DATABASE_SCHEMA.sql` is generated.
- **Money**: whole-rupee order totals (`utils/pricing.ts` `priceOrder`, mirrored in `frontend-web/lib/utils.ts`);
  anything that moves money runs in a database transaction and writes ledger entries; use `AppError` with a code.
- **Delivery prices**: Nuray-rider fees in `utils/deliveryFee.ts` + `services/delivery-pricing.service.ts`; a kitchen's own
  fees apply only to self-delivery. See `docs/BUSINESS_RULES.md`.
- **Frontend text**: every user-facing string goes in a message module under `frontend-web/lib/i18n/messages/` with both
  `en` and `ur` (`useT`); use direction-neutral Tailwind classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`,
  `text-start`), and mark phone numbers, codes and order numbers `data-ltr`.
- **Real time**: events and rooms are listed in `docs/REALTIME_ORDER_MANAGEMENT.md`.
- **Notifications**: call `notify()` (`services/notify.service.ts`); it never throws and de-duplicates by key.

## Checking your work

```bash
cd backend && npx tsc --noEmit && npm test
cd frontend-web && npx tsc --noEmit
```

Money, ordering and payment changes also need the real-database check
(`backend/scripts/verify-money-flows.ts`, see `docs/TESTING_STRATEGY.md`); UI changes should be looked at in the browser,
in English and Urdu.

## Don't

- Don't trust old planning documents in `docs/archive/`: they describe plans, not the system.
- Don't add fake or hard-coded data to screens; show real data or nothing.
- Don't send commit messages or pull requests that name an AI tool unless asked.
