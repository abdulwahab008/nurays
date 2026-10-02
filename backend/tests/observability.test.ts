import { EventEmitter } from 'events';
import type { Request, Response, NextFunction } from 'express';

jest.mock('../src/config/sentry', () => ({ reportError: jest.fn() }));
const auditCreate = jest.fn().mockResolvedValue({});
jest.mock('../src/config/database', () => ({ __esModule: true, default: { auditLog: { create: (...a: unknown[]) => auditCreate(...a) } } }));

import { errorHandler, AppError } from '../src/middleware/errorHandler';
import { reportError } from '../src/config/sentry';
import { auditWrites } from '../src/middleware/audit';

const mockRes = () => {
  const res = new EventEmitter() as unknown as Response & { status: jest.Mock; json: jest.Mock; statusCode: number };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  return res;
};
const req = (over: Partial<Request> = {}) => ({ path: '/api/v1/x', method: 'GET', id: 'req-1', ...over }) as unknown as Request;

describe('errorHandler', () => {
  beforeEach(() => (reportError as jest.Mock).mockClear());

  it('reports an unexpected error and hides its message outside development', () => {
    const res = mockRes();
    errorHandler(new Error('db password is hunter2'), req(), res, jest.fn() as NextFunction);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.requestId).toBe('req-1');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body.error.stack).toBeUndefined();
  });

  it('does not report client errors (4xx) but still returns the request id', () => {
    const res = mockRes();
    errorHandler(new AppError('Order not found', 404, 'ORDER_NOT_FOUND'), req(), res, jest.fn() as NextFunction);
    expect(reportError).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0]).toMatchObject({ requestId: 'req-1', error: { code: 'ORDER_NOT_FOUND' } });
  });

  it('reports an AppError that is a server failure (5xx)', () => {
    errorHandler(new AppError('Failed to send email', 502, 'EMAIL_SEND_FAILED'), req(), mockRes(), jest.fn() as NextFunction);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

describe('auditWrites', () => {
  beforeEach(() => auditCreate.mockClear());
  const run = (r: Partial<Request>, status: number) => {
    const res = mockRes();
    const next = jest.fn();
    const full = { method: 'POST', ip: '1.2.3.4', get: () => 'test-agent', user: { userId: 'admin-1' }, ...r } as unknown as Request;
    auditWrites('admin')(full, res, next);
    res.statusCode = status;
    (res as unknown as EventEmitter).emit('finish');
    return { next, full, res };
  };

  it('records an admin change with the record id from the URL, even when the handler failed', () => {
    run({ route: { path: '/refunds/:refundId/complete' } as any, originalUrl: '/api/v1/admin/refunds/abc-123/complete?x=1', body: { reference: 'TX-9' }, params: {} }, 404);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      userId: 'admin-1',
      action: 'admin:POST /refunds/:refundId/complete',
      entityType: 'refunds',
      entityId: 'abc-123',
      responseStatus: 404,
      requestData: { reference: 'TX-9' },
    });
  });

  it('redacts secret fields from what it stores', () => {
    run({ route: { path: '/settings' } as any, originalUrl: '/api/v1/admin/settings', body: { commission: 10, password: 'x', nested: { otpCode: '1234' } } }, 200);
    expect(auditCreate.mock.calls[0][0].data.requestData).toEqual({ commission: 10, password: '[redacted]', nested: { otpCode: '[redacted]' } });
  });

  it('records a request passing through two admin routers once, and ignores reads', () => {
    const res = mockRes();
    const r = { method: 'POST', route: { path: '/payouts/:id/complete' }, originalUrl: '/api/v1/admin/payouts/p1/complete', get: () => '', user: { userId: 'a' } } as unknown as Request;
    auditWrites('admin')(r, res, jest.fn());
    auditWrites('admin')(r, res, jest.fn());
    (res as unknown as EventEmitter).emit('finish');
    expect(auditCreate).toHaveBeenCalledTimes(1);

    auditCreate.mockClear();
    run({ method: 'GET', route: { path: '/payouts' } as any, originalUrl: '/api/v1/admin/payouts' }, 200);
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
