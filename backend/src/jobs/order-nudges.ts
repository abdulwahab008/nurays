import prisma from '../config/database';
import notificationService from '../services/notification.service';
import socketManager from '../config/socket';

/**
 * Timeout nudges for the order lifecycle. These are advisory pushes (persistent
 * notification + live socket), de-duplicated by (user, type, actionUrl) so a
 * given order is nudged at most once per kind.
 */

async function alreadyNudged(userId: string, type: string, actionUrl: string): Promise<boolean> {
  const existing = await prisma.notification.findFirst({ where: { userId, type, actionUrl } });
  return existing != null;
}

async function nudge(
  userId: string,
  type: string,
  title: string,
  message: string,
  actionUrl: string,
  orderId: string,
): Promise<boolean> {
  if (await alreadyNudged(userId, type, actionUrl)) return false;
  await notificationService.createNotification(userId, { type, title, message, actionUrl, data: { orderId } });
  socketManager.emitToUser(userId, 'order:nudge', { orderId, type });
  return true;
}

/** Sellers who haven't accepted a pending order after `thresholdMinutes`. */
export async function nudgeUnacceptedOrders(thresholdMinutes = 10): Promise<number> {
  const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: { orderStatus: 'pending', createdAt: { lt: cutoff } },
    include: { items: { where: { status: 'pending' }, include: { seller: { select: { userId: true } } } } },
  });

  let sent = 0;
  for (const order of orders) {
    const sellerUserIds = [...new Set(order.items.map((i) => i.seller?.userId).filter((u): u is string => !!u))];
    for (const uid of sellerUserIds) {
      const ok = await nudge(
        uid,
        'order_nudge_accept',
        'Order still waiting',
        `Order #${order.orderNumber} is still unconfirmed — please accept or decline it.`,
        `/sellers/orders/${order.id}`,
        order.id,
      );
      if (ok) sent++;
    }
  }
  return sent;
}

/** Accepted orders that have passed their ETA but aren't on the way yet. */
export async function nudgeLateOrders(): Promise<number> {
  const now = new Date();
  const orders = await prisma.order.findMany({
    where: {
      orderStatus: { in: ['confirmed', 'preparing', 'ready'] },
      estimatedDeliveryAt: { not: null, lt: now },
    },
    include: {
      customer: { select: { id: true } },
      items: { include: { seller: { select: { userId: true } } } },
    },
  });

  let sent = 0;
  for (const order of orders) {
    const sellerUserIds = [...new Set(order.items.map((i) => i.seller?.userId).filter((u): u is string => !!u))];
    for (const uid of sellerUserIds) {
      const ok = await nudge(
        uid,
        'order_nudge_late',
        'Order running late',
        `Order #${order.orderNumber} has passed its delivery estimate. Please update its status.`,
        `/sellers/orders/${order.id}`,
        order.id,
      );
      if (ok) sent++;
    }
    if (order.customer?.id) {
      const ok = await nudge(
        order.customer.id,
        'order_nudge_late',
        'Your order is taking a little longer',
        `Order #${order.orderNumber} is running slightly behind. Hang tight — the kitchen is on it.`,
        `/orders/${order.id}`,
        order.id,
      );
      if (ok) sent++;
    }
  }
  return sent;
}

/** Mark delivered orders complete after the dispute window. */
export async function autoCompleteDeliveredOrders(afterHours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - afterHours * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: { orderStatus: 'delivered', deliveredAt: { not: null, lt: cutoff } },
    select: { id: true, customerId: true },
  });

  let completed = 0;
  for (const order of orders) {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { orderStatus: 'completed' } });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: 'completed',
          notes: `Auto-completed after ${afterHours}h delivery window`,
          changedBy: order.customerId,
        },
      });
    });
    completed++;
  }
  return completed;
}
