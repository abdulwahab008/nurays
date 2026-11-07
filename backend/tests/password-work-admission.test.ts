/**
 * Routes that hash a password run a few at a time; a short queue waits behind them, and past that the answer is an
 * immediate 503 SERVICE_BUSY instead of a queue that grows until every caller has given up (LOAD-3). A caller that
 * hung up while it waited costs no hash.
 */
import type { Request, Response } from 'express';
import { AppError } from '../src/middleware/errorHandler';

process.env.PASSWORD_HASH_CONCURRENCY = '2';
process.env.PASSWORD_HASH_QUEUE = '3';
const { admitPasswordWork } = require('../src/middleware/rateLimiter') as typeof import('../src/middleware/rateLimiter');

const request = (destroyed = false) => ({ socket: { destroyed } }) as unknown as Request;
const response = {} as Response;

describe('admission control for password hashing', () => {
  it('runs two at once, queues three, and turns the sixth away at once with SERVICE_BUSY', async () => {
    let running = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const handler = admitPasswordWork(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise<void>((resolve) => releases.push(resolve));
      running -= 1;
    });

    const admitted = Array.from({ length: 5 }, () => handler(request(), response));
    const refused = await handler(request(), response).then(() => null, (err: unknown) => err);
    expect(refused).toBeInstanceOf(AppError);
    expect(refused).toMatchObject({ statusCode: 503, code: 'SERVICE_BUSY', isExpected: true });

    for (let i = 0; i < 5; i++) {
      while (releases.length === 0) await new Promise((r) => setImmediate(r));
      releases.shift()?.();
    }
    await Promise.all(admitted);
    expect(peak).toBe(2);
  });

  it('skips the work for a caller that disconnected while it waited', async () => {
    const work = jest.fn(async () => undefined);
    await admitPasswordWork(work)(request(true), response);
    expect(work).not.toHaveBeenCalled();
    await admitPasswordWork(work)(request(false), response);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('passes a handler error through unchanged', async () => {
    const boom = new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    await expect(admitPasswordWork(async () => { throw boom; })(request(), response)).rejects.toBe(boom);
  });
});
