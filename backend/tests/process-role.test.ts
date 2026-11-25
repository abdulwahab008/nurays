/**
 * The API runs the background work itself unless a separate worker has it (PROCESS_ROLE=api), and that split
 * needs Redis: without it the worker's jobs and live updates would not reach the API's clients.
 */
import { configProblems, processRole } from '../src/config/env';

const base = { NODE_ENV: 'development', DATABASE_URL: 'postgresql://x/y', JWT_SECRET: 'x'.repeat(40) };

it('runs everything in the API by default, and only HTTP with PROCESS_ROLE=api', () => {
  expect(processRole({})).toBe('all');
  expect(processRole({ PROCESS_ROLE: 'all' })).toBe('all');
  expect(processRole({ PROCESS_ROLE: ' API ' })).toBe('api');
});

it('refuses PROCESS_ROLE=api without Redis, and a role it does not know', () => {
  expect(configProblems({ ...base, PROCESS_ROLE: 'api' }).join(' ')).toMatch(/REDIS_URL is required/);
  expect(configProblems({ ...base, PROCESS_ROLE: 'api', REDIS_URL: 'redis://r:6379' })).toEqual([]);
  expect(configProblems({ ...base, PROCESS_ROLE: 'worker' }).join(' ')).toMatch(/dist\/worker\.js/);
});
