/**
 * The load runner's arithmetic (scripts/load): it is what decides whether a launch load test passed, so the
 * percentiles, the classification of answers, the targets and the scaling of the sizes are tested here.
 */
import { databaseName, quantile, rng, size } from '../scripts/load/common';
import { judge, Recorder, runVus, targetFor } from '../scripts/load/engine';

describe('quantile', () => {
  it('picks the value at that share of the sorted list', () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(quantile(sorted, 0.5)).toBe(51);
    expect(quantile(sorted, 0.95)).toBe(96);
    expect(quantile(sorted, 0.99)).toBe(100);
    expect(quantile(sorted, 1)).toBe(100);
    expect(quantile([7], 0.95)).toBe(7);
    expect(quantile([], 0.95)).toBe(0);
  });
});

describe('Recorder', () => {
  it('counts answers by kind and computes the percentiles and rate', () => {
    const rec = new Recorder();
    for (let i = 1; i <= 100; i++) rec.record('GET /a', i, 200, 1000);
    rec.record('GET /a', 5, 302);
    rec.record('GET /a', 5, 404);
    rec.record('GET /a', 5, 429);
    rec.record('GET /a', 5, 500);
    rec.record('GET /a', 5, 503);
    rec.record('GET /a', 5, 0);
    const [s] = rec.stats(10);
    expect(s.name).toBe('GET /a');
    expect(s.count).toBe(106);
    expect(s.rps).toBeCloseTo(10.6);
    expect(s).toMatchObject({ ok: 101, clientErrors: 1, throttled: 1, serverErrors: 2, networkErrors: 1 });
    expect(s.max).toBe(100);
    expect(s.p95).toBeGreaterThan(s.p50);
    expect(s.avgBytes).toBeCloseTo(100000 / 106);
  });

  it('remembers why answers of 400 and over were given, the most common reason first', () => {
    const rec = new Recorder();
    rec.record('POST /claim', 5, 200);
    for (let i = 0; i < 3; i++) rec.record('POST /claim', 5, 409, 0, 'RIDER_CAPACITY_REACHED');
    rec.record('POST /claim', 5, 409, 0, 'ALREADY_CLAIMED');
    rec.record('POST /claim', 5, 502);
    rec.record('POST /claim', 5, 0);
    expect(rec.stats(1)[0].refusals).toEqual([
      { status: 409, code: 'RIDER_CAPACITY_REACHED', count: 3 },
      { status: 409, code: 'ALREADY_CLAIMED', count: 1 },
      { status: 502, code: 'no error code', count: 1 },
    ]);
    rec.record('GET /fine', 5, 200);
    expect(rec.stats(1).find((s) => s.name === 'GET /fine')?.refusals).toEqual([]);
  });

  it('keeps endpoints apart and lists them in name order', () => {
    const rec = new Recorder();
    rec.record('POST /b', 1, 201);
    rec.record('GET /a', 1, 200);
    expect(rec.stats(1).map((s) => s.name)).toEqual(['GET /a', 'POST /b']);
  });
});

describe('the launch targets', () => {
  const stats = (name: string, ms: number, count = 50, over: Record<string, number> = {}) => {
    const rec = new Recorder();
    for (let i = 0; i < count; i++) rec.record(name, ms, 200);
    for (const [code, n] of Object.entries(over)) for (let i = 0; i < n; i++) rec.record(name, ms, Number(code));
    return rec.stats(1);
  };

  it('allows 300 ms for a read and 800 ms for a write at the 95th percentile', () => {
    expect(targetFor('GET /products', [])).toBe(300);
    expect(targetFor('POST /orders', [])).toBe(800);
    expect(judge(stats('GET /products', 299)).passed).toBe(true);
    expect(judge(stats('GET /products', 301)).failures[0]).toMatch(/p95 301 ms is over the 300 ms target/);
    expect(judge(stats('POST /orders', 799)).passed).toBe(true);
    expect(judge(stats('POST /orders', 801)).passed).toBe(false);
  });

  it('takes a target for a kind of endpoint from the scenario', () => {
    const targets = [{ prefix: 'POST /auth/login', p95Ms: 1000 }];
    expect(judge(stats('POST /auth/login', 900), targets).passed).toBe(true);
    expect(judge(stats('POST /auth/login', 1100), targets).passed).toBe(false);
  });

  it('fails on any 5xx and any request that got no answer, whatever the speed', () => {
    expect(judge(stats('GET /x', 1, 50, { 500: 1 })).failures).toEqual(['GET /x: 1 answers were 5xx']);
    expect(judge(stats('GET /x', 1, 50, { 0: 2 })).failures).toEqual(['GET /x: 2 requests got no answer']);
  });

  it('does not judge the speed of an endpoint called only a few times, and does not count 429 or 4xx as failures', () => {
    expect(judge(stats('GET /x', 5000, 5)).passed).toBe(true);
    expect(judge(stats('GET /x', 1, 50, { 429: 10, 404: 3 })).passed).toBe(true);
  });
});

describe('runVus', () => {
  it('runs every virtual user until the time is up and survives an iteration that throws', async () => {
    const turns = new Map<number, number>();
    await runVus(3, { seconds: 0.3, ramp: 0 }, async (vu) => {
      turns.set(vu, (turns.get(vu) ?? 0) + 1);
      if ((turns.get(vu) ?? 0) === 1) throw new Error('the first turn fails');
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect([...turns.keys()].sort()).toEqual([0, 1, 2]);
    for (const n of turns.values()) expect(n).toBeGreaterThan(1);
  });
});

describe('sizes and the seeder\'s helpers', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('scales the default size, with a floor of one', () => {
    delete process.env.LOAD_SCALE;
    expect(size('ORDERS', 50000)).toBe(50000);
    process.env.LOAD_SCALE = '0.02';
    expect(size('ORDERS', 50000)).toBe(1000);
    expect(size('RIDERS', 10)).toBe(1);
  });

  it('lets an explicit size win and refuses nonsense', () => {
    process.env.LOAD_SCALE = '0.02';
    process.env.LOAD_ORDERS = '123';
    expect(size('ORDERS', 50000)).toBe(123);
    process.env.LOAD_ORDERS = '12.5';
    expect(() => size('ORDERS', 1)).toThrow(/whole number/);
    delete process.env.LOAD_ORDERS;
    process.env.LOAD_SCALE = '0';
    expect(() => size('ORDERS', 1)).toThrow(/positive/);
  });

  it('reads the database name out of a connection URL', () => {
    expect(databaseName('postgresql://u:p@host:5432/nuray_load?schema=public')).toBe('nuray_load');
    expect(databaseName('postgresql://postgres@localhost:54329/nuray_load?host=/tmp')).toBe('nuray_load');
    expect(databaseName('postgresql://u:p@host/nuray')).toBe('nuray');
    expect(databaseName('postgresql://u:p@host')).toBeNull();
    expect(databaseName('not a url')).toBeNull();
    expect(databaseName(undefined)).toBeNull();
  });

  it('gives the same numbers for the same seed', () => {
    const a = rng(7);
    const b = rng(7);
    const first = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(first);
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(rng(8)()).not.toBe(first[0]);
  });
});
