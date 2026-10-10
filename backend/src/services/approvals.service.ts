import prisma from '../config/database';
import { notify } from './notify.service';
import { can, Permission } from '../utils/permissions';
import { logger } from '../utils/logger';

/**
 * Everything waiting for a staff decision, in one place, and a nudge to the people who decide
 * when something new arrives. Which queues a person sees depends on their staff role.
 */

/** Tell every active admin and the super admin that something needs approval. In-app only (no email or push spam). */
export function notifyApprovers(input: { title: string; message: string; actionUrl: string; dedupeKey: string }) {
  void (async () => {
    const approvers = await prisma.user.findMany({
      where: { userType: 'admin', status: 'active', staffRole: { in: ['admin', 'super_admin'] } },
      select: { id: true },
    });
    for (const a of approvers) {
      await notify({ userId: a.id, category: 'orders', type: 'approval', title: input.title, message: input.message, actionUrl: input.actionUrl, channels: [], dedupeKey: `${input.dedupeKey}:${a.id}` });
    }
  })().catch((err) => logger.error({ err }, 'Could not notify approvers'));
}

interface Queue {
  key: string;
  label: string;
  /** What someone must be allowed to do to see and act on this queue. */
  permission: Permission;
  href: string;
  count: () => Promise<number>;
  oldest: () => Promise<Date | null>;
}

const oldestOf = (row: { createdAt: Date } | null) => row?.createdAt ?? null;

const QUEUES: Queue[] = [
  { key: 'sellers', label: 'Kitchen applications', permission: 'ops.write', href: '/admin/pending-sellers', count: () => prisma.seller.count({ where: { verificationStatus: 'pending' } }), oldest: async () => oldestOf(await prisma.seller.findFirst({ where: { verificationStatus: 'pending' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })) },
  { key: 'riders', label: 'Rider applications', permission: 'ops.write', href: '/admin/riders?tab=applications', count: () => prisma.rider.count({ where: { verificationStatus: 'pending' } }), oldest: async () => oldestOf(await prisma.rider.findFirst({ where: { verificationStatus: 'pending' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })) },
  { key: 'products', label: 'New or changed dishes', permission: 'ops.write', href: '/admin/products', count: () => prisma.product.count({ where: { approvalStatus: 'pending' } }), oldest: async () => oldestOf(await prisma.product.findFirst({ where: { approvalStatus: 'pending' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })) },
  { key: 'categoryRequests', label: 'New category requests', permission: 'ops.write', href: '/admin/category-requests', count: () => prisma.categoryRequest.count({ where: { status: 'pending' } }), oldest: async () => oldestOf(await prisma.categoryRequest.findFirst({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })) },
  { key: 'payouts', label: 'Kitchen payout requests', permission: 'money.write', href: '/admin/payouts', count: () => prisma.sellerPayout.count({ where: { status: 'pending' } }), oldest: async () => oldestOf(await prisma.sellerPayout.findFirst({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })) },
  { key: 'refunds', label: 'Refunds to send', permission: 'money.write', href: '/admin/refunds', count: () => prisma.refund.count({ where: { status: 'pending' } }), oldest: async () => oldestOf(await prisma.refund.findFirst({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })) },
  { key: 'transfers', label: 'Transfers to check or disputed', permission: 'money.write', href: '/admin/orders?paymentStatus=disputed', count: () => prisma.order.count({ where: { paymentStatus: { in: ['payment_submitted', 'disputed'] }, orderStatus: { notIn: ['cancelled', 'refunded'] } } }), oldest: async () => oldestOf(await prisma.order.findFirst({ where: { paymentStatus: { in: ['payment_submitted', 'disputed'] }, orderStatus: { notIn: ['cancelled', 'refunded'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })) },
  { key: 'failedDeliveries', label: 'Failed deliveries to resolve', permission: 'read.core', href: '/admin/orders?orderStatus=delivery_failed', count: () => prisma.order.count({ where: { orderStatus: 'delivery_failed' } }), oldest: async () => oldestOf(await prisma.order.findFirst({ where: { orderStatus: 'delivery_failed' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })) },
  { key: 'reviews', label: 'Reported reviews', permission: 'support.handle', href: '/admin/reviews', count: () => prisma.review.count({ where: { isFlagged: true, isApproved: true } }), oldest: async () => (await prisma.review.findFirst({ where: { isFlagged: true, isApproved: true }, orderBy: { updatedAt: 'asc' }, select: { updatedAt: true } }))?.updatedAt ?? null },
  { key: 'tickets', label: 'Complaints waiting for a reply', permission: 'support.handle', href: '/admin/support', count: () => prisma.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] } } }), oldest: async () => oldestOf(await prisma.supportTicket.findFirst({ where: { status: { in: ['open', 'in_progress'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })) },
];

/** The queues this staff role may see, with how many are waiting and since when. */
export async function getApprovals(role: string | null | undefined) {
  const visible = QUEUES.filter((q) => can(role, q.permission));
  const items = await Promise.all(
    visible.map(async (q) => {
      const [count, oldest] = await Promise.all([q.count(), q.oldest()]);
      return { key: q.key, label: q.label, href: q.href, count, oldestWaitingSince: count > 0 ? oldest : null };
    })
  );
  return { items, total: items.reduce((sum, i) => sum + i.count, 0) };
}
