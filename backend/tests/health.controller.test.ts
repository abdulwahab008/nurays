import { Request, Response } from 'express';

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: { $queryRaw: jest.fn() },
}));
jest.mock('../src/config/redis', () => ({
  __esModule: true,
  default: { ping: jest.fn() },
}));
jest.mock('../src/gateways', () => ({
  getGatewayStatuses: jest.fn(),
}));

import { healthCheck } from '../src/controllers/health.controller';
import prisma from '../src/config/database';
import redis from '../src/config/redis';
import { getGatewayStatuses } from '../src/gateways';

const queryRaw = prisma.$queryRaw as unknown as jest.Mock;
const ping = redis.ping as unknown as jest.Mock;
const gatewayStatuses = getGatewayStatuses as jest.Mock;

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

describe('healthCheck', () => {
  beforeEach(() => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    ping.mockResolvedValue('PONG');
    gatewayStatuses.mockReturnValue(GATEWAYS);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns 200 with all services healthy when probes succeed', async () => {
    const res = mockRes();
    await healthCheck({} as Request, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = sentBody(res);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.services.database).toBe('healthy');
    expect(body.data.services.redis).toBe('healthy');
    expect(body.data.services.payment_gateways).toEqual(GATEWAYS);
  });

  it('runs a real query against the database', async () => {
    await healthCheck({} as Request, mockRes());
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('reports database unhealthy with 503 when the query fails auth (P1000)', async () => {
    queryRaw.mockRejectedValue(
      new Error('Authentication failed against database server, the provided database credentials are not valid'),
    );
    const res = mockRes();
    await healthCheck({} as Request, res);

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
    await healthCheck({} as Request, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = sentBody(res);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('degraded');
    expect(body.data.services.redis).toBe('unhealthy');
    expect(body.data.services.database).toBe('healthy');
  });

  it('times out a hanging database probe instead of hanging the endpoint', async () => {
    jest.useFakeTimers();
    queryRaw.mockReturnValue(new Promise(() => {}));
    const res = mockRes();

    const pending = healthCheck({} as Request, res);
    await jest.advanceTimersByTimeAsync(3000);
    await pending;

    expect(res.status).toHaveBeenCalledWith(503);
    expect(sentBody(res).data.services.database).toBe('unhealthy');
  });

  it('times out a hanging redis probe instead of hanging the endpoint', async () => {
    jest.useFakeTimers();
    ping.mockReturnValue(new Promise(() => {}));
    const res = mockRes();

    const pending = healthCheck({} as Request, res);
    await jest.advanceTimersByTimeAsync(3000);
    await pending;

    expect(res.status).toHaveBeenCalledWith(200);
    const body = sentBody(res);
    expect(body.data.status).toBe('degraded');
    expect(body.data.services.redis).toBe('unhealthy');
  });
});
