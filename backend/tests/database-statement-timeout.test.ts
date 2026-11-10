const mockPrismaClient = jest.fn().mockImplementation(() => ({ $disconnect: jest.fn() }));
const mockPrismaPg = jest.fn();
jest.mock('@prisma/client', () => ({ PrismaClient: mockPrismaClient, Prisma: {} }));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: mockPrismaPg }));

const BASE = 'postgresql://app:secret@db.internal:5432/nuray';
const URL_WITH_PARAMS = `${BASE}?schema=public&connection_limit=10&pool_timeout=10`;
const TIMEOUT_30S = '-c statement_timeout=30000';

const originalEnv = { ...process.env };
const originalExitListeners = process.listeners('beforeExit');
afterEach(() => {
  process.env = { ...originalEnv };
  mockPrismaClient.mockClear();
  mockPrismaPg.mockClear();
  // each fresh load of config/database registers its own beforeExit listener
  for (const listener of process.listeners('beforeExit')) if (!originalExitListeners.includes(listener)) process.off('beforeExit', listener);
});

type Pool = { connectionString: string; max: number; connectionTimeoutMillis: number; maxLifetimeSeconds: number };

/** Load config/database fresh with this environment, and return the pool and adapter options it built. */
async function built(env: Record<string, string | undefined>) {
  jest.resetModules();
  mockPrismaClient.mockClear();
  mockPrismaPg.mockClear();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await import('../src/config/database');
  expect(mockPrismaClient).toHaveBeenCalledTimes(1);
  const [pool, options] = mockPrismaPg.mock.calls[0] as [Pool, { schema?: string; statementNameGenerator?: (q: { sql: string }) => string }];
  const url = new URL(pool.connectionString);
  return { pool, options, url, client: mockPrismaClient.mock.calls[0][0] as { omit: unknown; adapter: unknown } };
}

describe('the database pool the app runs on', () => {
  it('asks PostgreSQL to cancel a statement after 30 seconds and turns the Prisma parameters into pool settings', async () => {
    const { pool, options, url } = await built({ DATABASE_URL: URL_WITH_PARAMS, DB_STATEMENT_TIMEOUT_MS: undefined });
    expect(url.searchParams.get('options')).toBe(TIMEOUT_30S);
    expect(pool).toMatchObject({ max: 10, connectionTimeoutMillis: 10_000 });
    expect(options.schema).toBe('public');
    // node-postgres would read these as settings of its own
    for (const key of ['connection_limit', 'pool_timeout', 'schema', 'pgbouncer']) expect(url.searchParams.has(key)).toBe(false);
  });

  it('opens at most 10 connections and waits 10 seconds for one when DATABASE_URL names neither', async () => {
    const { pool } = await built({ DATABASE_URL: BASE, DB_STATEMENT_TIMEOUT_MS: '0' });
    expect(pool).toEqual({ connectionString: BASE, max: 10, connectionTimeoutMillis: 10_000, maxLifetimeSeconds: 600 });
  });

  it('keeps the connection_limit and pool_timeout the operator wrote, 0 meaning wait as long as it takes', async () => {
    const { pool } = await built({ DATABASE_URL: `${BASE}?connection_limit=25&pool_timeout=0`, DB_STATEMENT_TIMEOUT_MS: '0' });
    expect(pool).toEqual({ connectionString: BASE, max: 25, connectionTimeoutMillis: 0, maxLifetimeSeconds: 600 });
  });

  it('takes the limit from DB_STATEMENT_TIMEOUT_MS', async () => {
    expect((await built({ DATABASE_URL: URL_WITH_PARAMS, DB_STATEMENT_TIMEOUT_MS: '5000' })).url.searchParams.get('options')).toBe('-c statement_timeout=5000');
  });

  it('sends no statement timeout when the limit is 0', async () => {
    expect((await built({ DATABASE_URL: URL_WITH_PARAMS, DB_STATEMENT_TIMEOUT_MS: '0' })).url.searchParams.has('options')).toBe(false);
  });

  it.each(['abc', '-1', 'Infinity', '  '])('falls back to 30 seconds for %p instead of sending PostgreSQL a value it refuses', async (bad) => {
    expect((await built({ DATABASE_URL: URL_WITH_PARAMS, DB_STATEMENT_TIMEOUT_MS: bad })).url.searchParams.get('options')).toBe(TIMEOUT_30S);
  });

  it('caps the limit at the largest value PostgreSQL accepts', async () => {
    expect((await built({ DATABASE_URL: URL_WITH_PARAMS, DB_STATEMENT_TIMEOUT_MS: '99999999999' })).url.searchParams.get('options')).toBe(
      '-c statement_timeout=2147483647'
    );
  });

  it('does not send a startup option through PgBouncer, which refuses them', async () => {
    const { url } = await built({ DATABASE_URL: `${URL_WITH_PARAMS}&pgbouncer=true`, DB_STATEMENT_TIMEOUT_MS: undefined });
    expect(url.searchParams.has('options')).toBe(false);
    expect(url.searchParams.has('pgbouncer')).toBe(false);
  });

  it('keeps an options parameter the operator wrote, and every other parameter, a socket host included', async () => {
    const { url } = await built({ DATABASE_URL: `${BASE}?host=/var/run/postgresql&options=-c%20statement_timeout%3D60000`, DB_STATEMENT_TIMEOUT_MS: undefined });
    expect(url.searchParams.get('options')).toBe('-c statement_timeout=60000');
    expect(url.searchParams.get('host')).toBe('/var/run/postgresql');
  });

  it('names each statement by its SQL so a connection plans a query once, except behind an old PgBouncer', async () => {
    const { options } = await built({ DATABASE_URL: BASE });
    const name = options.statementNameGenerator!;
    expect(name({ sql: 'SELECT 1' })).toBe(name({ sql: 'SELECT 1' }));
    expect(name({ sql: 'SELECT 1' })).not.toBe(name({ sql: 'SELECT 2' }));
    expect(name({ sql: 'SELECT 1' }).length).toBeLessThanOrEqual(63); // PostgreSQL's identifier limit
    expect((await built({ DATABASE_URL: `${BASE}?pgbouncer=true` })).options.statementNameGenerator).toBeUndefined();
  });

  it('builds the client with the adapter and the fields every query leaves out', async () => {
    const { client } = await built({ DATABASE_URL: BASE });
    expect(client.adapter).toBeInstanceOf(mockPrismaPg);
    expect(client.omit).toEqual({ order: { handoverCode: true }, delivery: { deliveryOtp: true } });
  });
});
