/**
 * The rider's delivery status machine: the statuses a job moves through, the order status each move
 * produces, and the conditions on the order that stop a move. Written before anyone changes the
 * rider or dispatch code, so a change to the machine shows up here first.
 */
import { canMoveDelivery, DELIVERY_TRANSITIONS, ORDER_STATUS_FOR_DELIVERY_STATUS, refuseDeliveryMove, DeliveryMoveOrder } from '../src/utils/deliveryStatus';

const ALL = ['pending', 'assigned', 'arrived_at_pickup', 'picked_up', 'in_transit', 'arrived_at_customer', 'delivered', 'delivery_failed', 'cancelled'];

/** An order the kitchen has ready and that is paid for: nothing stands in the way. */
const order = (over: Partial<DeliveryMoveOrder> = {}): DeliveryMoveOrder => ({ orderStatus: 'ready', paymentStatus: 'paid', paymentMethod: 'safepay', ...over });

describe('which status may follow which', () => {
  it('is exactly this table', () => {
    expect(DELIVERY_TRANSITIONS).toEqual({
      assigned: ['arrived_at_pickup', 'picked_up'],
      arrived_at_pickup: ['picked_up', 'in_transit', 'delivery_failed'],
      picked_up: ['in_transit', 'delivery_failed'],
      in_transit: ['arrived_at_customer', 'delivered', 'delivery_failed'],
      arrived_at_customer: ['delivered', 'delivery_failed'],
    });
  });

  it('answers for every pair of statuses, and never allows a move out of a final one', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const allowed = canMoveDelivery(from, to);
        expect(allowed).toBe(DELIVERY_TRANSITIONS[from]?.includes(to) ?? false);
        if (['pending', 'delivered', 'delivery_failed', 'cancelled'].includes(from)) expect(allowed).toBe(false);
      }
    }
  });

  it('only moves forward: no status can be reached again from one that follows it', () => {
    const rank: Record<string, number> = { assigned: 0, arrived_at_pickup: 1, picked_up: 2, in_transit: 3, arrived_at_customer: 4, delivered: 5, delivery_failed: 5 };
    for (const [from, targets] of Object.entries(DELIVERY_TRANSITIONS)) {
      for (const to of targets) expect(rank[to]).toBeGreaterThan(rank[from]);
    }
  });

  it('lets every running job end, as delivered or as failed', () => {
    const ends = (from: string, seen = new Set<string>()): Set<string> => {
      for (const to of DELIVERY_TRANSITIONS[from] ?? []) {
        if (seen.has(to)) continue;
        seen.add(to);
        ends(to, seen);
      }
      return seen;
    };
    for (const running of Object.keys(DELIVERY_TRANSITIONS)) {
      const reachable = ends(running);
      expect(reachable.has('delivered')).toBe(true);
      expect(reachable.has('delivery_failed')).toBe(true);
    }
    // a job that has not been picked up cannot be delivered or failed at once
    expect(canMoveDelivery('assigned', 'delivered')).toBe(false);
    expect(canMoveDelivery('assigned', 'delivery_failed')).toBe(false);
  });

  it('delivery is only completed from the road or the door', () => {
    const into = Object.entries(DELIVERY_TRANSITIONS).filter(([, to]) => to.includes('delivered')).map(([from]) => from);
    expect(into.sort()).toEqual(['arrived_at_customer', 'in_transit']);
  });
});

describe('what a move does to the order', () => {
  it('pushes the order forward only', () => {
    expect(ORDER_STATUS_FOR_DELIVERY_STATUS).toEqual({
      picked_up: 'dispatched',
      in_transit: 'in_transit',
      arrived_at_customer: 'in_transit',
      delivered: 'delivered',
      delivery_failed: 'delivery_failed',
    });
    // arriving at the kitchen says nothing about the food: it does not touch the order
    expect(ORDER_STATUS_FOR_DELIVERY_STATUS.arrived_at_pickup).toBeUndefined();
    expect(ORDER_STATUS_FOR_DELIVERY_STATUS.assigned).toBeUndefined();
  });

  it('only names statuses a rider can move to', () => {
    const targets = new Set(Object.values(DELIVERY_TRANSITIONS).flat());
    for (const status of Object.keys(ORDER_STATUS_FOR_DELIVERY_STATUS)) expect(targets.has(status)).toBe(true);
  });
});

describe('what must be true of the order', () => {
  it('lets a move through when the food is ready and paid for', () => {
    for (const [from, to] of [['assigned', 'picked_up'], ['arrived_at_pickup', 'picked_up'], ['picked_up', 'in_transit'], ['in_transit', 'delivered'], ['arrived_at_pickup', 'delivery_failed']]) {
      expect(refuseDeliveryMove(from, to, order())).toBeNull();
    }
  });

  it.each(['cancelled', 'refunded', 'completed'])('stops every move once the order is %s', (orderStatus) => {
    for (const [from, targets] of Object.entries(DELIVERY_TRANSITIONS)) {
      for (const to of targets) {
        expect(refuseDeliveryMove(from, to, order({ orderStatus }))).toMatchObject({ statusCode: 409, code: 'ORDER_ALREADY_TERMINAL' });
      }
    }
  });

  it.each(['refund_pending', 'refunded'])('stops every move while the payment is %s', (paymentStatus) => {
    expect(refuseDeliveryMove('in_transit', 'delivered', order({ paymentStatus }))).toMatchObject({ statusCode: 409, code: 'ORDER_ALREADY_TERMINAL' });
    expect(refuseDeliveryMove('arrived_at_pickup', 'delivery_failed', order({ paymentStatus }))).toMatchObject({ code: 'ORDER_ALREADY_TERMINAL' });
  });

  it('keeps the food in the kitchen until the kitchen says it is ready', () => {
    for (const orderStatus of ['pending', 'confirmed', 'preparing']) {
      expect(refuseDeliveryMove('assigned', 'picked_up', order({ orderStatus }))).toMatchObject({ statusCode: 409, code: 'FOOD_NOT_READY' });
      expect(refuseDeliveryMove('arrived_at_pickup', 'picked_up', order({ orderStatus }))).toMatchObject({ code: 'FOOD_NOT_READY' });
      expect(refuseDeliveryMove('arrived_at_pickup', 'in_transit', order({ orderStatus }))).toMatchObject({ code: 'FOOD_NOT_READY' });
    }
    for (const orderStatus of ['ready', 'dispatched', 'in_transit']) {
      expect(refuseDeliveryMove('arrived_at_pickup', 'picked_up', order({ orderStatus }))).toBeNull();
    }
  });

  it('a rider who already has the food is not held back by the kitchen again', () => {
    // picked up, then the order row says "preparing" (for example an admin edit): the food is in the rider's hands
    expect(refuseDeliveryMove('picked_up', 'in_transit', order({ orderStatus: 'preparing' }))).toBeNull();
  });

  it('lets the rider wait at a kitchen that is still cooking, but not give up on food that does not exist', () => {
    expect(refuseDeliveryMove('assigned', 'arrived_at_pickup', order({ orderStatus: 'preparing' }))).toBeNull();
    expect(refuseDeliveryMove('arrived_at_pickup', 'delivery_failed', order({ orderStatus: 'preparing' }))).toMatchObject({ statusCode: 409, code: 'FOOD_NOT_READY' });
    expect(refuseDeliveryMove('arrived_at_pickup', 'delivery_failed', order({ orderStatus: 'ready' }))).toBeNull();
    // once the food is on the road a delivery can fail whatever the order row says
    expect(refuseDeliveryMove('in_transit', 'delivery_failed', order({ orderStatus: 'preparing' }))).toBeNull();
  });

  it('releases food paid online or by transfer only once the payment is confirmed; cash needs no confirmation', () => {
    for (const paymentMethod of ['safepay', 'card', 'jazzcash', 'easypaisa', 'bank', 'wallet']) {
      for (const paymentStatus of ['pending', 'payment_submitted', 'disputed', 'failed']) {
        expect(refuseDeliveryMove('assigned', 'picked_up', order({ paymentMethod, paymentStatus }))).toMatchObject({ statusCode: 409, code: 'PAYMENT_NOT_CONFIRMED' });
      }
      expect(refuseDeliveryMove('assigned', 'picked_up', order({ paymentMethod, paymentStatus: 'paid' }))).toBeNull();
    }
    for (const paymentStatus of ['pending', 'paid']) {
      expect(refuseDeliveryMove('assigned', 'picked_up', order({ paymentMethod: 'cod', paymentStatus }))).toBeNull();
    }
  });

  it('checks the payment at pickup only, not on the road', () => {
    expect(refuseDeliveryMove('picked_up', 'in_transit', order({ paymentMethod: 'bank', paymentStatus: 'pending' }))).toBeNull();
    expect(refuseDeliveryMove('in_transit', 'delivered', order({ paymentMethod: 'bank', paymentStatus: 'pending' }))).toBeNull();
  });

  it('reports the order being final before the food not being ready', () => {
    expect(refuseDeliveryMove('assigned', 'picked_up', order({ orderStatus: 'cancelled' }))?.code).toBe('ORDER_ALREADY_TERMINAL');
  });
});
