/** Every timed job and the queue workers start from one place, so the API and the worker run the same set. */
const scheduled: string[] = [];
jest.mock('../src/jobs/scheduler', () => ({ scheduleJob: (name: string) => scheduled.push(name) }));
const mockStartWorkers = jest.fn();
jest.mock('../src/jobs/queue', () => ({ startWorkers: () => mockStartWorkers(), defineJob: jest.fn(), enqueue: jest.fn() }));
jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));

import { startBackgroundWork } from '../src/jobs/background';

it('schedules every timed job and starts the queue workers', () => {
  startBackgroundWork();
  expect(scheduled.sort()).toEqual([
    'audit-retention', 'cash-overdue', 'dispatch-waiting', 'expire-payment-attempts', 'hub-expiry', 'kitchen-owing', 'ledger-catch-up',
    'ops-snapshot', 'prune-refresh-tokens', 'purge-expired-secrets', 'ranking-scores', 'scheduled-deliveries',
    'stale-orders', 'stock-alerts', 'daily-payouts',
  ].sort());
  expect(mockStartWorkers).toHaveBeenCalledTimes(1);
});
