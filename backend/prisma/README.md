# Database schema and migrations

`schema.prisma` is the data model. `migrations/` holds the SQL that builds and changes the
database; it starts with `20261002400000_baseline`, the complete schema at the time the
migration history was rebuilt. Every later change is a new migration after it.

## New database

```bash
cd backend
DATABASE_URL=postgresql://... npm run db:migrate      # prisma migrate deploy
```

This builds the full schema, including what `schema.prisma` can't express (CHECK constraints
that stop stock and wallet balances going negative). Don't use `prisma db push` for a real
database: it skips those and records no migration history.

## Changing the schema

1. Edit `schema.prisma`.
2. `npx prisma migrate dev --name short_description` against your local database. Prisma writes
   `migrations/<timestamp>_short_description/migration.sql` and applies it. Read the SQL: a
   rename comes out as drop + add, and a new required column needs a default or a backfill.
3. Commit the schema and the migration together. CI rebuilds a database from the migrations
   and fails if it doesn't match `schema.prisma` (`npm run db:check`).

## Deploying

Apply pending migrations before (or as) the new code starts:

- as a release step: `DATABASE_URL=... npm run db:migrate`, or
- in the container: set `MIGRATE_ON_START=true` and the image runs `prisma migrate deploy`
  before starting. Several instances starting at once are fine: Prisma takes a database lock.

Write migrations that the code already running can live with during a rollout (add first,
remove later), since old and new instances overlap for a moment.

## Existing databases (created before the baseline)

A database made with `prisma db push`, or with the old migrations (now in
`migrations-archive/`, which could not build a database on their own), already has the tables.
The baseline refuses to run on it. Bring it under migrations once:

```bash
cd backend
DATABASE_URL=postgresql://... npm run db:baseline
```

It compares the database with the schema as it was at the baseline (`baseline/schema.prisma`):

- **Match:** it adds any missing CHECK constraints and records the baseline as applied (nothing
  else is changed). From then on use `npm run db:migrate`.
- **Differences:** it prints the SQL that would bring the database to the baseline and stops.
  Review it (it can drop columns or data), apply it, for example with
  `npx prisma db push --schema prisma/baseline/schema.prisma`, then run `npm run db:baseline`
  again.

If a deploy already tried the baseline on such a database, it stopped before changing anything
and left a failed entry in the migration history; `db:baseline` clears that first.

## Checks

- `npm run db:check`: does the database match `schema.prisma`? Exit code 0 yes, 2 no.
