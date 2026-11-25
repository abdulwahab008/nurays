import prisma from '../config/database';
import { getLaneHealth } from '../jobs/queue';
import { readOpsSnapshot } from './ops-snapshot.service';

/** Kitchens that have reached their "orders at a time" limit: new orders to them are refused until they catch up. */
async function kitchensAtCapacity() {
  const rows = await prisma.$queryRaw<Array<{ id: string; business_name: string; max_open_orders: number; open_orders: bigint }>>`
    SELECT s.id, s.business_name, s.max_open_orders, count(DISTINCT oi.order_id) AS open_orders
    FROM sellers s
    JOIN order_items oi ON oi.seller_id = s.id AND oi.status IN ('pending', 'confirmed', 'preparing')
    WHERE s.max_open_orders IS NOT NULL
    GROUP BY s.id, s.business_name, s.max_open_orders
    HAVING count(DISTINCT oi.order_id) >= s.max_open_orders
    ORDER BY s.business_name`;
  return rows.map((r) => ({ id: r.id, name: r.business_name, limit: r.max_open_orders, openOrders: Number(r.open_orders) }));
}

/**
 * One reading for the admin System health page: the business snapshot the logs also get every five minutes, the
 * background job lanes (with their failures and connected workers) and the kitchens that are full.
 * `queue` is null without Redis: jobs then run inside the API process and are not kept.
 */
export async function getSystemHealth() {
  const [ops, queue, fullKitchens] = await Promise.all([readOpsSnapshot(), getLaneHealth(), kitchensAtCapacity()]);
  return { checkedAt: new Date().toISOString(), ops, queue, fullKitchens };
}
