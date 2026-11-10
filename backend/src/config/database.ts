import { createHash } from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { logger } from '../utils/logger';

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

/**
 * A pool of DEFAULT_CONNECTION_LIMIT connections per instance unless DATABASE_URL names a connection_limit, so a handful of
 * instances stays under PostgreSQL's max_connections (100 by default); see docs/DEPLOYMENT_GUIDE.md for the sizing. A query
 * waits pool_timeout seconds for a free connection (10 unless set, 0 for no limit) and then fails as "busy".
 */
const DEFAULT_CONNECTION_LIMIT = 10;
const DEFAULT_POOL_TIMEOUT_S = 10;
const CONNECTION_LIFETIME_S = 600;
// Prisma 7 talks to PostgreSQL through node-postgres, which would read these as connection settings of its own.
const PRISMA_URL_PARAMS = ['connection_limit', 'pool_timeout', 'pgbouncer', 'schema'];

export function poolSettings(url: string, statementTimeout: number) {
  const [base, raw = ''] = withStatementTimeout(url, statementTimeout).split('?');
  const query = new URLSearchParams(raw);
  const limit = Number(query.get('connection_limit'));
  const wait = query.get('pool_timeout');
  const waitSeconds = wait !== null && wait.trim() !== '' && Number(wait) >= 0 ? Number(wait) : DEFAULT_POOL_TIMEOUT_S;
  const schema = query.get('schema') ?? undefined;
  const preparedStatements = query.get('pgbouncer') !== 'true';
  for (const key of PRISMA_URL_PARAMS) query.delete(key);
  const rest = query.toString();
  return {
    pool: {
      connectionString: rest ? `${base}?${rest}` : base,
      max: Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_CONNECTION_LIMIT,
      connectionTimeoutMillis: waitSeconds * 1000,
      // ponytail: each connection keeps every statement it prepared (node-postgres has no cap, Prisma 6 kept 100), so it is
      // replaced after 10 minutes; an LRU in statementName would bound it tighter if PostgreSQL memory ever shows it.
      maxLifetimeSeconds: CONNECTION_LIFETIME_S,
    },
    schema,
    preparedStatements,
  };
}

/**
 * The same SQL gets the same statement name, so each connection parses and plans a query once and reuses it, as Prisma
 * did before 7; without a name node-postgres plans every query again. Off behind an old PgBouncer (pgbouncer=true), which
 * cannot keep prepared statements; PgBouncer 1.21+ with max_prepared_statements can (docs/DEPLOYMENT_GUIDE.md).
 */
export const statementName = ({ sql }: { sql: string }) => `p${createHash('sha1').update(sql).digest('base64url').slice(0, 27)}`;

const settings = poolSettings(process.env.DATABASE_URL ?? '', statementTimeoutMs());

const prisma = new PrismaClient({
  log,
  omit: globalOmit,
  adapter: new PrismaPg(settings.pool, {
    schema: settings.schema,
    ...(settings.preparedStatements ? { statementNameGenerator: statementName } : {}),
    onPoolError: (err) => logger.error({ err }, 'Database pool error'),
    onConnectionError: (err) => logger.error({ err }, 'Database connection error'),
  }),
});

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
