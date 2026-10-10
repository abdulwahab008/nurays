/**
 * Counts of things that may only happen so many times in a window: shared through Redis when it is
 * configured, kept in the process otherwise, and never a reason to refuse a request when Redis is down.
 */

interface FakeRedis {
  store: Map<string, { value: number; expiresAt: number }>;
  failing: boolean;
  now: () => number;
  get: (key: string) => Promise<string | null>;
  del: (key: string) => Promise<number>;
  multi: () => any;
}

const fakeRedis: FakeRedis = {
  store: new Map<string, { value: number; expiresAt: number }>(),
  failing: false,
  now: () => Date.now(),
  get: async (key: string): Promise<string | null> => {
    if (fakeRedis.failing) throw new Error('Redis is down');
    const e = fakeRedis.store.get(key);
    return e && e.expiresAt > fakeRedis.now() ? String(e.value) : null;
  },
  del: async (key: string): Promise<number> => {
    if (fakeRedis.failing) throw new Error('Redis is down');
    fakeRedis.store.delete(key);
    return 1;
  },
  multi: () => {
    const ops: Array<() => unknown> = [];
    const chain: any = {
      set: (key: string, value: number, _px: string, ms: number, _nx: string) => {
        ops.push(() => {
          const e = fakeRedis.store.get(key);
          if (!e || e.expiresAt <= fakeRedis.now()) fakeRedis.store.set(key, { value, expiresAt: fakeRedis.now() + ms });
          return 'OK';
        });
        return chain;
      },
      incr: (key: string) => {
        ops.push(() => {
          const e = fakeRedis.store.get(key)!;
          e.value += 1;
          return e.value;
        });
        return chain;
      },
      exec: async () => {
        if (fakeRedis.failing) throw new Error('Redis is down');
        return ops.map((op) => [null, op()]);
      },
    };
    return chain;
  },
};
let redisOn = false;
jest.mock('../src/config/redis', () => ({ getRedis: () => (redisOn ? fakeRedis : null) }));

import { budgetAdd, budgetReset, budgetUsed } from '../src/utils/attemptBudget';

beforeEach(() => {
  redisOn = false;
  fakeRedis.failing = false;
  fakeRedis.store.clear();
  jest.useRealTimers();
});

describe('in this process (no Redis)', () => {
  it('counts, then forgets at the end of the window', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-10T10:00:00Z') });
    expect(await budgetUsed('mem:a')).toBe(0);
    expect(await budgetAdd('mem:a', 60_000)).toBe(1);
    expect(await budgetAdd('mem:a', 60_000)).toBe(2);
    expect(await budgetUsed('mem:a')).toBe(2);
    jest.setSystemTime(new Date('2026-10-10T10:00:59Z'));
    expect(await budgetUsed('mem:a')).toBe(2);
    jest.setSystemTime(new Date('2026-10-10T10:01:01Z'));
    expect(await budgetUsed('mem:a')).toBe(0);
    expect(await budgetAdd('mem:a', 60_000)).toBe(1);
  });

  it('does not extend the window by counting again', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-10T10:00:00Z') });
    await budgetAdd('mem:b', 60_000);
    jest.setSystemTime(new Date('2026-10-10T10:00:50Z'));
    await budgetAdd('mem:b', 60_000);
    jest.setSystemTime(new Date('2026-10-10T10:01:05Z'));
    expect(await budgetUsed('mem:b')).toBe(0);
  });

  it('keeps keys apart and can be reset', async () => {
    await budgetAdd('mem:c', 60_000);
    await budgetAdd('mem:d', 60_000);
    await budgetReset('mem:c');
    expect(await budgetUsed('mem:c')).toBe(0);
    expect(await budgetUsed('mem:d')).toBe(1);
  });
});

describe('through Redis', () => {
  beforeEach(() => {
    redisOn = true;
  });

  it('counts under a prefix, with the window set before the first increment', async () => {
    expect(await budgetAdd('redis:a', 60_000)).toBe(1);
    expect(await budgetAdd('redis:a', 60_000)).toBe(2);
    expect(await budgetUsed('redis:a')).toBe(2);
    expect(fakeRedis.store.has('budget:redis:a')).toBe(true);
    expect(fakeRedis.store.get('budget:redis:a')!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('forgets when reset', async () => {
    await budgetAdd('redis:b', 60_000);
    await budgetReset('redis:b');
    expect(await budgetUsed('redis:b')).toBe(0);
  });

  it('carries on in this process when Redis cannot be reached, instead of failing the request', async () => {
    fakeRedis.failing = true;
    expect(await budgetAdd('redis:c', 60_000)).toBe(1);
    expect(await budgetAdd('redis:c', 60_000)).toBe(2);
    expect(await budgetUsed('redis:c')).toBe(2);
    await expect(budgetReset('redis:c')).resolves.toBeUndefined();
    expect(await budgetUsed('redis:c')).toBe(0);
  });
});
