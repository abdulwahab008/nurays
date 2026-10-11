const mockPrismaClient = jest.fn().mockImplementation(() => ({ $disconnect: jest.fn() }));
jest.mock('@prisma/client', () => ({ PrismaClient: mockPrismaClient, Prisma: {} }));

const URL_WITH_PARAMS = 'postgresql://app:secret@db.internal:5432/nuray?schema=public&connection_limit=10&pool_timeout=10';
const TIMEOUT_30S = 'options=-c%20statement_timeout%3D30000';

const originalEnv = { ...process.env };
const originalExitListeners = process.listeners('beforeExit');
afterEach(() => {
  process.env = { ...originalEnv };
  // each fresh load of config/database registers its own beforeExit listener
  for (const listener of process.listeners('beforeExit')) if (!originalExitListeners.includes(listener)) process.off('beforeExit', listener);
});

/** Load config/database fresh with this environment, and return what it built the Prisma client with. */
function clientOptions(env: Record<string, string | undefined>) {
  jest.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../src/config/database');
  expect(mockPrismaClient).toHaveBeenCalledTimes(1);
  return mockPrismaClient.mock.calls[0][0] as { datasourceUrl?: string; omit: unknown; log: unknown };
}

describe('the database connection string the app runs on', () => {
  it('asks PostgreSQL to cancel a statement after 30 seconds, on top of whatever the operator set', () => {
    const options = clientOptions({ DATABASE_URL: URL_WITH_PARAMS, DB_STATEMENT_TIMEOUT_MS: undefined });
    expect(options.datasourceUrl).toBe(`${URL_WITH_PARAMS}&${TIMEOUT_30S}`);
  });

  it('starts the query string when there is none', () => {
    const options = clientOptions({ DATABASE_URL: 'postgresql://app@db.internal/nuray', DB_STATEMENT_TIMEOUT_MS: undefined });
    expect(options.datasourceUrl).toBe(`postgresql://app@db.internal/nuray?${TIMEOUT_30S}`);
  });

  it('takes the limit from DB_STATEMENT_TIMEOUT_MS', () => {
    const options = clientOptions({ DATABASE_URL: URL_WITH_PARAMS, DB_STATEMENT_TIMEOUT_MS: '5000' });
    expect(options.datasourceUrl).toBe(`${URL_WITH_PARAMS}&options=-c%20statement_timeout%3D5000`);
  });

  it('leaves the connection string alone when the limit is 0', () => {
    const options = clientOptions({ DATABASE_URL: URL_WITH_PARAMS, DB_STATEMENT_TIMEOUT_MS: '0' });
    expect(options.datasourceUrl).toBe(URL_WITH_PARAMS);
  });

  it.each(['abc', '-1', 'Infinity', '  '])('falls back to 30 seconds for %p instead of sending PostgreSQL a value it refuses', (bad) => {
    const options = clientOptions({ DATABASE_URL: URL_WITH_PARAMS, DB_STATEMENT_TIMEOUT_MS: bad });
    expect(options.datasourceUrl).toBe(`${URL_WITH_PARAMS}&${TIMEOUT_30S}`);
  });

  it('caps the limit at the largest value PostgreSQL accepts', () => {
    const options = clientOptions({ DATABASE_URL: URL_WITH_PARAMS, DB_STATEMENT_TIMEOUT_MS: '99999999999' });
    expect(options.datasourceUrl).toBe(`${URL_WITH_PARAMS}&options=-c%20statement_timeout%3D2147483647`);
  });

  it('leaves the choice of connection string to Prisma when DATABASE_URL is not set', () => {
    const options = clientOptions({ DATABASE_URL: undefined });
    expect(options).not.toHaveProperty('datasourceUrl');
    expect(options.omit).toBeDefined(); // the rest of the client is set up as before
  });
});

describe('withStatementTimeout', () => {
  let withStatementTimeout: typeof import('../src/config/database').withStatementTimeout;
  beforeAll(() => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ withStatementTimeout } = require('../src/config/database'));
  });

  it('does not touch a connection string behind PgBouncer, which refuses startup options', () => {
    const pooled = `${URL_WITH_PARAMS}&pgbouncer=true`;
    expect(withStatementTimeout(pooled, 30_000)).toBe(pooled);
    expect(withStatementTimeout(`${URL_WITH_PARAMS}&pgbouncer=false`, 30_000)).toContain('statement_timeout');
  });

  it('does not override an options parameter the operator wrote', () => {
    const own = `${URL_WITH_PARAMS}&options=-c%20statement_timeout%3D60000`;
    expect(withStatementTimeout(own, 30_000)).toBe(own);
  });

  it('keeps the other parameters, a socket host included, exactly as written', () => {
    expect(withStatementTimeout('postgresql://postgres@localhost/nuray?host=/var/run/postgresql', 1500.9)).toBe(
      'postgresql://postgres@localhost/nuray?host=/var/run/postgresql&options=-c%20statement_timeout%3D1500'
    );
  });
});
