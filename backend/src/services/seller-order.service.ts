import { Prisma } from '@prisma/client';
import { codCollectorOf, deliveryProviderOf, isCashAtDoor, ONLINE_GATEWAY_METHODS } from '../utils/paymentCustody';
import { assertMayHandOver, verifyHandoverCode } from './handover.service';
import { presentFile } from '../storage';
import { cancelOpenDelivery, notifyDeliveryCancelled, CancelledDelivery } from './delivery-lifecycle.service';
import prisma from '../config/database';
import { pageArgs } from '../utils/pagination';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import riderService from './rider.service';
import { releasePromotionUsage } from './promotion.service';
import { logRefundIssued, refundForCancelledItems } from './refund.service';
import ledgerService from './ledger.service';
import { releaseHubAllocations } from './hub-allocation.service';
import { firstName, kitchenContactRule, kitchenOrderSelect, presentKitchenOrder, withoutDoor } from '../utils/kitchenOrderView';
import { logEvent, logger } from '../utils/logger';
import { selfDeliveryFeeFor, sellerPaidDeliveryFor } from '../utils/deliveryEarnings';
import { roundMoney } from '../utils/pricing';

// A card or Safepay checkout the customer hasn't finished is not the kitchen's to start: if it is never paid the food
// is wasted. Cash and bank-transfer orders are confirmed by the kitchen itself, so they can be accepted as before.
function assertOnlinePaymentDone(order: { paymentMethod: string; paymentStatus: string }) {
  if (ONLINE_GATEWAY_METHODS.includes(order.paymentMethod) && order.paymentStatus !== 'paid') {
    throw new AppError("The customer hasn't paid online yet. You'll get the order as soon as the payment comes in.", 409, 'PAYMENT_NOT_CONFIRMED');
  }
}

/**
 * Order items move forward through this pipeline only (or cancel before dispatch) — no skipping stages, no moving backward.
 */
const ITEM_TRANSITIONS: Record<string, string[]> = {
  // Cancelling is deliberately absent: it must restock inventory and keep the
  // parent order consistent, which only cancelOrderItem / rejectOrder do.
  pending: ['confirmed'],
  confirmed: ['preparing'],
  preparing: ['ready'],
  ready: ['dispatched'],
  // A rider (rider.service.ts) normally drives dispatched -> in_transit ->
  // delivered directly, but a seller must still be able to do this by hand
  // for orders with no rider assigned (e.g. self-delivery). A seller who
  // can't complete the delivery reports delivery_failed the same way a
  // rider does; admin resolves it (refund or retry) from there.
  dispatched: ['in_transit', 'delivered', 'delivery_failed'],
  in_transit: ['delivered', 'delivery_failed'],
  delivered: [],
  delivery_failed: [],
  cancelled: [],
};

/** The statuses behind each of the kitchen's order tabs. */
export const ORDER_VIEWS = {
  active: ['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit'],
  delivered: ['delivered', 'completed'],
  cancelled: ['cancelled', 'refunded', 'refund_pending', 'delivery_failed'],
} as const;
export type OrderView = keyof typeof ORDER_VIEWS;

type DeliveryShape = Parameters<typeof deliveryProviderOf>[0];

/** The kitchen hands this order over itself (self-delivery or customer pickup) rather than to a Nuray rider. */
function handsOverItself(order: DeliveryShape, kitchenProvider: string | null | undefined): boolean {
  return order.deliveryType === 'self_pickup' || deliveryProviderOf(order, kitchenProvider) === 'self';
}

/**
 * The order waits on the kitchen: to accept it, cook it, or hand it over itself. One rule for the dashboard's "orders need
 * you" and the orders list's Now count; an order ready for (or with) a Nuray rider waits on the rider, not the kitchen.
 */
export function needsKitchen(order: { orderStatus: string; sellerHandsOver: boolean }): boolean {
  if (['pending', 'confirmed', 'preparing'].includes(order.orderStatus)) return true;
  return order.sellerHandsOver && ['ready', 'dispatched', 'in_transit'].includes(order.orderStatus);
}

/** How long the kitchen's dishes on an order take: the slowest dish, its own time or the kitchen's, never under 15 minutes. */
function prepMinutesFor(prepTimes: Array<number | null | undefined>, kitchenMinutes: number | null | undefined): number {
  return Math.max(...prepTimes.map((min) => min || kitchenMinutes || 20), 15);
}

/** The rider on each order, as the kitchen sees them: a first name and how far the pickup has got. */
async function ridersFor(orderIds: string[]) {
  const deliveries = await prisma.delivery.findMany({
    where: { orderId: { in: orderIds }, status: { not: 'cancelled' } },
    select: { orderId: true, status: true, arrivedAtPickup: true, pickupTime: true, rider: { select: { userId: true } } },
  });
  const riderUserIds = deliveries.map((d) => d.rider?.userId).filter((id): id is string => !!id);
  const profiles = riderUserIds.length
    ? await prisma.userProfile.findMany({ where: { userId: { in: riderUserIds } }, select: { userId: true, fullName: true } })
    : [];
  const names = new Map(profiles.map((p) => [p.userId, firstName(p.fullName)]));
  return new Map(
    deliveries.map((d) => [
      d.orderId,
      {
        // null while Nuray is still finding a rider.
        name: d.rider ? names.get(d.rider.userId) ?? null : null,
        status: d.status,
        arrivedAtPickup: d.arrivedAtPickup,
        pickedUpAt: d.pickupTime,
      },
    ])
  );
}

export class SellerOrderService {
  /**
   * Get seller orders
   */
  async getSellerOrders(
    sellerId: string,
    filters: {
      page?: number;
      limit?: number;
      status?: string;
      orderStatus?: string;
      view?: OrderView;
      dateFrom?: string;
      dateTo?: string;
    }
  ) {
    // Get seller by userId
    const seller = await prisma.seller.findUnique({
      where: { userId: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    const { page, limit, skip } = pageArgs(filters.page, filters.limit);

    const where: Prisma.OrderItemWhereInput = { sellerId: seller.id };
    if (filters.status) where.status = filters.status;

    const statuses: readonly string[] | null = filters.orderStatus ? [filters.orderStatus] : filters.view ? ORDER_VIEWS[filters.view] : null;
    // created_at is a UTC timestamp without a zone; the bound is converted explicitly so the session time zone cannot shift it.
    const utc = (at: string) => Prisma.sql`(${new Date(at).toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
    const conditions = [
      statuses ? Prisma.sql`o.order_status IN (${Prisma.join(statuses)})` : null,
      filters.dateFrom ? Prisma.sql`o.created_at >= ${utc(filters.dateFrom)}` : null,
      filters.dateTo ? Prisma.sql`o.created_at <= ${utc(filters.dateTo)}` : null,
    ].filter((c): c is Prisma.Sql => c !== null);
    const pageFilter = conditions.length ? Prisma.join(conditions, ' AND ') : Prisma.sql`TRUE`;

    // The kitchen's orders are found from its own dishes (order_items by seller_id) and MATERIALIZED, so the planner cannot
    // turn this back into a semi-join that walks every order on the platform newest-first: that took ~2 s per load for a
    // small kitchen at 500k orders, and grew with the platform's order count rather than the kitchen's.
    const kitchenOrders = (itemStatus?: string) => Prisma.sql`
      WITH mine AS MATERIALIZED (
        SELECT DISTINCT order_id FROM order_items
        WHERE seller_id = ${seller.id}${itemStatus ? Prisma.sql` AND status = ${itemStatus}` : Prisma.empty}
      )`;

    // A page is a page of orders, not of dishes: paging the dishes split one order's dishes across pages and counted
    // dishes as orders. The orders come first, then all of this kitchen's matching dishes on them.
    const [pageOrders, byStatus, activeOrders] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string }>>`${kitchenOrders(filters.status)}
        SELECT o.id FROM mine JOIN orders o ON o.id = mine.order_id
        WHERE ${pageFilter}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT ${limit} OFFSET ${skip}`,
      // How many orders each tab holds, whatever tab is open.
      prisma.$queryRaw<Array<{ orderStatus: string; n: number }>>`${kitchenOrders()}
        SELECT o.order_status AS "orderStatus", COUNT(*)::int AS n FROM mine JOIN orders o ON o.id = mine.order_id
        GROUP BY o.order_status`,
      prisma.$queryRaw<Array<{ orderStatus: string; deliveryType: string; deliveryProvider: string | null; deliveryFeeBreakdown: Prisma.JsonValue }>>`${kitchenOrders()}
        SELECT o.order_status AS "orderStatus", o.delivery_type AS "deliveryType", o.delivery_provider AS "deliveryProvider",
               o.delivery_fee_breakdown AS "deliveryFeeBreakdown"
        FROM mine JOIN orders o ON o.id = mine.order_id
        WHERE o.order_status IN (${Prisma.join(ORDER_VIEWS.active)})`,
    ]);
    const countOf = (list: readonly string[]) => byStatus.filter((row) => list.includes(row.orderStatus)).reduce((sum, row) => sum + row.n, 0);
    // Filtered by status alone, the page's total is already in the per-status counts; dates or a dish status need a count.
    const total =
      filters.status || filters.dateFrom || filters.dateTo
        ? (
            await prisma.$queryRaw<Array<{ n: number }>>`${kitchenOrders(filters.status)}
              SELECT COUNT(*)::int AS n FROM mine JOIN orders o ON o.id = mine.order_id WHERE ${pageFilter}`
          )[0].n
        : statuses
          ? countOf(statuses)
          : byStatus.reduce((sum, row) => sum + row.n, 0);
    const pageOrderIds = pageOrders.map((o) => o.id);
    const riders = await ridersFor(pageOrderIds);

    const orderItems = await prisma.orderItem.findMany({
      where: { ...where, orderId: { in: pageOrderIds } },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            orderStatus: true,
            paymentStatus: true,
            paymentMethod: true,
            totalAmount: true,
            createdAt: true,
            estimatedDeliveryAt: true,
            deliveryInstructions: true,
            notes: true,
            cancellationReason: true,
            paymentReferenceNumber: true,
            paymentSenderName: true,
            paymentSenderAccount: true,
            paymentProofUrl: true,
            paymentNotes: true,
            paymentSubmittedAt: true,
            deliveryType: true,
            deliveryProvider: true,
            deliveryFeeBreakdown: true,
            deliveredAt: true,
            deliveryAddress: {
              select: {
                area: true,
                city: true,
                addressLine1: true,
                label: true,
              },
            },
            customer: {
              select: {
                phone: true,
                profile: { select: { fullName: true } },
              },
            },
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            preparationTime: true,
            images: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Group by order
    const orderMap = new Map();
    orderItems.forEach((item) => {
      if (!item.order) return;

      const orderId = item.order.id;
      if (!orderMap.has(orderId)) {
        // The phone and door only while the kitchen hands this order over itself (utils/kitchenOrderView.ts).
        const contactHidden = kitchenContactRule(item.order, seller.deliveryProvider);
        const fullName = item.order.customer?.profile?.fullName || null;
        orderMap.set(orderId, {
          order: {
            id: item.order.id,
            orderNumber: item.order.orderNumber,
            orderStatus: item.order.orderStatus,
            paymentStatus: item.order.paymentStatus,
            paymentMethod: item.order.paymentMethod,
            totalAmount: Number(item.order.totalAmount),
            createdAt: item.order.createdAt,
            estimatedDeliveryAt: item.order.estimatedDeliveryAt,
            deliveryInstructions: item.order.deliveryInstructions,
            notes: item.order.notes,
            cancellationReason: item.order.cancellationReason,
            paymentReferenceNumber: item.order.paymentReferenceNumber,
            paymentSenderName: item.order.paymentSenderName,
            paymentSenderAccount: item.order.paymentSenderAccount,
            paymentProofUrl: item.order.paymentProofUrl, // presented below
            paymentNotes: item.order.paymentNotes,
            paymentSubmittedAt: item.order.paymentSubmittedAt,
            deliveryType: item.order.deliveryType,
            // Who hands the order over: the kitchen itself (self-delivery or pickup) or a Nuray rider.
            sellerHandsOver: handsOverItself(item.order, seller.deliveryProvider),
            customerName: (contactHidden ? firstName(fullName) : fullName) || 'Customer',
            customerPhone: contactHidden ? null : item.order.customer?.phone,
            deliveryAddress: contactHidden ? withoutDoor(item.order.deliveryAddress) : item.order.deliveryAddress,
            contactHidden,
            rider: riders.get(orderId) ?? null,
            // What this kitchen's dishes cost the customer, and what the kitchen keeps of the order: the order total also holds
            // other kitchens' dishes, tax and the delivery fee, none of which reaches this kitchen.
            dishesTotal: 0,
            kitchenEarns: selfDeliveryFeeFor(item.order.deliveryFeeBreakdown, seller.id) - sellerPaidDeliveryFor(item.order.deliveryFeeBreakdown, seller.id),
          },
          items: [],
        });
      }
      const entry = orderMap.get(orderId);
      entry.order.dishesTotal = roundMoney(entry.order.dishesTotal + Number(item.totalPrice));
      entry.order.kitchenEarns = roundMoney(entry.order.kitchenEarns + Number(item.sellerPayout));

      orderMap.get(orderId).items.push({
        id: item.id,
        product: item.product
          ? {
              id: item.product.id,
              name: item.product.name,
              slug: item.product.slug,
              preparationTime: item.product.preparationTime ?? 20,
              image: item.product.images[0]?.imageUrl || null,
            }
          : null,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
        status: item.status,
        fulfillmentType: item.fulfillmentType,
      });
    });

    const orders = pageOrderIds.filter((id) => orderMap.has(id)).map((id) => orderMap.get(id));
    const readyIds = orders.filter((o) => o.order.orderStatus === 'ready').map((o) => o.order.id);
    const readyRows = readyIds.length
      ? await prisma.orderStatusHistory.findMany({
          where: { orderId: { in: readyIds }, status: 'ready' },
          orderBy: { createdAt: 'asc' },
          select: { orderId: true, createdAt: true },
        })
      : [];
    // The latest time each order was marked ready: how long the food has waited, not how old the order is.
    const readySince = new Map(readyRows.map((r) => [r.orderId, r.createdAt]));
    for (const o of orders) {
      o.order.needsKitchen = needsKitchen(o.order);
      o.order.readyAt = readySince.get(o.order.id) ?? null;
      o.order.suggestedPrepMinutes = prepMinutesFor(
        orderItems.filter((i) => i.orderId === o.order.id).map((i) => i.product?.preparationTime),
        seller.minPrepTimeMinutes
      );
    }
    // Payment receipts are private: this seller gets short-lived links to their orders' receipts.
    for (const o of orders) o.order.paymentProofUrl = await presentFile(o.order.paymentProofUrl);

    const counts = {
      active: countOf(ORDER_VIEWS.active),
      needYou: activeOrders.filter((o) => needsKitchen({ orderStatus: o.orderStatus, sellerHandsOver: handsOverItself(o, seller.deliveryProvider) })).length,
      new: countOf(['pending', 'confirmed']),
      delivered: countOf(ORDER_VIEWS.delivered),
      cancelled: countOf(ORDER_VIEWS.cancelled),
    };

    return {
      orders,
      counts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get seller order details: the kitchen's view of one order (see utils/kitchenOrderView.ts for what it holds).
   */
  async getSellerOrderDetails(orderId: string, sellerId: string) {
    // Get seller by userId
    const seller = await prisma.seller.findUnique({
      where: { userId: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    // Get the order with only this seller's items
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: kitchenOrderSelect(seller.id),
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    if (order.items.length === 0) {
      throw new AppError('No items found for this seller in this order', 404, 'NO_ITEMS_FOUND');
    }

    const view = presentKitchenOrder(order, {
      sellerId: seller.id,
      businessName: seller.businessName,
      businessNameUrdu: seller.businessNameUrdu,
      sellerDeliveryProvider: seller.deliveryProvider,
      // The receipt is private: the kitchen gets a short-lived link to it.
      paymentProofUrl: await presentFile(order.paymentProofUrl),
    });
    const [riders, dishes] = await Promise.all([
      ridersFor([orderId]),
      prisma.orderItem.findMany({ where: { orderId, sellerId: seller.id }, select: { product: { select: { preparationTime: true } } } }),
    ]);
    return {
      ...view,
      rider: riders.get(orderId) ?? null,
      // What "Ready in" starts at when the kitchen accepts: the time accepting without one would use.
      suggestedPrepMinutes: prepMinutesFor(dishes.map((d) => d.product?.preparationTime), seller.minPrepTimeMinutes),
    };
  }

  /**
   * Update order item status
   */
  async updateOrderItemStatus(
    orderItemId: string,
    sellerId: string,
    status: string,
    reason?: string,
    handoverCode?: string
  ) {
    // Get seller by userId
    const seller = await prisma.seller.findUnique({
      where: { userId: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    // Get order item
    const orderItem = await prisma.orderItem.findFirst({
      where: {
        id: orderItemId,
        sellerId: seller.id,
      },
      include: {
        order: true,
      },
    });

    if (!orderItem) {
      throw new AppError('Order item not found or access denied', 404, 'ORDER_ITEM_NOT_FOUND');
    }

    // Validate status transition
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit', 'delivered', 'delivery_failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      throw new AppError(`Invalid status: ${status}`, 400, 'INVALID_STATUS');
    }

    // Who may hand the order over, whether it was refunded, whether the payment is confirmed, and whether the item can take
    // this step at all come before the customer's code is looked at: a wrong code is counted against the order, so a request
    // that is refused anyway must not use up the attempts.
    assertMayHandOver(orderItem.order, seller.deliveryProvider, status);
    if (status === 'confirmed') assertOnlinePaymentDone(orderItem.order);
    if (!ITEM_TRANSITIONS[orderItem.status]?.includes(status)) {
      throw new AppError(
        `Cannot move an item from "${orderItem.status}" to "${status}"`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }
    // The customer's code proves the food actually reached them.
    if (status === 'delivered') {
      await verifyHandoverCode(orderItem.orderId, handoverCode);
    }

    // All DB writes happen inside a single transaction so partial failures
    // can't split item.status and order.orderStatus.
    const result = await prisma.$transaction(async (tx) => {
      // Lock the order row FIRST. Customer/admin cancels take the order lock and then touch the
      // items; taking item locks first here would deadlock against them (Postgres aborts one with
      // a 500). One lock order everywhere: order, then items.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderItem.orderId} FOR UPDATE`;

      // The status read before the lock may be stale: a cancel that won the lock has since cancelled the item, and
      // moving it on from there would revive it (and could later deliver a cancelled order with a ledger credit).
      const moved = await tx.orderItem.updateMany({
        where: { id: orderItemId, status: orderItem.status },
        data: { status },
      });
      if (moved.count === 0) {
        throw new AppError('This item changed while updating; please refresh', 409, 'ORDER_STATUS_CONFLICT');
      }
      const updatedItem = await tx.orderItem.findUniqueOrThrow({ where: { id: orderItemId } });

      const allItems = await tx.orderItem.findMany({
        where: { orderId: orderItem.orderId },
      });

      // Re-read the order's status inside the transaction — the copy fetched
      // before the transaction started can be stale if another concurrent
      // update on a sibling item already changed it.
      const currentOrder = await tx.order.findUnique({
        where: { id: orderItem.orderId },
        select: { orderStatus: true },
      });
      const currentOrderStatus = currentOrder?.orderStatus;

      let derivedOrderStatus: string | null = null;
      let historyNote = '';

      const allReady = allItems.every((i) => i.status === 'ready');
      const allPreparing = allItems.every((i) => i.status === 'preparing');

      const allDelivered = allItems.every((i) => i.status === 'delivered' || i.status === 'cancelled');
      const anyFailed = allItems.some((i) => i.status === 'delivery_failed');

      if (allReady && (currentOrderStatus === 'confirmed' || currentOrderStatus === 'preparing')) {
        derivedOrderStatus = 'ready';
        historyNote = 'All items ready for dispatch';
      } else if (allPreparing && currentOrderStatus === 'pending') {
        derivedOrderStatus = 'preparing';
        historyNote = 'Order preparation started';
      } else if (status === 'confirmed' && currentOrderStatus === 'pending') {
        derivedOrderStatus = 'confirmed';
        historyNote = 'Order confirmed by seller';
      } else if (
        status === 'dispatched' &&
        allItems.every((i) => i.status === 'dispatched' || i.status === 'cancelled') &&
        currentOrderStatus === 'ready'
      ) {
        derivedOrderStatus = 'dispatched';
        historyNote = 'Out for delivery with the kitchen';
      } else if (status === 'delivery_failed' && anyFailed && currentOrderStatus !== 'delivery_failed') {
        derivedOrderStatus = 'delivery_failed';
        historyNote = `Seller reported a failed self-delivery: ${reason}`;
      } else if (status === 'delivered' && allDelivered && currentOrderStatus !== 'delivered') {
        derivedOrderStatus = 'delivered';
        historyNote = 'Self-delivered by seller';
      }

      if (currentOrderStatus === 'cancelled' || currentOrderStatus === 'refunded') {
        derivedOrderStatus = null;
      }

      if (derivedOrderStatus) {
        // COD payment is collected at the door — delivered IS the payment
        // confirmation for COD (online payments are already 'paid' via the
        // gateway verification flow well before delivery).
        const isCodPayment = derivedOrderStatus === 'delivered' && isCashAtDoor(orderItem.order);

        // Guard the write on the order still being in the exact state we
        // derived from — if a concurrent transaction on another item already
        // moved it, this becomes a no-op instead of re-applying/duplicating
        // the same transition.
        const applied = await tx.order.updateMany({
          where: { id: orderItem.orderId, orderStatus: currentOrderStatus },
          data: {
            orderStatus: derivedOrderStatus,
            ...(derivedOrderStatus === 'delivered' ? { deliveredAt: new Date() } : {}),
            ...(isCodPayment ? { paymentStatus: 'paid', paymentCollectedBy: codCollectorOf(orderItem.order), paidAt: new Date() } : {}),
          },
        });
        if (applied.count > 0) {
          await tx.orderStatusHistory.create({
            data: {
              orderId: orderItem.orderId,
              status: derivedOrderStatus,
              notes: historyNote,
              changedBy: sellerId,
            },
          });
        } else {
          derivedOrderStatus = null;
        }
      }

      return { updatedItem, derivedOrderStatus };
    });

    if (result.derivedOrderStatus) {
      logEvent(result.derivedOrderStatus === 'confirmed' ? 'order.accepted' : result.derivedOrderStatus === 'dispatched' ? 'order.picked_up' : `order.${result.derivedOrderStatus}`, {
        orderId: orderItem.orderId,
        orderNumber: orderItem.order.orderNumber,
        sellerId: seller.id,
        actor: 'seller',
        orderItemId,
      });
    }

    // A seller-completed delivery (self-delivery) never passes through the rider
    // flow that posts the ledger, so post it here (idempotent).
    if (result.derivedOrderStatus === 'delivered') {
      try {
        await ledgerService.recordOrderCompletion(orderItem.orderId);
      } catch (ledgerErr) {
        logger.error({ err: ledgerErr, orderId: orderItem.orderId }, 'Failed to record ledger entries');
      }
    }

    // Emit real-time events only after the transaction commits.
    if (result.derivedOrderStatus) {
      await realtimeOrderService.emitOrderStatusUpdate(
        orderItem.orderId,
        result.derivedOrderStatus,
        sellerId,
      );
      // Predictive JIT lookahead dispatch:
      // Post delivery jobs into the rider network when cooking starts ('confirmed' / 'preparing'),
      // so riders travel to the kitchen in parallel and arrive just as food is ready.
      if (['confirmed', 'preparing', 'ready'].includes(result.derivedOrderStatus)) {
        const prepMins = seller.minPrepTimeMinutes ?? 25;
        await riderService.ensureDeliveryForOrder(orderItem.orderId, prepMins);
      }
    }
    await realtimeOrderService.emitOrderItemStatusUpdate(orderItemId, status, seller.id);

    return result.updatedItem;
  }

  /**
   * Cancel order item (seller can cancel their items)
   */
  async cancelOrderItem(orderItemId: string, sellerId: string, _reason: string) {
    // Get seller by userId
    const seller = await prisma.seller.findUnique({
      where: { userId: sellerId },
    });

    if (!seller) {
      throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    }

    // Get order item
    const orderItem = await prisma.orderItem.findFirst({
      where: {
        id: orderItemId,
        sellerId: seller.id,
      },
      include: {
        order: true,
        product: true,
      },
    });

    if (!orderItem) {
      throw new AppError('Order item not found or access denied', 404, 'ORDER_ITEM_NOT_FOUND');
    }

    // Check if can be cancelled
    const cancellableStatuses = ['pending', 'confirmed', 'preparing'];
    if (!cancellableStatuses.includes(orderItem.status)) {
      throw new AppError(
        `Order item cannot be cancelled. Current status: ${orderItem.status}`,
        400,
        'ORDER_ITEM_NOT_CANCELLABLE'
      );
    }

    // All writes + the "are all items cancelled now?" check happen inside a
    // single transaction so we can't observe an intermediate state where one
    // item is cancelled but the parent order isn't yet.
    const result = await prisma.$transaction(async (tx) => {
      // Lock the order row FIRST. Customer/admin cancels take the order lock and then touch the
      // items; taking item locks first here would deadlock against them (Postgres aborts one with
      // a 500). One lock order everywhere: order, then items.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderItem.orderId} FOR UPDATE`;

      // Guarded on the item still being cancellable: two concurrent cancels (or a
      // cancel racing a status change) must not both restock the same item.
      const claimed = await tx.orderItem.updateMany({
        where: { id: orderItemId, status: { in: cancellableStatuses } },
        data: { status: 'cancelled' },
      });
      if (claimed.count === 0) {
        throw new AppError('Order item can no longer be cancelled', 409, 'ORDER_ITEM_NOT_CANCELLABLE');
      }
      const updatedItem = await tx.orderItem.findUniqueOrThrow({ where: { id: orderItemId } });

      // A variant item drew from its own stock pool at order time (see
      // order.service.ts createOrder), so restore it there, not on the
      // shared product-level stock it never touched.
      if (orderItem.variantId) {
        await tx.productVariant.update({
          where: { id: orderItem.variantId },
          data: { stockQuantity: { increment: orderItem.quantity } },
        });
      }
      if (orderItem.productId) {
        await tx.product.update({
          where: { id: orderItem.productId },
          data: {
            ...(orderItem.variantId ? {} : { stockQuantity: { increment: orderItem.quantity } }),
            totalOrders: { decrement: 1 },
          },
        });
      }

      const remaining = await tx.orderItem.findMany({
        where: { orderId: orderItem.orderId },
        select: { status: true },
      });
      const allCancelled = remaining.every((i) => i.status === 'cancelled');

      if (orderItem.productId) {
        await releaseHubAllocations(tx, orderItem.orderId, {
          orderItemIds: [orderItem.id],
          productIds: [orderItem.productId],
          reason: `Item cancelled by seller (${orderItem.productName})`,
          performedBy: sellerId,
        });
      }

      // The customer paid for this item: refund its share (or everything left if
      // this was the last live item and the whole order is now cancelled).
      const refund = await refundForCancelledItems(tx, orderItem.orderId, [orderItemId], {
        reason: `Item cancelled by seller (${orderItem.productName})`,
        createdBy: sellerId,
        orderFullyCancelled: allCancelled,
      });

      let cancelledDelivery: CancelledDelivery | null = null;
      if (allCancelled) {
        await tx.order.update({
          where: { id: orderItem.orderId },
          data: { orderStatus: 'cancelled' },
        });
        await releasePromotionUsage(tx, orderItem.orderId);
        cancelledDelivery = await cancelOpenDelivery(tx, orderItem.orderId, 'All items cancelled by the kitchen');
        await tx.orderStatusHistory.create({
          data: {
            orderId: orderItem.orderId,
            status: 'cancelled',
            notes: 'All items cancelled by seller',
            changedBy: sellerId,
          },
        });
      }

      return { updatedItem, allCancelled, cancelledDelivery, refund };
    });

    logEvent(result.allCancelled ? 'order.cancelled' : 'order.item_cancelled', {
      orderId: orderItem.orderId,
      orderNumber: orderItem.order.orderNumber,
      sellerId: seller.id,
      actor: 'seller',
      orderItemId,
    });
    logRefundIssued(result.refund, { orderId: orderItem.orderId, orderNumber: orderItem.order.orderNumber, sellerId: seller.id, actor: 'seller' });
    if (result.allCancelled) {
      await realtimeOrderService.emitOrderStatusUpdate(orderItem.orderId, 'cancelled', sellerId);
      notifyDeliveryCancelled(result.cancelledDelivery);
    }
    await realtimeOrderService.emitOrderItemStatusUpdate(orderItemId, 'cancelled', seller.id);

    return {
      orderItemId: result.updatedItem.id,
      status: result.updatedItem.status,
      message: 'Order item cancelled successfully',
    };
  }

  /**
   * Accept an entire order (Section 7: Order Placed -> Accepted -> Preparing)
   */
  /** `preparationMinutes`, when the kitchen chose one on accepting, replaces the time worked out from its dishes. */
  async acceptOrder(orderId: string, sellerUserId: string, preparationMinutes?: number) {
    let seller = await prisma.seller.findUnique({
      where: { userId: sellerUserId },
    });
    if (!seller) {
      const user = await prisma.user.findUnique({ where: { id: sellerUserId } });
      if (user?.userType === 'admin') {
        const orderItem = await prisma.orderItem.findFirst({
          where: { orderId },
          include: { seller: true },
        });
        if (orderItem?.seller) {
          seller = orderItem.seller;
        }
      }
    }
    if (!seller) throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          where: { sellerId: seller.id },
          include: { product: true },
        },
      },
    });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    if (order.items.length === 0) throw new AppError('No items found for this seller', 403, 'FORBIDDEN');

    // If order was already accepted or ready, return gracefully
    if (['preparing', 'ready'].includes(order.orderStatus)) {
      return {
        orderId: order.id,
        orderStatus: order.orderStatus,
        message: `Order is already ${order.orderStatus}`,
      };
    }

    if (!['pending', 'confirmed'].includes(order.orderStatus)) {
      throw new AppError(`Cannot accept order with status: ${order.orderStatus}`, 400, 'INVALID_STATUS');
    }
    assertOnlinePaymentDone(order);

    // Determine prep time from items or seller default
    const maxPrepMinutes = preparationMinutes ?? prepMinutesFor(order.items.map((i) => i.product?.preparationTime), seller.minPrepTimeMinutes);
    const estimatedReadyAt = new Date(Date.now() + maxPrepMinutes * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      // Claim the transition first. The status check above ran before this
      // transaction, so a customer cancelling at the same instant must not be
      // overwritten (that revived a cancelled order whose stock was returned).
      const claimed = await tx.order.updateMany({
        where: { id: order.id, orderStatus: { in: ['pending', 'confirmed'] } },
        data: {
          orderStatus: 'preparing',
          estimatedDeliveryAt: estimatedReadyAt,
        },
      });
      if (claimed.count === 0) {
        throw new AppError('Order status changed; it can no longer be accepted', 409, 'ORDER_STATUS_CONFLICT');
      }

      // Advance this seller's live items to preparing (never revive cancelled ones)
      await tx.orderItem.updateMany({
        where: { orderId: order.id, sellerId: seller.id, status: { notIn: ['cancelled', 'delivered'] } },
        data: { status: 'preparing' },
      });
      const updatedOrder = await tx.order.findUniqueOrThrow({ where: { id: order.id } });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: 'preparing',
          notes: `Order accepted by kitchen. Estimated preparation time: ${maxPrepMinutes} min.`,
          changedBy: sellerUserId,
        },
      });

      return updatedOrder;
    });

    logEvent('order.accepted', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      sellerId: seller.id,
      actor: seller.userId === sellerUserId ? 'seller' : 'admin',
      preparationMinutes: maxPrepMinutes,
    });

    // JIT rider dispatch lookahead
    try {
      await riderService.ensureDeliveryForOrder(order.id, maxPrepMinutes);
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'Rider dispatch warning during acceptOrder');
    }

    await realtimeOrderService.emitOrderStatusUpdate(order.id, 'preparing', sellerUserId);

    return {
      orderId: result.id,
      orderStatus: result.orderStatus,
      estimatedReadyAt,
      preparationMinutes: maxPrepMinutes,
      message: 'Order accepted and kitchen preparation started',
    };
  }

  /**
   * Reject an entire order (Section 7: Seller selects reason, restocks, customer notified)
   */
  async rejectOrder(orderId: string, sellerUserId: string, reason: string) {
    let seller = await prisma.seller.findUnique({
      where: { userId: sellerUserId },
    });
    if (!seller) {
      const user = await prisma.user.findUnique({ where: { id: sellerUserId } });
      if (user?.userType === 'admin') {
        const orderItem = await prisma.orderItem.findFirst({
          where: { orderId },
          include: { seller: true },
        });
        if (orderItem?.seller) {
          seller = orderItem.seller;
        }
      }
    }
    if (!seller) throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          where: { sellerId: seller.id },
          include: { product: true },
        },
      },
    });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    if (order.items.length === 0) throw new AppError('No items found for this seller', 403, 'FORBIDDEN');

    // Allow reject/cancel before actual rider pickup / in-transit delivery
    if (!['pending', 'confirmed', 'preparing', 'ready'].includes(order.orderStatus)) {
      throw new AppError(`Cannot reject order with status: ${order.orderStatus}. Only orders before rider dispatch can be declined.`, 400, 'INVALID_STATUS');
    }

    const rejectionNote = reason?.trim() || 'Kitchen unavailable';

    const outcome = await prisma.$transaction(async (tx) => {
      // Lock the order row FIRST. Customer/admin cancels take the order lock and then touch the
      // items; taking item locks first here would deadlock against them (Postgres aborts one with
      // a 500). One lock order everywhere: order, then items.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;

      // Only this seller's still-live items are rejected and restocked — items
      // already cancelled were restocked when that happened. Read before the update.
      const liveItems = await tx.orderItem.findMany({
        where: { orderId: order.id, sellerId: seller.id, status: { notIn: ['cancelled', 'delivered'] } },
      });
      if (liveItems.length === 0) {
        throw new AppError('There is nothing left to reject on this order', 409, 'ORDER_STATUS_CONFLICT');
      }

      // Guard against a concurrent cancel/accept: the status check above ran
      // outside this transaction.
      const stillRejectable = await tx.order.count({
        where: { id: order.id, orderStatus: { in: ['pending', 'confirmed', 'preparing', 'ready'] } },
      });
      if (stillRejectable === 0) {
        throw new AppError('Order status changed; it can no longer be rejected', 409, 'ORDER_STATUS_CONFLICT');
      }

      await tx.orderItem.updateMany({
        where: { id: { in: liveItems.map((i) => i.id) } },
        data: { status: 'cancelled' },
      });

      // Restock products
      for (const item of liveItems) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              ...(item.variantId ? {} : { stockQuantity: { increment: item.quantity } }),
              totalOrders: { decrement: 1 },
            },
          });
        }
      }

      // Hub units for the rejected items go back into their batches.
      await releaseHubAllocations(tx, order.id, {
        orderItemIds: liveItems.map((i) => i.id),
        productIds: liveItems.map((i) => i.productId).filter((id): id is string => !!id),
        reason: `Rejected by ${seller.businessName}`,
        performedBy: sellerUserId,
      });

      // In a multi-seller order, one kitchen rejecting its items must not cancel
      // the other kitchens' items: the order is cancelled only once nothing is left.
      const stillLive = await tx.orderItem.count({
        where: { orderId: order.id, status: { notIn: ['cancelled'] } },
      });
      const allGone = stillLive === 0;
      let cancelledDelivery: CancelledDelivery | null = null;

      if (allGone) {
        cancelledDelivery = await cancelOpenDelivery(tx, order.id, `Rejected by kitchen: ${rejectionNote}`);
        await tx.order.updateMany({
          where: { id: order.id, orderStatus: { in: ['pending', 'confirmed', 'preparing', 'ready'] } },
          data: {
            orderStatus: 'cancelled',
            cancellationReason: `Rejected by kitchen: ${rejectionNote}`,
            cancelledBy: 'seller',
          },
        });
        await releasePromotionUsage(tx, order.id);
      }

      // The customer paid for these items: give it back (their share if other
      // kitchens' items remain, everything if the whole order is now cancelled).
      const refund = await refundForCancelledItems(tx, order.id, liveItems.map((i) => i.id), {
        reason: `Rejected by ${seller.businessName}: ${rejectionNote}`,
        createdBy: sellerUserId,
        orderFullyCancelled: allGone,
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: allGone ? 'cancelled' : order.orderStatus,
          notes: allGone
            ? `Order rejected by kitchen: ${rejectionNote}`
            : `${seller.businessName} rejected its items: ${rejectionNote}`,
          changedBy: sellerUserId,
        },
      });

      return { allGone, cancelledDelivery, refund };
    });

    logEvent('order.rejected', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      sellerId: seller.id,
      actor: seller.userId === sellerUserId ? 'seller' : 'admin',
      orderCancelled: outcome.allGone,
    });
    logRefundIssued(outcome.refund, { orderId: order.id, orderNumber: order.orderNumber, sellerId: seller.id, actor: seller.userId === sellerUserId ? 'seller' : 'admin' });
    if (outcome.allGone) {
      await realtimeOrderService.emitOrderStatusUpdate(order.id, 'cancelled', sellerUserId);
      notifyDeliveryCancelled(outcome.cancelledDelivery);
    }
    const fullyCancelled = outcome.allGone;

    return {
      orderId: order.id,
      orderStatus: fullyCancelled ? 'cancelled' : order.orderStatus,
      reason: rejectionNote,
      message: fullyCancelled
        ? 'Order rejected successfully and customer notified'
        : 'Your items were rejected; the other kitchens on this order are unaffected',
    };
  }

  /**
   * A kitchen that delivers the order itself (or hands it over at its counter) moves it
   * forward as a whole: out for delivery, delivered (with the customer's code) or
   * delivery failed. Each step runs the same guarded per-item transition as the item
   * endpoint, so all the rules (who may hand over, payment confirmed, the code) apply.
   *
   * A handover that is refused changes nothing. Going out and being handed over are separate steps on each item, so a
   * refusal halfway used to leave the order out for delivery (the customer was told it had left the kitchen) with the
   * handover still refused. So everything is checked before the first step: that every item can take the whole path, the
   * rules for the order, and the customer's code, which is counted once.
   */
  async selfHandover(
    orderId: string,
    sellerUserId: string,
    action: 'dispatch' | 'deliver' | 'fail',
    opts: { handoverCode?: string; reason?: string } = {}
  ) {
    const seller = await prisma.seller.findUnique({ where: { userId: sellerUserId } });
    if (!seller) throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');
    const items = await prisma.orderItem.findMany({
      where: { orderId, sellerId: seller.id, status: { notIn: ['cancelled', 'delivered'] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, status: true },
    });
    if (items.length === 0) throw new AppError('No open items of yours on this order', 404, 'ORDER_NOT_FOUND');
    const reason = opts.reason?.trim() ?? '';
    if (action === 'fail' && reason.length < 3) throw new AppError('Say why the delivery failed', 400, 'REASON_REQUIRED');

    const target = action === 'dispatch' ? 'dispatched' : action === 'deliver' ? 'delivered' : 'delivery_failed';
    // An item that is ready goes out first, then takes the final step; one already out takes the final step.
    const alreadyOut = (status: string) => status === 'dispatched' || status === 'in_transit';
    for (const item of items) {
      if (action === 'dispatch' && alreadyOut(item.status)) continue;
      const path = item.status === 'ready' && action !== 'dispatch' ? ['dispatched', target] : [target];
      let at = item.status;
      for (const step of path) {
        if (!ITEM_TRANSITIONS[at]?.includes(step)) {
          throw action === 'dispatch'
            ? new AppError('Mark the order ready before sending it out', 400, 'INVALID_STATUS_TRANSITION')
            : new AppError(`Cannot move an item from "${at}" to "${step}"`, 400, 'INVALID_STATUS_TRANSITION');
        }
        at = step;
      }
    }

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { deliveryType: true, deliveryProvider: true, deliveryFeeBreakdown: true, paymentMethod: true, paymentStatus: true },
    });
    if (items.some((item) => item.status === 'ready')) assertMayHandOver(order, seller.deliveryProvider, 'dispatched');
    if (action !== 'dispatch') assertMayHandOver(order, seller.deliveryProvider, target);
    if (action === 'deliver') await verifyHandoverCode(orderId, opts.handoverCode);

    for (const item of items) {
      if (item.status === 'ready') await this.updateOrderItemStatus(item.id, sellerUserId, 'dispatched');
      if (action === 'deliver') await this.updateOrderItemStatus(item.id, sellerUserId, 'delivered', undefined, opts.handoverCode);
      else if (action === 'fail') await this.updateOrderItemStatus(item.id, sellerUserId, 'delivery_failed', reason);
    }
    const current = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { id: true, orderStatus: true } });
    return { orderId: current.id, orderStatus: current.orderStatus };
  }

  /**
   * Mark food ready for pickup (Section 10: Preparing -> Ready for Pickup)
   */
  async markOrderReady(orderId: string, sellerUserId: string) {
    let seller = await prisma.seller.findUnique({
      where: { userId: sellerUserId },
    });
    if (!seller) {
      const user = await prisma.user.findUnique({ where: { id: sellerUserId } });
      if (user?.userType === 'admin') {
        const orderItem = await prisma.orderItem.findFirst({
          where: { orderId },
          include: { seller: true },
        });
        if (orderItem?.seller) {
          seller = orderItem.seller;
        }
      }
    }
    if (!seller) throw new AppError('Seller not found', 404, 'SELLER_NOT_FOUND');

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          where: { sellerId: seller.id },
        },
      },
    });
    if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    if (order.items.length === 0) throw new AppError('No items found for this seller', 403, 'FORBIDDEN');

    if (order.orderStatus === 'ready') {
      return {
        orderId: order.id,
        orderStatus: 'ready',
        message: 'Order is already marked ready for pickup',
      };
    }

    if (!['confirmed', 'preparing'].includes(order.orderStatus)) {
      throw new AppError(`Cannot mark ready an order with status: ${order.orderStatus}`, 400, 'INVALID_STATUS');
    }
    // Online and transfer payments must be confirmed before the food is handed over.
    if (order.paymentMethod !== 'cod' && order.paymentStatus !== 'paid') {
      throw new AppError(
        "The customer's payment hasn't been confirmed yet. Confirm (or dispute) the transfer before marking the order ready.",
        409,
        'PAYMENT_NOT_CONFIRMED'
      );
    }

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, orderStatus: { in: ['confirmed', 'preparing'] } },
        data: { orderStatus: 'ready' },
      });
      if (claimed.count === 0) {
        throw new AppError('Order status changed; it can no longer be marked ready', 409, 'ORDER_STATUS_CONFLICT');
      }

      await tx.orderItem.updateMany({
        where: { orderId: order.id, sellerId: seller.id, status: { notIn: ['cancelled', 'delivered'] } },
        data: { status: 'ready' },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: 'ready',
          notes: 'Food is prepared and ready for pickup by delivery rider.',
          changedBy: sellerUserId,
        },
      });
    });

    logEvent('order.ready', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      sellerId: seller.id,
      actor: seller.userId === sellerUserId ? 'seller' : 'admin',
    });

    // Make sure a rider job exists (idempotent). Accepting normally creates it, but if that
    // failed, a ready order with no job could never be picked up.
    try {
      await riderService.ensureDeliveryForOrder(order.id, 0);
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'Rider dispatch warning during markOrderReady');
    }

    await realtimeOrderService.emitOrderStatusUpdate(order.id, 'ready', sellerUserId);

    return {
      orderId: order.id,
      orderStatus: 'ready',
      message: 'Order is ready for pickup. Rider alerted.',
    };
  }
}

export default new SellerOrderService();

