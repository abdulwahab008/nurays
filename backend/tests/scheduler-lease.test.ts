/** A Redis that keeps keys in a map and runs the scheduler's two scripts (release, renew) by what they do. */
class FakeRedis {
  keys = new Map<string, string>();
  down = false;
  async set(key: string, value: string, _px: string, _ms: number, _nx: string) {
    if (this.down) throw new Error('Connection is closed.');
    if (this.keys.has(key)) return null;
    this.keys.set(key, value);
    return 'OK';
  }
  async eval(script: string, _n: number, key: string, token: string) {
    if (this.keys.get(key) !== token) return 0;
    if (script.includes("'del'")) this.keys.delete(key);
    return 1;
  }
}

let mockRedis: FakeRedis | null;
jest.mock('../src/config/redis', () => ({ getRedis: () => mockRedis }));
const mockQueryRaw = jest.fn(async () => [{ locked: true }]);
const mockTransaction = jest.fn(async (body: (tx: { $queryRaw: typeof mockQueryRaw }) => Promise<boolean>) => body({ $queryRaw: mockQueryRaw }));
jest.mock('../src/config/database', () => ({ __esModule: true, default: { $transaction: mockTransaction } }));

type Scheduler = typeof import('../src/jobs/scheduler');
let scheduler: Scheduler;
let warn: jest.SpyInstance;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(async () => {
  jest.resetModules();
  mockRedis = new FakeRedis();
  delete process.env.SCHEDULER_CONCURRENCY;
  mockTransaction.mockClear();
  scheduler = await import('../src/jobs/scheduler');
  const { logger } = await import('../src/utils/logger');
  warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

describe('runExclusive', () => {
  it('holds a Redis lease while the job runs and gives it back afterwards', async () => {
    let heldDuringRun = false;
    const ran = await scheduler.runExclusive('sweep', async () => {
      heldDuringRun = mockRedis!.keys.has('lock:job:sweep');
    });
    expect(ran).toBe(true);
    expect(heldDuringRun).toBe(true);
    expect(mockRedis!.keys.size).toBe(0);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('skips the run while another instance holds the lease, and leaves that lease alone', async () => {
    mockRedis!.keys.set('lock:job:sweep', 'other-instance');
    const fn = jest.fn();
    expect(await scheduler.runExclusive('sweep', fn)).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    expect(mockRedis!.keys.get('lock:job:sweep')).toBe('other-instance');
  });

  it('runs at most SCHEDULER_CONCURRENCY jobs at once; the others wait for a slot, not for a lease', async () => {
    process.env.SCHEDULER_CONCURRENCY = '2';
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    const runs = gates.map((gate, i) =>
      scheduler.runExclusive(`job-${i}`, async () => {
        started.push(i);
        await gate.promise;
      })
    );
    await new Promise((r) => setImmediate(r));
    expect(started).toEqual([0, 1]);
    expect(mockRedis!.keys.has('lock:job:job-2')).toBe(false);

    gates[0].resolve();
    await new Promise((r) => setImmediate(r));
    expect(started).toEqual([0, 1, 2]);

    gates[1].resolve();
    gates[2].resolve();
    expect(await Promise.all(runs)).toEqual([true, true, true]);
    expect(mockRedis!.keys.size).toBe(0);
  });

  it('frees the lease and the slot when the job throws', async () => {
    process.env.SCHEDULER_CONCURRENCY = '1';
    await expect(scheduler.runExclusive('boom', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(mockRedis!.keys.size).toBe(0);
    expect(await scheduler.runExclusive('next', async () => undefined)).toBe(true);
  });

  it('without Redis (development) still skips an overlapping run of the same job in this process', async () => {
    mockRedis = null;
    const gate = deferred();
    const first = scheduler.runExclusive('sweep', () => gate.promise);
    expect(await scheduler.runExclusive('sweep', async () => undefined)).toBe(false);
    gate.resolve();
    expect(await first).toBe(true);
  });

  it('falls back to the Postgres advisory lock while Redis errors, warning once per job per outage', async () => {
    mockRedis!.down = true;
    const fn = jest.fn(async () => undefined);
    expect(await scheduler.runExclusive('stale-orders', fn)).toBe(true);
    expect(await scheduler.runExclusive('stale-orders', fn)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(mockTransaction).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.filter(([, msg]) => String(msg).includes('falling back'))).toHaveLength(1);

    mockQueryRaw.mockResolvedValueOnce([{ locked: false }]);
    expect(await scheduler.runExclusive('stale-orders', fn)).toBe(false);
    expect(fn).toHaveBeenCalledTimes(2);

    mockRedis!.down = false;
    expect(await scheduler.runExclusive('stale-orders', fn)).toBe(true);
    mockRedis!.down = true;
    expect(await scheduler.runExclusive('stale-orders', fn)).toBe(true);
    expect(warn.mock.calls.filter(([, msg]) => String(msg).includes('falling back'))).toHaveLength(2);
  });

  it('keeps the job marked running when the fallback transaction times out before the job settles', async () => {
    mockRedis!.down = true;
    const hung = deferred();
    mockTransaction.mockImplementationOnce(async (body) => {
      void body({ $queryRaw: mockQueryRaw });
      await new Promise((r) => setImmediate(r));
      throw new Error('Transaction already closed: timeout');
    });
    await expect(scheduler.runExclusive('stale-orders', () => hung.promise)).rejects.toThrow('Transaction already closed');

    const again = jest.fn(async () => undefined);
    expect(await scheduler.runExclusive('stale-orders', again)).toBe(false);
    expect(again).not.toHaveBeenCalled();

    hung.resolve();
    await new Promise((r) => setImmediate(r));
    expect(await scheduler.runExclusive('stale-orders', again)).toBe(true);
  });

  it('gives back the slot after maxMs but keeps the hung job from starting again', async () => {
    process.env.SCHEDULER_CONCURRENCY = '1';
    const hung = deferred();
    const first = scheduler.runExclusive('hung', () => hung.promise, 1_000);
    await new Promise((r) => setImmediate(r));
    await expect(first).rejects.toThrow('still running after 1000ms');

    expect(await scheduler.runExclusive('other', async () => undefined)).toBe(true);
    const again = jest.fn(async () => undefined);
    expect(await scheduler.runExclusive('hung', again)).toBe(false);
    expect(again).not.toHaveBeenCalled();

    hung.resolve();
    await new Promise((r) => setImmediate(r));
    expect(mockRedis!.keys.size).toBe(0);
    expect(await scheduler.runExclusive('hung', again)).toBe(true);
  });
});
