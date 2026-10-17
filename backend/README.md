# Nuray backend

The API behind Nuray, a community food marketplace for Pakistan: Node.js 22, Express 5, TypeScript, Prisma 6 on
PostgreSQL, Redis (BullMQ jobs, Socket.IO adapter, rate limits; optional in development), Socket.IO, Zod, pino. Routes
are mounted under `/api/v1`; health is `/api/v1/health`.

Setup, environment variables and the money, delivery and payment rules are in the [root README](../README.md).
Step-by-step local setup and conventions: [`docs/DEVELOPER_ONBOARDING.md`](../docs/DEVELOPER_ONBOARDING.md).

## Quick start

```bash
npm install
cp .env.example .env     # set DATABASE_URL and JWT_SECRET (32+ chars); every variable is explained in the file
npx prisma generate
npm run db:migrate
npm run seed:e2e         # optional sample data
npm run dev              # http://localhost:3001
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | nodemon + ts-node on `src/index.ts` |
| `npm run build` / `npm start` | compile to `dist/` / run `dist/index.js` |
| `npm run start:prod` | `NODE_ENV=production node dist/index.js` |
| `npm test`, `test:watch`, `test:coverage` | Jest unit tests (`tests/`) |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run prisma:migrate` | `prisma migrate dev` (create a migration) |
| `npm run db:baseline` | one-time: bring a pre-baseline database under migrations |
| `npm run db:check` | database vs `schema.prisma`; exit code 2 on drift |
| `npm run prisma:generate`, `prisma:studio` | generate the client, browse data |
| `npm run seed:e2e` | communities, kitchens, a test kitchen account |

Other helpers in `scripts/`: `create-admin.js <email> <password> "<name>"` (staff password: 12+ characters, not a common one), `reset-admin-password.js <email> <password>`, `list-admin-users.js`,
`seed-ideal-flow-users.ts` (demo accounts), and `verify-money-flows.ts` (run only against a throwaway database; see
[`docs/TESTING_STRATEGY.md`](../docs/TESTING_STRATEGY.md)).

## Layout

```
src/
  index.ts       app, route mounting, scheduled sweeps
  routes/ controllers/ validators/   HTTP layer
  services/      business logic and database work
  middleware/ utils/ config/ gateways/ jobs/ storage/
prisma/          schema.prisma, migrations/, seeds (see prisma/README.md)
scripts/         admin helpers and verification scripts
tests/           Jest tests
```
