import { PrismaClient, Prisma } from '@prisma/client';

// Secrets that must never reach an API response by accident: the customer's handover
// code. Every query leaves them out unless it explicitly selects them
// (select: { handoverCode: true } or omit: { handoverCode: false }).
const globalOmit = {
  order: { handoverCode: true },
  delivery: { deliveryOtp: true },
} as const;

const log: Prisma.LogLevel[] = process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'];

/** DB_STATEMENT_TIMEOUT_MS: 30 s unless set, 0 for no limit, at most the 2^31-1 ms PostgreSQL accepts. */
function statementTimeoutMs(): number {
  const raw = process.env.DB_STATEMENT_TIMEOUT_MS?.trim();
  const ms = raw ? Number(raw) : 30_000;
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, 2_147_483_647) : 30_000;
}

/**
 * PostgreSQL cancels a statement that runs longer than the timeout, so a query stuck behind a lock
 * fails instead of holding its request, and a pool connection, for as long as the lock lasts. It is
 * sent as a startup option, which reaches every pooled connection; the migration commands read
 * DATABASE_URL themselves and are not limited by it.
 */
export function withStatementTimeout(url: string, ms: number): string {
  if (!(ms > 0)) return url;
  const query = new URLSearchParams(url.split('?')[1] ?? '');
  // PgBouncer refuses startup options (set the timeout on the database role there), and an
  // "options" parameter the operator wrote is theirs.
  if (query.get('pgbouncer') === 'true' || query.has('options')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}options=${encodeURIComponent(`-c statement_timeout=${Math.floor(ms)}`)}`;
}

const databaseUrl = process.env.DATABASE_URL;

const prisma = new PrismaClient<{ log: Prisma.LogLevel[]; omit: typeof globalOmit }>({
  log,
  omit: globalOmit,
  ...(databaseUrl ? { datasourceUrl: withStatementTimeout(databaseUrl, statementTimeoutMs()) } : {}),
});

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
