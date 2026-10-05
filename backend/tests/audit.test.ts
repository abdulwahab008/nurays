/** The admin audit trail: what is recorded, what is hidden, and who is recorded. */
const mockCreate = jest.fn().mockResolvedValue({});
jest.mock('../src/config/database', () => ({ __esModule: true, default: { auditLog: { create: (...a: unknown[]) => mockCreate(...a) } } }));

import { EventEmitter } from 'events';
import { auditDenied, auditWrites, recordAudit } from '../src/middleware/audit';

const run = (mw: (req: any, res: any, next: () => void) => void, req: any, status: number) => {
  const res: any = new EventEmitter();
  res.statusCode = status;
  const next = jest.fn();
  mw({ method: 'POST', originalUrl: '/api/v1/admin/orders/o1/cancel', path: '/orders/:id/cancel', route: { path: '/orders/:id/cancel' }, ip: '1.2.3.4', get: () => 'jest', body: {}, ...req }, res, next);
  res.emit('finish');
  return next;
};
const settle = () => new Promise((r) => setImmediate(r));

beforeEach(() => mockCreate.mockClear());

describe('auditWrites', () => {
  it('records who, what, which record and the outcome, with secrets redacted', async () => {
    run(auditWrites('admin'), { user: { userId: 'a1', userType: 'admin' }, body: { reason: 'duplicate', password: 'hunter2' } }, 200);
    await settle();
    const data = mockCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'a1', action: 'admin:POST /orders/:id/cancel', entityId: 'o1', responseStatus: 200 });
    expect(data.requestData).toEqual({ reason: 'duplicate', password: '[redacted]' });
  });

  it('records refused attempts too', async () => {
    run(auditWrites('admin'), { user: { userId: 'a1', userType: 'admin' } }, 400);
    await settle();
    expect(mockCreate.mock.calls[0][0].data.responseStatus).toBe(400);
  });

  it('does not record reads', async () => {
    run(auditWrites('admin'), { method: 'GET', user: { userId: 'a1', userType: 'admin' } }, 200);
    await settle();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('on a shared route, records an admin but not a seller (onlyAdmins)', async () => {
    run(auditWrites('admin-as-seller', { onlyAdmins: true }), { user: { userId: 's1', userType: 'seller' } }, 200);
    await settle();
    expect(mockCreate).not.toHaveBeenCalled();
    run(auditWrites('admin-as-seller', { onlyAdmins: true }), { user: { userId: 'a1', userType: 'admin' } }, 200);
    await settle();
    expect(mockCreate.mock.calls[0][0].data.action).toBe('admin-as-seller:POST /orders/:id/cancel');
  });
});

describe('auditDenied', () => {
  it('records a 403 and a 401 on the admin area (any method), once', async () => {
    run(auditDenied('admin'), { method: 'GET', user: { userId: 'c1', userType: 'customer' } }, 403);
    run(auditDenied('admin'), { method: 'POST' }, 401);
    await settle();
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({ userId: 'c1', action: 'admin:DENIED GET /api/v1/admin/orders/o1/cancel', responseStatus: 403, entityType: 'access' });
    expect(mockCreate.mock.calls[1][0].data.userId).toBeNull();
  });
  it('ignores successful and other failing requests', async () => {
    run(auditDenied('admin'), {}, 200);
    run(auditDenied('admin'), {}, 404);
    await settle();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('recordAudit', () => {
  it('never throws when the database is down', async () => {
    mockCreate.mockRejectedValueOnce(new Error('db down'));
    await expect(recordAudit({ action: 'auth:LOGIN' })).resolves.toBeUndefined();
  });
});
