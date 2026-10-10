import prisma from '../config/database';
import { pageArgs } from '../utils/pagination';
import { ACTIVE_DELIVERY_STATUSES, ON_THE_WAY_STATUSES } from '../utils/deliveryStatus';
import { AppError } from '../middleware/errorHandler';
import { presentFile } from '../storage';
import { haversineKm } from '../utils/deliveryFee';
import { addressAsOrdered } from '../utils/addressSnapshot';
import sellerOrderService from './seller-order.service';

// Once the food has left the kitchen, the customer can see where the rider is.

/**
 * What a party to an order sees of its delivery. The rider's pay is between the rider and
 * the platform. The rider's position is shown only while the food is on its way (never
 * afterwards), and only to the customer, the rider and admins.
 */

/**
 * The order as the rider carrying it may see it: payment-submission details and internal keys
 * removed. The customer's door (address, pin, instructions) is theirs only while the job is
 * running; once it is delivered, failed or cancelled the rider keeps the area and city only,
 * the same as the rider endpoints.
 */
function stripForRider<T extends Record<string, unknown>>(order: T, jobRunning: boolean): T {
  const {
    paymentReferenceNumber: _r, paymentSenderName: _n, paymentSenderAccount: _a, paymentNotes: _p, paymentDisputeReason: _d,
    paymentTransactionId: _t, paymentConfirmedBy: _c, paymentSubmittedAt: _s, paymentConfirmedAt: _ca, idempotencyKey: _k,
    deliveryFeeBreakdown: _f, sellerDeliveryCharge: _sc, ...rest
  } = order as Record<string, unknown>;
  const address = rest.deliveryAddress as Record<string, unknown> | null | undefined;
  const snapshot = rest.deliveryAddressSnapshot as Record<string, unknown> | null | undefined;
  if (!jobRunning) {
    const areaOnly = (src: Record<string, unknown> | null | undefined) =>
      src && typeof src === 'object' ? { area: src.area ?? null, city: src.city ?? null } : null;
    rest.deliveryAddress = areaOnly(addressAsOrdered(snapshot, address));
    rest.deliveryAddressSnapshot = areaOnly(snapshot);
    rest.deliveryInstructions = null;
  } else if ((address && typeof address === 'object') || snapshot) {
    // The door the order was placed to, not the saved address as edited since.
    const { userId: _u, ...saved } = (address && typeof address === 'object' ? address : {}) as Record<string, unknown>;
    rest.deliveryAddress = addressAsOrdered(snapshot, saved);
  }
  return rest as T;
}

function presentDelivery<
  D extends {
    status: string;
    riderFee: unknown;
    riderBonus: unknown;
    riderLatitude: unknown;
    riderLongitude: unknown;
    riderLocationAt: Date | null;
    deliveryLatitude: unknown;
    deliveryLongitude: unknown;
    rider: Record<string, unknown> | null;
    releasedRiderIds?: unknown;
  },
>(delivery: D, viewer: { canSeePay: boolean; canSeeLocation: boolean; canSeeInternal: boolean; riderFirstName: string | null }) {
  // The riders who handed the job back are dispatch's business (it skips them); only staff see who they were.
  const { riderFee, riderBonus, riderLatitude, riderLongitude, riderLocationAt, releasedRiderIds, ...rest } = delivery;
  const live = viewer.canSeeLocation && ON_THE_WAY_STATUSES.includes(delivery.status) && riderLatitude != null && riderLongitude != null;
  const doorKnown = delivery.deliveryLatitude != null && delivery.deliveryLongitude != null;
  return {
    ...rest,
    rider: delivery.rider ? { ...delivery.rider, name: viewer.riderFirstName } : null,
    ...(viewer.canSeeInternal ? { releasedRiderIds } : {}),
    ...(viewer.canSeePay ? { riderFee: riderFee != null ? Number(riderFee) : null, riderBonus: riderBonus != null ? Number(riderBonus) : null } : {}),
    riderLocation: live
      ? {
          latitude: Number(riderLatitude),
          longitude: Number(riderLongitude),
          updatedAt: riderLocationAt,
          // How far the rider is from the door, when the door's location is known.
          distanceKm: doorKnown
            ? Math.round(haversineKm(Number(riderLatitude), Number(riderLongitude), Number(delivery.deliveryLatitude), Number(delivery.deliveryLongitude)) * 10) / 10
            : null,
        }
      : null,
  };
}

/** Reading orders: a customer's list and one order as each party to it may see it. */
export class OrderQueries {
  /**
   * Get user orders
   */
  async getUserOrders(
    userId: string,
    filters: {
      page?: number;
      limit?: number;
      status?: string;
    }
  ) {
    const { page, limit, skip } = pageArgs(filters.page, filters.limit);

    const where: any = {
      customerId: userId,
    };

    if (filters.status) {
      where.orderStatus = filters.status;
    }

    const [orders, total, statusGroups] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            select: {
              id: true,
              productId: true,
              productName: true,
              productImage: true,
              quantity: true,
              status: true,
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
      // Whole-history totals for the summary cards (not just the loaded page).
      prisma.order.groupBy({ by: ['orderStatus'], where: { customerId: userId }, _count: { _all: true } }),
    ]);

    return {
      orders: orders.map((order) => {
        // Compute effective status: if DB says pending but every item is cancelled,
        // the order is functionally cancelled (backend bug guard for legacy records).
        const allCancelled =
          order.items.length > 0 &&
          order.items.every((item) => item.status === 'cancelled');
        const effectiveOrderStatus =
          order.orderStatus === 'pending' && allCancelled
            ? 'cancelled'
            : order.orderStatus;

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          totalAmount: Number(order.totalAmount),
          orderStatus: effectiveOrderStatus,
          paymentStatus: order.paymentStatus,
          createdAt: order.createdAt,
          estimatedDeliveryAt: order.estimatedDeliveryAt,
          itemsCount: order._count.items,
          items: order.items.slice(0, 3),
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      statusCounts: Object.fromEntries(statusGroups.map((g) => [g.orderStatus, g._count._all])),
    };
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true, email: true },
    });

    const seller = await prisma.seller.findUnique({
      where: { userId },
      select: { id: true },
    });

    const isAdmin = user?.userType === 'admin';
    const viewerRider = await prisma.rider.findUnique({ where: { userId }, select: { id: true } });

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...(isAdmin
          ? {}
          : {
              OR: [
                { customerId: userId },
                ...(seller ? [{ items: { some: { sellerId: seller.id } } }] : []),
                { items: { some: { seller: { userId } } } },
                { delivery: { rider: { userId } } },
              ],
            }),
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                },
              },
            },
            seller: {
              select: {
                id: true,
                businessName: true,
                businessNameUrdu: true,
              },
            },
          },
        },
        deliveryAddress: true,
        hub: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            area: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
        delivery: {
          include: {
            rider: {
              select: {
                id: true,
                vehicleType: true,
                vehicleNumber: true,
                ratingAverage: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // The handover code is shown to the customer only: the rider or seller who hands the
    // order over has to get it from them.
    const handover =
      order.customerId === userId
        ? await prisma.order.findUnique({ where: { id: order.id }, select: { handoverCode: true } })
        : null;

    const isOrderRider = !!viewerRider && order.delivery?.riderId === viewerRider.id;
    const isSeller = !!seller && order.items.some((i: { sellerId: string }) => i.sellerId === seller.id);
    // A kitchen gets its own view of the order, never the customer's full row: no map pin, postcode,
    // customer account id or internal keys (utils/kitchenOrderView.ts). A customer who also runs a
    // kitchen, and an admin, are not treated as the kitchen here.
    if (isSeller && !isAdmin && order.customerId !== userId) {
      return sellerOrderService.getSellerOrderDetails(order.id, userId);
    }
    // The customer is told their rider's first name.
    const riderUserId = order.delivery?.riderId
      ? (await prisma.rider.findUnique({ where: { id: order.delivery.riderId }, select: { userId: true } }))?.userId
      : null;
    const riderFullName = riderUserId
      ? (await prisma.userProfile.findUnique({ where: { userId: riderUserId }, select: { fullName: true } }))?.fullName
      : null;

    // A rider delivering the order needs the food, the door, the amount to collect and how it is
    // paid; not the customer's bank details, receipt, the kitchen's fee breakdown or internal keys.
    const riderOnly = isOrderRider && !isAdmin && order.customerId !== userId && !isSeller;
    const jobRunning = ACTIVE_DELIVERY_STATUSES.includes(order.delivery?.status ?? '');
    const forViewer = riderOnly ? stripForRider(order, jobRunning) : order;
    const presentedDelivery = order.delivery
      ? presentDelivery(order.delivery, {
          canSeePay: isAdmin || isOrderRider,
          canSeeLocation: isAdmin || isOrderRider || order.customerId === userId,
          canSeeInternal: isAdmin,
          riderFirstName: riderFullName?.trim().split(/\s+/)[0] || null,
        })
      : null;
    // The delivery row carries the door too: a rider whose job is over keeps the area only.
    const deliveryForViewer =
      presentedDelivery && riderOnly && !jobRunning
        ? {
            ...presentedDelivery,
            deliveryAddress: [forViewer.deliveryAddress?.area, forViewer.deliveryAddress?.city].filter(Boolean).join(', ') || null,
            deliveryLatitude: null,
            deliveryLongitude: null,
          }
        : presentedDelivery;

    return {
      ...forViewer,
      // The door as the order was placed (utils/addressSnapshot.ts), whatever has happened to the saved address since: edited, it
      // must not say the order is going somewhere else, and deleted, the order must still say where it went. A rider's copy was
      // settled above.
      ...(riderOnly ? {} : { deliveryAddress: addressAsOrdered(order.deliveryAddressSnapshot, order.deliveryAddress) }),
      delivery: deliveryForViewer,
      ...(handover ? { handoverCode: handover.handoverCode } : {}),
      // The receipt is private: the viewer (already checked above) gets a short-lived link.
      paymentProofUrl: riderOnly ? null : await presentFile(order.paymentProofUrl),
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.deliveryFee),
      discountAmount: Number(order.discountAmount),
      taxAmount: Number(order.taxAmount),
      totalAmount: Number(order.totalAmount),
    };
  }
}

export default new OrderQueries();
