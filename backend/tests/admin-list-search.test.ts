/**
 * Admin lists find what support is given: the kitchens and dishes lists pass their search (and the dishes list its kitchen)
 * from the URL to the service, and the orders list finds an order by the customer's phone, email or name as well as by its
 * number. The database is a double.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));

import type { Request, Response } from 'express';
import adminOrderService from '../src/services/admin-order.service';
import adminService from '../src/services/admin.service';
import { getAllSellers, getProductsForModeration } from '../src/controllers/admin.controller';
import { getAdminOrdersQuerySchema } from '../src/validators/admin-order.validator';
import supportService from '../src/services/support.service';
import { auditFilter } from '../src/services/audit-log.service';

const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() }) as unknown as Response;

describe('the orders list search', () => {
  beforeEach(() => {
    db.order = { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) };
  });
  const whereOf = () => db.order.findMany.mock.calls[0][0].where;

  it('matches the order number, email and name, and the phone however it is written', async () => {
    for (const typed of ['0300 123 0888', '+92 300 1230888', '03001230888']) {
      db.order.findMany.mockClear();
      await adminOrderService.getAllOrders({ search: typed });
      expect(whereOf().OR).toEqual(expect.arrayContaining([{ customer: { phone: { contains: '3001230888' } } }]));
    }
    db.order.findMany.mockClear();
    await adminOrderService.getAllOrders({ search: 'ayesha@' });
    expect(whereOf().OR).toEqual([
      { orderNumber: { contains: 'ayesha@', mode: 'insensitive' } },
      { customer: { email: { contains: 'ayesha@', mode: 'insensitive' } } },
      { customer: { profile: { fullName: { contains: 'ayesha@', mode: 'insensitive' } } } },
    ]);
  });

  it('leaves the list unfiltered without a search, and the old orderNumber filter as it was', async () => {
    await adminOrderService.getAllOrders({ orderNumber: 'FN2026' });
    expect(whereOf()).toEqual({ orderNumber: { contains: 'FN2026', mode: 'insensitive' } });
    expect(getAdminOrdersQuerySchema.safeParse({ search: 'x'.repeat(101) }).success).toBe(false);
  });
});

describe('the kitchens and dishes lists', () => {
  it('pass the search and the kitchen from the URL', async () => {
    const sellers = jest.spyOn(adminService, 'getAllSellers').mockResolvedValue({} as any);
    const products = jest.spyOn(adminService, 'getProductsForModeration').mockResolvedValue({} as any);
    await getAllSellers({ query: { search: 'Saima', status: '' } } as unknown as Request, res());
    expect(sellers).toHaveBeenCalledWith(expect.objectContaining({ search: 'Saima', status: undefined }));
    await getProductsForModeration({ query: { search: 'kebab', sellerId: 's1' } } as unknown as Request, res());
    expect(products).toHaveBeenCalledWith(expect.objectContaining({ search: 'kebab', sellerId: 's1' }));
  });
});

describe('the support tickets list', () => {
  beforeEach(() => {
    db.supportTicket = { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) };
  });
  const argsOf = () => db.supportTicket.findMany.mock.calls[0][0];

  it('asks once for several statuses, oldest first, one page at a time', async () => {
    await supportService.adminGetTickets({ status: 'open,in_progress', sort: 'oldest', page: 2, limit: 20 });
    expect(argsOf().where).toEqual({ status: { in: ['open', 'in_progress'] } });
    expect(argsOf().orderBy).toEqual({ createdAt: 'asc' });
    expect(argsOf().skip).toBe(20);
    expect(db.supportTicket.count).toHaveBeenCalledWith({ where: { status: { in: ['open', 'in_progress'] } } });
  });

  it('keeps one status and newest first as before', async () => {
    await supportService.adminGetTickets({ status: 'resolved' });
    expect(argsOf().where).toEqual({ status: 'resolved' });
    expect(argsOf().orderBy).toEqual({ createdAt: 'desc' });
  });
});

describe('the audit log filter', () => {
  it('leaves out sign-ins and sign-outs only when asked', () => {
    expect(auditFilter({ hideSignIns: '1' })).toEqual({ NOT: { action: { in: ['auth:LOGIN', 'auth:LOGOUT'] } } });
    expect(auditFilter({})).toEqual({});
  });
});
