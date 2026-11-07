/**
 * The ops snapshot shows ready orders no rider took and the job queue counts, and warns when failed jobs grow.
 * The database and queue are doubles.
 */
const count = jest.fn(async () => 0);
const findFirst = jest.fn(async () => null);
const model = { count, findFirst };
jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => model }),
}));
jest.mock('../src/jobs/queue', () => ({ getQueueCounts: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));

import { logOpsSnapshot } from '../src/services/ops-snapshot.service';
import { getQueueCounts } from '../src/jobs/queue';
import { logger } from '../src/utils/logger';

const queueCounts = getQueueCounts as jest.Mock;
const snapshot = () => (logger.info as jest.Mock).mock.calls.at(-1)?.[0];

it('reports stuck ready orders and queue counts, and warns only when failed jobs grow', async () => {
  count.mockResolvedValueOnce(3);
  queueCounts.mockResolvedValue({ waiting: 4, active: 1, failed: 10, delayed: 2 });

  await logOpsSnapshot();
  expect(count.mock.calls[0]).toEqual([
    { where: { orderStatus: 'ready', delivery: { is: { riderId: null, status: 'pending' } }, updatedAt: { lt: expect.any(Date) } } },
  ]);
  expect(snapshot()).toEqual(expect.objectContaining({ readyNoRiderStuck: 3, jobsWaiting: 4, jobsFailed: 10, jobsDelayed: 2 }));
  expect(logger.warn).not.toHaveBeenCalled();

  await logOpsSnapshot();
  expect(logger.warn).not.toHaveBeenCalled();

  queueCounts.mockResolvedValue({ waiting: 0, active: 0, failed: 13, delayed: 0 });
  await logOpsSnapshot();
  expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ metric: 'jobs_failed', failed: 13, newlyFailed: 3 }), expect.any(String));
});

it('logs the queue counts as unknown when the queue is unreachable', async () => {
  queueCounts.mockResolvedValue(null);
  await logOpsSnapshot();
  expect(snapshot()).toEqual(expect.objectContaining({ jobsFailed: null, jobsWaiting: null }));
});
