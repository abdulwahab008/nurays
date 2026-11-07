import { Request, Response } from 'express';

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: { $queryRaw: jest.fn() },
}));
const redisClient = { ping: jest.fn() };
jest.mock('../src/config/redis', () => ({
  __esModule: true,
  getRedis: jest.fn(() => redisClient),
}));
jest.mock('../src/utils/lifecycle', () => ({
  isShuttingDown: jest.fn(() => false),
}));
jest.mock('../src/gateways', () => ({
  getGatewayStatuses: jest.fn(),
}));
jest.mock('../src/middleware/auth.middleware', () => ({
  optionalAuthenticate: jest.fn(async (req: Request, _res: Response, next: () => void) => {
    req.user = { userType: 'admin' } as Request['user'];
    next();
  }),
}));
jest.mock('../src/jobs/queue', () => ({
  getQueueCounts: jest.fn(async () => ({ waiting: 2, active: 1, failed: 7, delayed: 0 })),
}));

import { healthCheck, liveness, readiness } from '../src/controllers/health.controller';
import prisma from '../src/config/database';
import { getRedis } from '../src/config/redis';
import { isShuttingDown } from '../src/utils/lifecycle';
import { getGatewayStatuses } from '../src/gateways';
import { optionalAuthenticate } from '../src/middleware/auth.middleware';
import { generateToken } from '../src/utils/jwt';

const queryRaw = prisma.$queryRaw as unknown as jest.Mock;
const ping = redisClient.ping as jest.Mock;
const gatewayStatuses = getGatewayStatuses as jest.Mock;
const authLookup = optionalAuthenticate as jest.Mock;

const GATEWAYS = {
  jazzcash: 'not_configured',
  easypaisa: 'not_configured',
  bank: 'not_configured',
  safepay: 'configured',
};

const mockRes = () => {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const sentBody = (res: ReturnType<typeof mockRes>) => res.json.mock.calls[0][0];
const publicReq = () => ({ headers: {} }) as Request;
const bearerReq = (token: string) => ({ headers: { authorization: `Bearer ${token}` } }) as unknown as Request;
const tokenFor = (userType: string) => generateToken({ userId: `user-${userType}`, userType, phone: '+923001234567' });
const adminReq = () => bearerReq(tokenFor('admin'));

// Probe results are cached for a second; each test starts a minute later so it probes afresh.
let clock = Date.now();
beforeEach(() => {
  jest.useFakeTimers({ now: (clock += 60_000), doNotFake: ['nextTick', 'setImmediate'] });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('healthCheck', () => {
  beforeEach(() => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    ping.mockResolvedValue('PONG');
    gatewayStatuses.mockReturnValue(GATEWAYS);
  });

  it('returns 200 with all services healthy when probes succeed, and no configuration to the public', async () => {
    const res = mockRes();
    await healthCheck(publicReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = sentBody(res);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.services).toEqual({ database: 'healthy', redis: 'healthy' });
    expect(body.data.version).toBeUndefined();
  });

  it('shows an admin the payment gateways and the job queue counts', async () => {
    const res = mockRes();
    await healthCheck(adminReq(), res);

    const body = sentBody(res);
    expect(body.data.services.payment_gateways).toEqual(GATEWAYS);
    expect(body.data.services.jobs).toEqual({ waiting: 2, active: 1, failed: 7, delayed: 0 });
  });

  it('looks nobody up for a token that is forged or does not claim admin', async () => {
    authLookup.mockClear();
    for (const req of [bearerReq('not-a-jwt'), bearerReq(tokenFor('customer'))]) {
      const res = mockRes();
      await healthCheck(req, res);
      expect(sentBody(res).data.services).toEqual({ database: 'healthy', redis: 'healthy' });
    }
    expect(authLookup).not.toHaveBeenCalled();
  });

  it('gives a token that claims admin the public view when the account is no longer an admin', async () => {
    authLookup.mockImplementationOnce(async (req: Request, _res: Response, next: () => void) => {
      req.user = { userType: 'customer' } as Request['user'];
      next();
    });
    const res = mockRes();
    await healthCheck(adminReq(), res);
    expect(authLookup).toHaveBeenCalled();
    expect(sentBody(res).data.services).toEqual({ database: 'healthy', redis: 'healthy' });
  });

  it('gives an admin token the public view when the account lookup does not answer in time', async () => {
    authLookup.mockImplementationOnce(() => new Promise(() => {}));
    const res = mockRes();
    const pending = healthCheck(adminReq(), res);
    await jest.advanceTimersByTimeAsync(500);
    await pending;
    expect(sentBody(res).data.services).toEqual({ database: 'healthy', redis: 'healthy' });
  });

  it('probes the database and Redis at most once a second however often it is hit', async () => {
    await Promise.all([healthCheck(publicReq(), mockRes()), healthCheck(publicReq(), mockRes())]);
    await healthCheck(publicReq(), mockRes());
    await readiness(publicReq(), mockRes());
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);

    jest.setSystemTime(Date.now() + 1_500);
    await healthCheck(publicReq(), mockRes());
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('runs a real query against the database', async () => {
    await healthCheck(publicReq(), mockRes());
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('reports database unhealthy with 503 when the query fails auth (P1000)', async () => {
    queryRaw.mockRejectedValue(
      new Error('Authentication failed against database server, the provided database credentials are not valid'),
    );
    const res = mockRes();
    await healthCheck(publicReq(), res);

    expect(res.status).toHaveBeenCalledWith(503);
    const body = sentBody(res);
    expect(body.success).toBe(false);
    expect(body.data.status).toBe('unhealthy');
    expect(body.data.services.database).toBe('unhealthy');
    expect(body.data.services.redis).toBe('healthy');
  });

  it('reports redis unhealthy but stays 200 degraded when only redis fails', async () => {
    ping.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379'));
    const res = mockRes();
    await healthCheck(publicReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = sentBody(res);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('degraded');
    expect(body.data.services.redis).toBe('unhealthy');
    expect(body.data.services.database).toBe('healthy');
  });

  it('times out a hanging database probe instead of hanging the endpoint', async () => {
    queryRaw.mockReturnValue(new Promise(() => {}));
    const res = mockRes();

    const pending = healthCheck(publicReq(), res);
    await jest.advanceTimersByTimeAsync(3000);
    await pending;

    expect(res.status).toHaveBeenCalledWith(503);
    expect(sentBody(res).data.services.database).toBe('unhealthy');
  });

  it('times out a hanging redis probe instead of hanging the endpoint', async () => {
    ping.mockReturnValue(new Promise(() => {}));
    const res = mockRes();

    const pending = healthCheck(publicReq(), res);
    await jest.advanceTimersByTimeAsync(3000);
    await pending;

    expect(res.status).toHaveBeenCalledWith(200);
    const body = sentBody(res);
    expect(body.data.status).toBe('degraded');
    expect(body.data.services.redis).toBe('unhealthy');
  });
});

describe('without Redis configured', () => {
  beforeEach(() => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    gatewayStatuses.mockReturnValue(GATEWAYS);
    (getRedis as jest.Mock).mockReturnValueOnce(null);
  });

  it('reports redis as not configured and the service as ok', async () => {
    const res = mockRes();
    await healthCheck(publicReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(sentBody(res).data.status).toBe('ok');
    expect(sentBody(res).data.services.redis).toBe('not_configured');
  });
});

describe('liveness and readiness', () => {
  beforeEach(() => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    (isShuttingDown as jest.Mock).mockReturnValue(false);
  });

  it('liveness answers 200 without touching the database', () => {
    queryRaw.mockClear();
    const res = mockRes();
    liveness(publicReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('readiness is 200 when the database answers', async () => {
    const res = mockRes();
    await readiness(publicReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(sentBody(res).data.status).toBe('ready');
  });

  it('readiness is 503 without the database', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'));
    const res = mockRes();
    await readiness(publicReq(), res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('readiness is 503 while shutting down, so the load balancer drains this instance', async () => {
    (isShuttingDown as jest.Mock).mockReturnValue(true);
    const res = mockRes();
    await readiness(publicReq(), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(sentBody(res).data.status).toBe('shutting_down');
  });
});
