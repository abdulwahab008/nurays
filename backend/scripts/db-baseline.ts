/**
 * One-time: bring a database created before the migration baseline (with `prisma db push`, or
 * the old, incomplete migrations) under `prisma migrate deploy`.
 *
 *   DATABASE_URL=postgresql://... npm run db:baseline
 *
 * It compares the database with the schema as it was at the baseline
 * (prisma/baseline/schema.prisma). Only when they match is the baseline recorded as applied;
 * nothing in the schema is changed. When they differ it prints the SQL that would bring the
 * database there and stops, so a person can review it first (for example, apply it with
 * `npx prisma db push --schema prisma/baseline/schema.prisma`), then run this again.
 *
 * Afterwards, deploy schema changes with `npm run db:migrate` (prisma migrate deploy).
 */
import 'dotenv/config';
import { spawnSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const BASELINE = '20261002400000_baseline';
const BASELINE_SCHEMA = path.join(__dirname, '..', 'prisma', 'baseline', 'schema.prisma');
// Backup tables an old clean-up migration left behind; not part of the schema, harmless.
const LEFTOVER_TABLES = ['reviews_dup_backup', 'promotion_usages_dup_backup', 'negative_values_backup'];

function prisma(args: string[]): { status: number | null; out: string } {
  const result = spawnSync('npx', ['prisma', ...args], { encoding: 'utf8', env: process.env });
  return { status: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

async function main() {
  if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set.');
  const db = new PrismaClient();
  try {
    const [{ exists: hasHistory }] = await db.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = '_prisma_migrations') AS exists`;
    if (hasHistory) {
      const rows = await db.$queryRaw<Array<{ finished_at: Date | null; rolled_back_at: Date | null }>>`
        SELECT finished_at, rolled_back_at FROM _prisma_migrations WHERE migration_name = ${BASELINE}`;
      if (rows.some((r) => r.finished_at && !r.rolled_back_at)) {
        console.log('This database is already on the migration baseline. Use `npm run db:migrate` to deploy changes.');
        return;
      }
      if (rows.some((r) => !r.finished_at && !r.rolled_back_at)) {
        // A deploy tried the baseline here and its guard stopped it before any change.
        console.log('Clearing the failed attempt to apply the baseline (it changed nothing)...');
        const resolved = prisma(['migrate', 'resolve', '--rolled-back', BASELINE]);
        if (resolved.status !== 0) fail(`Could not clear it:\n${resolved.out}`);
      }
    }

    const [{ exists: hasTables }] = await db.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'users') AS exists`;
    if (!hasTables) fail('This database is empty: create the schema with `npm run db:migrate` instead.');

    console.log('Comparing the database with the baseline schema...');
    const diff = prisma(['migrate', 'diff', '--from-url', process.env.DATABASE_URL, '--to-schema-datamodel', BASELINE_SCHEMA, '--script']);
    if (diff.status !== 0) fail(`Could not compare:\n${diff.out}`);
    const statements = diff.out
      .split(/;\s*\n/)
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean)
      .filter((s) => !s.startsWith('This is an empty migration'));
    const leftovers = statements.filter((s) => LEFTOVER_TABLES.some((t) => s === `DROP TABLE "${t}"`));
    const changes = statements.filter((s) => !leftovers.includes(s));
    if (changes.length > 0) {
      fail(
        'The database does not match the baseline schema. These statements would bring it there:\n\n' +
          changes.map((s) => `${s};`).join('\n\n') +
          '\n\nReview them (they can drop columns or data), apply them, for example with\n' +
          '  npx prisma db push --schema prisma/baseline/schema.prisma\n' +
          'and run `npm run db:baseline` again.'
      );
    }
    if (leftovers.length > 0) {
      console.log(`Note: backup tables from an old clean-up are still here (${LEFTOVER_TABLES.join(', ')}); drop them once you no longer need them.`);
    }

    // The baseline's CHECK constraints (Prisma can't express them, so the comparison above
    // can't see them). NOT VALID: enforced for every new write without scanning old rows.
    await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_stock_quantity_nonneg') THEN
          ALTER TABLE "products" ADD CONSTRAINT "products_stock_quantity_nonneg" CHECK ("stock_quantity" >= 0) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_variants_stock_quantity_nonneg') THEN
          ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_stock_quantity_nonneg" CHECK ("stock_quantity" >= 0) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_balance_nonneg') THEN
          ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_nonneg" CHECK ("balance" >= 0) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hub_inventory_quantity_nonneg') THEN
          ALTER TABLE "hub_inventory" ADD CONSTRAINT "hub_inventory_quantity_nonneg" CHECK ("quantity" >= 0) NOT VALID;
        END IF;
      END $$;`);

    const resolved = prisma(['migrate', 'resolve', '--applied', BASELINE]);
    if (resolved.status !== 0) fail(`Could not record the baseline:\n${resolved.out}`);
    console.log('Done: the database matches the baseline and is recorded as on it. Deploy later changes with `npm run db:migrate`.');
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => fail(String(err?.message ?? err)));
