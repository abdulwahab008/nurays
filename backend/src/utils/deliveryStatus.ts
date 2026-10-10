/**
 * A delivery job as a state machine: which status may follow which, what a move does to the order,
 * and what must be true of the order before the move. Pure, so every move can be tested without a
 * database (services/rider.service.ts applies it inside the transaction that holds the order row).
 *
 * Delivery.status lifecycle:
 *   pending (unclaimed) -> assigned (claimed) -> arrived_at_pickup -> picked_up -> in_transit
 *   -> arrived_at_customer -> delivered (with the customer's code).
 * A rider holding the goods can also report delivery_failed instead of completing (customer
 * unreachable, wrong address, refused delivery...); an admin resolves it from there.
 */

/** Statuses a rider can move a job to, by the status it is in now. A status with no entry is final for the rider. */
export const DELIVERY_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  assigned: ['arrived_at_pickup', 'picked_up'],
  arrived_at_pickup: ['picked_up', 'in_transit', 'delivery_failed'],
  picked_up: ['in_transit', 'delivery_failed'],
  in_transit: ['arrived_at_customer', 'delivered', 'delivery_failed'],
  arrived_at_customer: ['delivered', 'delivery_failed'],
};

/**
 * The order status a delivery status pushes the order to. Only forward: a rider arriving at the
 * kitchen says nothing about the food, so it does not move a ready order back to "preparing".
 */
export const ORDER_STATUS_FOR_DELIVERY_STATUS: Readonly<Record<string, string>> = {
  picked_up: 'dispatched',
  in_transit: 'in_transit',
  arrived_at_customer: 'in_transit',
  delivered: 'delivered',
  delivery_failed: 'delivery_failed',
};

export const canMoveDelivery = (from: string, to: string): boolean => DELIVERY_TRANSITIONS[from]?.includes(to) ?? false;

/** Order statuses from which the food has left, or may leave, the kitchen. */
const KITCHEN_READY_STATUSES = ['ready', 'dispatched', 'in_transit'];

export interface DeliveryMoveOrder {
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
}

export interface MoveRefusal {
  statusCode: number;
  code: string;
  message: string;
}

/**
 * Why a rider cannot make this move now, judged from the order; null when nothing stands in the way.
 * (That `to` follows `from` at all is canMoveDelivery's question.)
 */
export function refuseDeliveryMove(from: string, to: string, order: DeliveryMoveOrder): MoveRefusal | null {
  if (['cancelled', 'refunded', 'completed'].includes(order.orderStatus)) {
    return { statusCode: 409, code: 'ORDER_ALREADY_TERMINAL', message: `Order is already ${order.orderStatus}; delivery status can no longer be updated` };
  }
  if (['refund_pending', 'refunded'].includes(order.paymentStatus)) {
    return { statusCode: 409, code: 'ORDER_ALREADY_TERMINAL', message: `Order payment is ${order.paymentStatus}; delivery status can no longer be updated` };
  }
  const kitchenReady = KITCHEN_READY_STATUSES.includes(order.orderStatus);
  // The food leaves the kitchen only once the kitchen has marked it ready.
  if ((to === 'picked_up' || to === 'in_transit') && from !== 'picked_up' && !kitchenReady) {
    return { statusCode: 409, code: 'FOOD_NOT_READY', message: "The kitchen hasn't marked this order ready yet. Wait for it before picking it up." };
  }
  // A delivery can only fail once there is food to deliver: before that, a rider who cannot wait
  // hands the job back (release) and the kitchen keeps cooking for the next rider.
  if (to === 'delivery_failed' && from === 'arrived_at_pickup' && !kitchenReady) {
    return { statusCode: 409, code: 'FOOD_NOT_READY', message: "The kitchen hasn't marked this order ready yet. Hand the job back instead of failing it." };
  }
  // Food paid online or by transfer leaves the kitchen only once the payment is confirmed.
  if (to === 'picked_up' && order.paymentMethod !== 'cod' && order.paymentStatus !== 'paid') {
    return { statusCode: 409, code: 'PAYMENT_NOT_CONFIRMED', message: "The customer's payment hasn't been confirmed yet; wait for the kitchen to confirm it before pickup" };
  }
  return null;
}
