import { EventEmitter } from 'events';

/** The queue's Redis connection as ioredis shows it: 'connecting' until the handshake is done, then 'ready'. */
class FakeConnection extends EventEmitter {
  status = 'connecting';
  constructor() {
    super();
    this.on('error', () => undefined); // config/redis.ts always listens for errors, and logs them
  }
  becomeReady() {
    this.status = 'ready';
    this.emit('ready');
  }
  refuse() {
    this.emit('error', new Error('connect ECONNREFUSED 127.0.0.1:6379'));
  }
}

let mockConnection: FakeConnection;
const mockAdd = jest.fn();
const mockOpened = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockAdd, close: jest.fn().mockResolvedValue(undefined) })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn().mockResolvedValue(undefined) })),
}));
jest.mock('../src/config/redis', () => ({
  redisUrl: () => process.env.REDIS_URL || null,
  newRedisConnection: (name: string) => {
    mockOpened(name);
    return mockConnection;
  },
}));

type QueueModule = typeof import('../src/jobs/queue');
let jobs: QueueModule;
let ran: number[];

beforeEach(() => {
  mockConnection = new FakeConnection();
  mockAdd.mockResolvedValue({ remove: jest.fn().mockResolvedValue(undefined) });
  process.env.REDIS_URL = 'redis://redis.example.test:6379';
  ran = [];
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  jobs = require('../src/jobs/queue');
  jobs.defineJob<{ n: number }>('probe', async ({ n }) => {
    ran.push(n);
  });
});
afterEach(async () => {
  jest.useRealTimers();
  delete process.env.REDIS_URL;
  await jobs.stopWorkers();
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('a job enqueued while the queue connection is still opening', () => {
  it('waits for the connection and goes to the durable queue, not to this process', async () => {
    const enqueued = jobs.enqueue('probe', { n: 1 });
    await flush();
    expect(mockAdd).not.toHaveBeenCalled(); // still waiting for the handshake
    mockConnection.becomeReady();
    await enqueued;
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0][0]).toBe('probe');
    expect(ran).toEqual([]);
  });

  it('lets every job that arrives meanwhile through to the queue', async () => {
    const all = Promise.all([jobs.enqueue('probe', { n: 1 }), jobs.enqueue('probe', { n: 2 }), jobs.enqueue('probe', { n: 3 })]);
    await flush();
    mockConnection.becomeReady();
    await all;
    expect(mockAdd).toHaveBeenCalledTimes(3);
    expect(ran).toEqual([]);
  });

  it('runs in this process, at once, when Redis turns out to be unreachable', async () => {
    const enqueued = jobs.enqueue('probe', { n: 1 });
    await flush();
    mockConnection.refuse();
    await enqueued;
    await flush();
    expect(mockAdd).not.toHaveBeenCalled();
    expect(ran).toEqual([1]);
  });

  it('does not wait on a Redis that never answers for more than a couple of seconds', async () => {
    jest.useFakeTimers();
    const enqueued = jobs.enqueue('probe', { n: 1 });
    await jest.advanceTimersByTimeAsync(1_900);
    expect(ran).toEqual([]);
    await jest.advanceTimersByTimeAsync(200);
    await enqueued;
    expect(mockAdd).not.toHaveBeenCalled();
    expect(ran).toEqual([1]);
  });

  it('does not make later jobs wait while Redis stays down', async () => {
    const first = jobs.enqueue('probe', { n: 1 });
    await flush();
    mockConnection.refuse();
    await first;

    jest.useFakeTimers(); // nothing advances: a job that waited again would never finish
    await jobs.enqueue('probe', { n: 2 });
    expect(mockAdd).not.toHaveBeenCalled();
    expect(ran).toContain(2);
  });
});

describe('starting the workers', () => {
  it('opens the queue connection, so the first job finds it ready', async () => {
    jobs.startWorkers();
    expect(mockOpened).toHaveBeenCalledWith('queue');
    mockConnection.becomeReady();
    await jobs.enqueue('probe', { n: 1 });
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(ran).toEqual([]);
  });
});

describe('without Redis', () => {
  it('still runs a job in this process straight away', async () => {
    delete process.env.REDIS_URL;
    await jobs.enqueue('probe', { n: 1 });
    expect(ran).toEqual([1]);
    expect(mockOpened).not.toHaveBeenCalled();
  });
});

describe('the request id of a queued job', () => {
  it('travels in the job data and is the request id while the worker runs it', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requestContext } = require('../src/utils/logger') as typeof import('../src/utils/logger');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Worker } = require('bullmq') as { Worker: jest.Mock };
    const seen: Array<{ payload: unknown; requestId?: string }> = [];
    jobs.defineJob<{ n: number }>('trace', async (payload) => {
      seen.push({ payload, requestId: requestContext.getStore()?.requestId });
    });
    jobs.startWorkers();
    mockConnection.becomeReady();

    await requestContext.run({ requestId: 'rid-42' }, () => jobs.enqueue('trace', { n: 7 }));
    const queued = mockAdd.mock.calls[mockAdd.mock.calls.length - 1][1];
    expect(queued).toEqual({ n: 7, _requestId: 'rid-42' });

    const processor = Worker.mock.calls[Worker.mock.calls.length - 1][1] as (job: unknown) => Promise<void>;
    await processor({ name: 'trace', id: '9', data: queued });
    await processor({ name: 'trace', id: '10', data: { n: 8 } });
    expect(seen).toEqual([
      { payload: { n: 7 }, requestId: 'rid-42' },
      { payload: { n: 8 }, requestId: 'job:trace:10' },
    ]);
  });
});
