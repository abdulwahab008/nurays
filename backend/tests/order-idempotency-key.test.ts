/**
 * Placing an order needs an Idempotency-Key: without one a double submit or a retry over a
 * bad network places the order twice. The order service is a double.
 */
jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));

import type { Request, Response } from 'express';
import orderService from '../src/services/order.service';
import { createOrder } from '../src/controllers/order.controller';

const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() }) as unknown as Response;
const body = { items: [{ productId: 'p1', quantity: 1 }], deliveryType: 'self_pickup', paymentMethod: 'cod' };
const req = (headers: Record<string, string>) =>
  ({ user: { userId: 'c1' }, body, get: (name: string) => headers[name.toLowerCase()] }) as unknown as Request;

describe('POST /orders idempotency key', () => {
  let place: jest.SpyInstance;
  beforeEach(() => {
    place = jest.spyOn(orderService, 'createOrder').mockResolvedValue({
      id: 'o1', orderNumber: 'FN20261107000001', totalAmount: 100, paymentMethod: 'cod', paymentStatus: 'pending', orderStatus: 'pending', items: [],
    } as unknown as Awaited<ReturnType<typeof orderService.createOrder>>);
  });
  afterEach(() => place.mockRestore());

  it('refuses an order without the header, before anything is placed', async () => {
    await expect(createOrder(req({}), res())).rejects.toMatchObject({ statusCode: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' });
    await expect(createOrder(req({ 'idempotency-key': '' }), res())).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(place).not.toHaveBeenCalled();
  });

  it('refuses a malformed key', async () => {
    await expect(createOrder(req({ 'idempotency-key': 'short' }), res())).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_IDEMPOTENCY_KEY' });
    expect(place).not.toHaveBeenCalled();
  });

  it('places the order with the key it was given', async () => {
    const r = res();
    await createOrder(req({ 'idempotency-key': '6f1c2a90-1b7e-4c1e-9d55-0d3f5a8b2c11' }), r);
    expect(place).toHaveBeenCalledWith('c1', body, { idempotencyKey: '6f1c2a90-1b7e-4c1e-9d55-0d3f5a8b2c11' });
    expect(r.status).toHaveBeenCalledWith(201);
  });
});
