import prisma from '../config/database';
import { logger } from '../utils/logger';

/**
 * A health reading of the business, written to the log every few minutes as one structured line
 * (`metric: "ops_snapshot"`). Nothing else is needed to chart these or alert on them in any log
 * tool: "open deliveries nobody took for 15 minutes", "payments failing", "approvals piling up".
 */
export async function logOpsSnapshot() {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const [openDeliveries, oldestOpen, activeDeliveries, ridersOnDuty, ordersLastHour, cancelledLastHour, paymentsFailedLastHour, pendingApprovals, pendingRefunds, pendingPayouts, openTickets] = await Promise.all([
    prisma.delivery.count({ where: { riderId: null, status: 'pending', order: { orderStatus: { notIn: ['cancelled', 'refunded', 'delivered', 'completed'] } } } }),
    prisma.delivery.findFirst({ where: { riderId: null, status: 'pending', order: { orderStatus: { notIn: ['cancelled', 'refunded', 'delivered', 'completed'] } } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.delivery.count({ where: { status: { in: ['assigned', 'arrived_at_pickup', 'picked_up', 'in_transit', 'arrived_at_customer'] } } }),
    prisma.rider.count({ where: { isAvailable: true, status: 'active', verificationStatus: 'approved' } }),
    prisma.order.count({ where: { createdAt: { gte: hourAgo } } }),
    prisma.order.count({ where: { createdAt: { gte: hourAgo }, orderStatus: 'cancelled' } }),
    prisma.paymentAttempt.count({ where: { createdAt: { gte: hourAgo }, status: 'expired' } }).catch(() => 0),
    Promise.all([prisma.seller.count({ where: { verificationStatus: 'pending' } }), prisma.rider.count({ where: { verificationStatus: 'pending' } }), prisma.product.count({ where: { approvalStatus: 'pending' } }), prisma.categoryRequest.count({ where: { status: 'pending' } })]).then((n) => n.reduce((a, b) => a + b, 0)),
    prisma.refund.count({ where: { status: 'pending' } }),
    prisma.sellerPayout.count({ where: { status: 'pending' } }),
    prisma.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] } } }),
  ]);
  logger.info(
    {
      metric: 'ops_snapshot',
      openDeliveries,
      oldestOpenDeliveryMinutes: oldestOpen ? Math.round((now - oldestOpen.createdAt.getTime()) / 60000) : 0,
      activeDeliveries,
      ridersOnDuty,
      ordersLastHour,
      cancelledLastHour,
      paymentsFailedLastHour,
      pendingApprovals,
      pendingRefunds,
      pendingPayouts,
      openTickets,
    },
    'ops snapshot'
  );
}
