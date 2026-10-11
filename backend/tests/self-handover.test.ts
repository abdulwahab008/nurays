/**
 * A kitchen that hands an order over itself (it delivers, or the customer collects at its counter) sends it out and then hands
 * it over, and the customer's code is only looked at at the second step. A wrong code used to leave the order sent out (the
 * customer was told it had left the kitchen) with the handover refused. A refused handover changes nothing now: the items,
 * the order's rules and the code are all checked before the first step, and the code is counted once.
 *
 * The database and the single-item step are doubles; what is under test is the order in which the checks run and what moves.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/services/handover.service', () => ({
  ...jest.requireActual('../src/services/handover.service'),
  verifyHandoverCode: jest.fn(),
}));

import sellerOrderService, { SellerOrderService } from '../src/services/seller-order.service';
import { verifyHandoverCode } from '../src/services/handover.service';
import { AppError } from '../src/middleware/errorHandler';

const verify = verifyHandoverCode as jest.Mock;
const step = jest.spyOn(sellerOrderService, 'updateOrderItemStatus');

const wrongCode = () => new AppError("That code doesn't match. Ask the customer for the 4-digit code shown on their order screen.", 400, 'INVALID_DELIVERY_OTP');

/** The order as the rules see it: a cash order the kitchen delivers itself, unless said otherwise. */
const SELF_CASH = { deliveryType: 'home_delivery', deliveryProvider: 'self', deliveryFeeBreakdown: null, paymentMethod: 'cod', paymentStatus: 'pending' };

function kitchen(items: Array<{ id: string; status: string }>, order: Record<string, unknown> = {}, sellerProvider = 'self') {
  db.seller = { findUnique: jest.fn(async () => ({ id: 's1', userId: 'u1', deliveryProvider: sellerProvider })) };
  db.orderItem = { findMany: jest.fn(async () => items) };
  db.order = {
    findUniqueOrThrow: jest.fn(async ({ select }: any) => ('deliveryType' in select ? { ...SELF_CASH, ...order } : { id: 'o1', orderStatus: 'ready' })),
  };
}

const moves = () => step.mock.calls.map((c) => `${c[0]}:${c[2]}`);

beforeEach(() => {
  verify.mockReset().mockResolvedValue(undefined);
  step.mockReset().mockResolvedValue({} as any);
});

describe('handing an order over', () => {
  it('refuses a wrong code before the order is sent out, and counts it once', async () => {
    kitchen([{ id: 'i1', status: 'ready' }]);
    verify.mockRejectedValue(wrongCode());
    await expect(sellerOrderService.selfHandover('o1', 'u1', 'deliver', { handoverCode: '0000' })).rejects.toMatchObject({ code: 'INVALID_DELIVERY_OTP' });
    expect(moves()).toEqual([]);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('checks the code first, then sends out and hands over each item in turn', async () => {
    kitchen([{ id: 'i1', status: 'ready' }, { id: 'i2', status: 'ready' }]);
    await sellerOrderService.selfHandover('o1', 'u1', 'deliver', { handoverCode: '4821' });
    expect(moves()).toEqual(['i1:dispatched', 'i1:delivered', 'i2:dispatched', 'i2:delivered']);
    expect(step.mock.calls[1]).toEqual(['i1', 'u1', 'delivered', undefined, '4821']);
    expect(verify.mock.invocationCallOrder[0]).toBeLessThan(step.mock.invocationCallOrder[0]);
  });

  it('only hands over an item that is already out', async () => {
    kitchen([{ id: 'i1', status: 'dispatched' }, { id: 'i2', status: 'in_transit' }]);
    await sellerOrderService.selfHandover('o1', 'u1', 'deliver', { handoverCode: '4821' });
    expect(moves()).toEqual(['i1:delivered', 'i2:delivered']);
  });

  it('moves nothing, and counts no code, when one of the items is not ready yet', async () => {
    for (const action of ['dispatch', 'deliver', 'fail'] as const) {
      kitchen([{ id: 'i1', status: 'ready' }, { id: 'i2', status: 'preparing' }]);
      await expect(sellerOrderService.selfHandover('o1', 'u1', action, { handoverCode: '4821', reason: 'Nobody answered' })).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }
    expect(moves()).toEqual([]);
    expect(verify).not.toHaveBeenCalled();
  });

  it('does not let a kitchen use up the code of an order a Nuray rider delivers', async () => {
    kitchen([{ id: 'i1', status: 'ready' }], { deliveryProvider: 'platform' }, 'platform');
    for (let i = 0; i < 6; i++) {
      await expect(sellerOrderService.selfHandover('o1', 'u1', 'deliver', { handoverCode: '0000' })).rejects.toMatchObject({ statusCode: 403, code: 'PLATFORM_DELIVERY' });
    }
    expect(verify).not.toHaveBeenCalled();
    expect(moves()).toEqual([]);
  });

  it('lets a pickup counter hand over, whoever delivers for the kitchen', async () => {
    kitchen([{ id: 'i1', status: 'ready' }], { deliveryType: 'self_pickup', deliveryProvider: null }, 'platform');
    await sellerOrderService.selfHandover('o1', 'u1', 'deliver', { handoverCode: '4821' });
    expect(moves()).toEqual(['i1:dispatched', 'i1:delivered']);
  });

  it('stops at a payment that is not confirmed, before the code is looked at', async () => {
    kitchen([{ id: 'i1', status: 'ready' }], { paymentMethod: 'bank', paymentStatus: 'payment_submitted' });
    await expect(sellerOrderService.selfHandover('o1', 'u1', 'deliver', { handoverCode: '0000' })).rejects.toMatchObject({ statusCode: 409, code: 'PAYMENT_NOT_CONFIRMED' });
    expect(verify).not.toHaveBeenCalled();
    expect(moves()).toEqual([]);
  });

  it('does not deliver an order that was refunded, and does not count the code', async () => {
    kitchen([{ id: 'i1', status: 'dispatched' }], { paymentMethod: 'safepay', paymentStatus: 'refunded' });
    await expect(sellerOrderService.selfHandover('o1', 'u1', 'deliver', { handoverCode: '0000' })).rejects.toMatchObject({ code: 'ORDER_REFUNDED' });
    expect(verify).not.toHaveBeenCalled();
    expect(moves()).toEqual([]);
  });

  it('sends out only the items that are ready, and does nothing when all are already out', async () => {
    kitchen([{ id: 'i1', status: 'ready' }, { id: 'i2', status: 'dispatched' }]);
    await sellerOrderService.selfHandover('o1', 'u1', 'dispatch');
    expect(moves()).toEqual(['i1:dispatched']);
    step.mockClear();
    kitchen([{ id: 'i1', status: 'dispatched' }]);
    await expect(sellerOrderService.selfHandover('o1', 'u1', 'dispatch')).resolves.toMatchObject({ orderId: 'o1' });
    expect(moves()).toEqual([]);
  });

  it('needs a reason for a failed delivery before anything moves, and needs no code for it', async () => {
    kitchen([{ id: 'i1', status: 'ready' }]);
    for (const reason of [undefined, '', '  ', 'no']) {
      await expect(sellerOrderService.selfHandover('o1', 'u1', 'fail', { reason })).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    }
    expect(moves()).toEqual([]);
    await sellerOrderService.selfHandover('o1', 'u1', 'fail', { reason: '  Gate was locked  ' });
    expect(moves()).toEqual(['i1:dispatched', 'i1:delivery_failed']);
    expect(step.mock.calls[1][3]).toBe('Gate was locked');
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('one item at a time (the item route)', () => {
  // A fresh service: the one above has its single-item step replaced by the double.
  const single = new SellerOrderService();
  /** The item as the single-item step reads it, with its order. */
  function item(status: string, order: Record<string, unknown> = {}, sellerProvider = 'self') {
    db.seller = { findUnique: jest.fn(async () => ({ id: 's1', userId: 'u1', deliveryProvider: sellerProvider })) };
    db.orderItem = { findFirst: jest.fn(async () => ({ id: 'i1', orderId: 'o1', status, order: { ...SELF_CASH, ...order } })) };
    db.$transaction = jest.fn();
  }

  it('does not use up the code on an item that cannot take the step', async () => {
    item('preparing');
    await expect(single.updateOrderItemStatus('i1', 'u1', 'delivered', undefined, '0000')).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
    expect(verify).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does not use up the code of an order a Nuray rider delivers', async () => {
    item('dispatched', { deliveryProvider: 'platform' }, 'platform');
    await expect(single.updateOrderItemStatus('i1', 'u1', 'delivered', undefined, '0000')).rejects.toMatchObject({ code: 'PLATFORM_DELIVERY' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('refuses a wrong code on an item that is out, and writes nothing', async () => {
    item('dispatched');
    verify.mockRejectedValue(wrongCode());
    await expect(single.updateOrderItemStatus('i1', 'u1', 'delivered', undefined, '0000')).rejects.toMatchObject({ code: 'INVALID_DELIVERY_OTP' });
    expect(verify).toHaveBeenCalledWith('o1', '0000');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
