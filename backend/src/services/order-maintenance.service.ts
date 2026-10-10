import prisma from '../config/database';
import adminOrderService from './admin-order.service';
import { notify } from './notify.service';
import { logger } from '../utils/logger';

/**
 * Orders that nobody is moving forward release their stock and the customer's money.
 *
 *  - Not accepted by the kitchen within ORDER_ACCEPT_TIMEOUT_MINUTES (default 30):
 *    cancelled, stock returned, any payment refunded.
 *  - Paid online / by transfer but the payment never completed within
 *    ORDER_PAYMENT_TIMEOUT_MINUTES (default 60): cancelled.
 *  - A transfer the customer reported but the kitchen hasn't confirmed (or disputed)
 *    within PAYMENT_CONFIRM_ESCALATE_HOURS (default 6): admins are alerted once, since
 *    real money may be involved.
 *
 * Every cancel goes through the normal cancel transaction (the same one an admin
 * uses), so stock, hub batches, promo usage, rider jobs and refunds are handled the
 * same way.
 */

const minutes = (n: number) => n * 60 * 1000;
const num = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Number(v) : d);

export function staleOrderRules(env: NodeJS.ProcessEnv = process.env) {
  return {
    acceptMinutes: num(env.ORDER_ACCEPT_TIMEOUT_MINUTES, 30),
    paymentMinutes: num(env.ORDER_PAYMENT_TIMEOUT_MINUTES, 60),
    confirmPaymentHours: num(env.PAYMENT_CONFIRM_ESCALATE_HOURS, 6),
  };
}

const ESCALATION_NOTE = 'Escalated to admins: the kitchen has not confirmed the reported payment';

export async function sweepStaleOrders(now: Date = new Date()) {
  const rules = staleOrderRules();
  const result = { cancelledUnpaid: 0, cancelledUnaccepted: 0, escalated: 0, failed: 0 };

  const cancel = async (orderId: string, reason: string, key: 'cancelledUnpaid' | 'cancelledUnaccepted') => {
    try {
      await adminOrderService.cancelOrder(orderId, null, reason, { by: 'system' });
      result[key]++;
    } catch (err: any) {
      // Moved on in the meantime (accepted, paid, cancelled by someone else): nothing to do.
      if (err?.code !== 'ORDER_NOT_CANCELLABLE') {
        result.failed++;
        logger.error({ err, orderId }, 'Stale-order sweep could not cancel an order');
      }
    }
  };

  const unpaid = await prisma.order.findMany({
    where: {
      paymentMethod: { not: 'cod' },
      paymentStatus: { in: ['pending', 'failed'] },
      orderStatus: { in: ['pending', 'confirmed', 'preparing'] },
      createdAt: { lt: new Date(now.getTime() - minutes(rules.paymentMinutes)) },
    },
    select: { id: true },
    take: 200,
  });
  for (const o of unpaid) await cancel(o.id, "The payment wasn't completed in time.", 'cancelledUnpaid');

  const unaccepted = await prisma.order.findMany({
    where: {
      orderStatus: 'pending',
      createdAt: { lt: new Date(now.getTime() - minutes(rules.acceptMinutes)) },
    },
    select: { id: true },
    take: 200,
  });
  for (const o of unaccepted) await cancel(o.id, "The kitchen didn't confirm the order in time.", 'cancelledUnaccepted');

  const unconfirmed = await prisma.order.findMany({
    where: {
      paymentStatus: 'payment_submitted',
      orderStatus: { notIn: ['cancelled', 'refunded'] },
      paymentSubmittedAt: { lt: new Date(now.getTime() - minutes(rules.confirmPaymentHours * 60)) },
      statusHistory: { none: { notes: ESCALATION_NOTE } },
    },
    select: { id: true, orderNumber: true, orderStatus: true },
    take: 100,
  });
  if (unconfirmed.length > 0) {
    const admins = await prisma.user.findMany({ where: { userType: 'admin', status: 'active' }, select: { id: true } });
    for (const o of unconfirmed) {
      await prisma.orderStatusHistory.create({ data: { orderId: o.id, status: o.orderStatus, notes: ESCALATION_NOTE } });
      for (const a of admins) {
        await notify({
          userId: a.id,
          category: 'orders',
          type: 'payment_unconfirmed',
          title: `Order #${o.orderNumber}: payment not confirmed`,
          message: `The customer reported a transfer more than ${rules.confirmPaymentHours} hours ago and the kitchen hasn't confirmed or disputed it.`,
          data: { orderId: o.id },
          actionUrl: `/admin/orders/${o.id}`,
          channels: ['push', 'email'],
          dedupeKey: `order:${o.id}:escalated:${a.id}`,
        });
      }
      result.escalated++;
    }
  }

  if (result.cancelledUnpaid || result.cancelledUnaccepted || result.escalated || result.failed) {
    logger.info(result, 'Stale-order sweep');
  }
  return result;
}

/** Housekeeping: old one-time codes and expired password-reset tokens. */
export async function purgeExpiredSecrets(now: Date = new Date()) {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  await prisma.otpVerification.deleteMany({ where: { createdAt: { lt: dayAgo } } });
  await prisma.passwordReset.deleteMany({ where: { OR: [{ expiresAt: { lt: dayAgo } }, { usedAt: { not: null }, createdAt: { lt: dayAgo } }] } });
}
