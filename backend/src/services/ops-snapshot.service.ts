import prisma from '../config/database';
import { logger } from '../utils/logger';
import { ACTIVE_DELIVERY_STATUSES } from '../utils/deliveryStatus';
import { getQueueCounts } from '../jobs/queue';

// A 'ready' order waiting this long for a rider needs a person: an admin can cancel it (no rider took it).
const READY_NO_RIDER_MINUTES = 20;

// Failed jobs counted at the previous snapshot in this process; growth since then is logged as a warning.
let lastFailedJobs: number | null = null;

/**
 * A health reading of the business, written to the log every few minutes as one structured line
 * (`metric: "ops_snapshot"`). Nothing else is needed to chart these or alert on them in any log
 * tool: "open deliveries nobody took for 15 minutes", "payments failing", "approvals piling up",
 * "ready orders no rider took" (readyNoRiderStuck), "background jobs failing" (jobsFailed).
 */
export async function logOpsSnapshot() {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const readyNoRider = { orderStatus: 'ready', delivery: { is: { riderId: null, status: 'pending' } } };
  const [readyNoRiderStuck, oldestReadyNoRider, jobs, openDeliveries, oldestOpen, activeDeliveries, ridersOnDuty, ordersLastHour, cancelledLastHour, paymentsFailedLastHour, pendingApprovals, pendingRefunds, pendingPayouts, openTickets] = await Promise.all([
    prisma.order.count({ where: { ...readyNoRider, updatedAt: { lt: new Date(now - READY_NO_RIDER_MINUTES * 60 * 1000) } } }),
    prisma.order.findFirst({ where: readyNoRider, orderBy: { updatedAt: 'asc' }, select: { updatedAt: true } }),
    getQueueCounts(),
    prisma.delivery.count({ where: { riderId: null, status: 'pending', order: { orderStatus: { notIn: ['cancelled', 'refunded', 'delivered', 'completed'] } } } }),
    prisma.delivery.findFirst({ where: { riderId: null, status: 'pending', order: { orderStatus: { notIn: ['cancelled', 'refunded', 'delivered', 'completed'] } } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.delivery.count({ where: { status: { in: ACTIVE_DELIVERY_STATUSES } } }),
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
      readyNoRiderStuck,
      oldestReadyNoRiderMinutes: oldestReadyNoRider ? Math.round((now - oldestReadyNoRider.updatedAt.getTime()) / 60000) : 0,
      jobsWaiting: jobs?.waiting ?? null,
      jobsActive: jobs?.active ?? null,
      jobsDelayed: jobs?.delayed ?? null,
      jobsFailed: jobs?.failed ?? null,
    },
    'ops snapshot'
  );
  if (jobs) {
    if (lastFailedJobs !== null && jobs.failed > lastFailedJobs) {
      logger.warn({ metric: 'jobs_failed', failed: jobs.failed, newlyFailed: jobs.failed - lastFailedJobs }, 'Background jobs failed since the last snapshot');
    }
    lastFailedJobs = jobs.failed;
  }
}
