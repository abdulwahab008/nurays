import { concurrencyLimit } from '../src/utils/concurrencyLimit';

const tick = () => new Promise<void>((r) => setImmediate(r));

describe('concurrencyLimit', () => {
  it('never runs more than the limit at once, and still finishes everything, in order', async () => {
    const run = concurrencyLimit(2);
    let running = 0;
    let peak = 0;
    const order: number[] = [];
    const job = (n: number) => run(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      await tick();
      running -= 1;
      order.push(n);
      return n * 2;
    });
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(job));
    expect(results).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBe(2);
    expect(order).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('frees the slot when a job fails, so the ones behind it still run', async () => {
    const run = concurrencyLimit(1);
    const failing = run(async () => {
      throw new Error('boom');
    });
    const after = run(async () => 'ran');
    await expect(failing).rejects.toThrow('boom');
    await expect(after).resolves.toBe('ran');
  });

  it('lets a job through at once when nothing is running', async () => {
    const run = concurrencyLimit(3);
    await expect(run(async () => 'now')).resolves.toBe('now');
  });
});
