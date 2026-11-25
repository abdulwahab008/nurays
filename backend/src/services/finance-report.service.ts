import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { toCsv } from '../utils/csv';

/** An order counts in the month it was delivered, in Pakistan time (stored times are UTC). */
const DELIVERED_PKT = `(COALESCE(o.delivered_at, o.paid_at, o.created_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Karachi'`;

const round = (n: number) => Math.round(n * 100) / 100;

/** The goods an order's GST was charged on (after discounts), scaled to the part of its tax still owed after a refund. */
const TAXABLE = `CASE WHEN o.tax_amount > 0 THEN (o.total_amount - o.delivery_fee - o.tax_amount) * l.amount / o.tax_amount ELSE 0 END`;

export interface GstMonth {
  month: string;
  orders: number;
  /** The sales (after discounts) the GST was charged on. */
  taxableSales: number;
  gst: number;
  /** Who holds the GST until it reaches Nuray, which files it: Nuray already, or kitchens and riders who owe it. */
  heldBy: { nuray: number; kitchens: number; riders: number };
}

/** GST owed to the tax office, month by month: the sum of the ledger's `gst_payable` entries. */
export async function gstByMonth(): Promise<GstMonth[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ month: string; orders: bigint; gst: string; taxable: string; nuray: string; kitchens: string; riders: string }>>(`
    SELECT to_char(${DELIVERED_PKT}, 'YYYY-MM') AS month,
           count(DISTINCT o.id) AS orders,
           sum(l.amount) AS gst,
           sum(${TAXABLE}) AS taxable,
           coalesce(sum(l.amount) FILTER (WHERE o.payment_collected_by NOT IN ('seller', 'rider') OR o.payment_collected_by IS NULL), 0) AS nuray,
           coalesce(sum(l.amount) FILTER (WHERE o.payment_collected_by = 'seller'), 0) AS kitchens,
           coalesce(sum(l.amount) FILTER (WHERE o.payment_collected_by = 'rider'), 0) AS riders
    FROM ledger_entries l JOIN orders o ON o.id = l.order_id
    WHERE l.transaction_type = 'gst_payable'
    GROUP BY 1 ORDER BY 1 DESC`);
  return rows.map((r) => {
    const gst = round(Number(r.gst));
    return {
      month: r.month,
      orders: Number(r.orders),
      taxableSales: round(Number(r.taxable)),
      gst,
      heldBy: { nuray: round(Number(r.nuray)), kitchens: round(Number(r.kitchens)), riders: round(Number(r.riders)) },
    };
  });
}

export interface GstLine {
  orderNumber: string;
  deliveredOn: string;
  kitchens: string;
  paymentMethod: string;
  heldBy: 'Nuray' | 'Kitchen' | 'Rider';
  taxableSales: number;
  gst: number;
}

const HELD_BY: Record<string, GstLine['heldBy']> = { seller: 'Kitchen', rider: 'Rider' };

/** Every order in a month with the GST it owes, for the accountant (as JSON or a spreadsheet). */
export async function gstMonthDetail(month: string): Promise<{ month: GstMonth | null; lines: GstLine[] }> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError('Choose a month as YYYY-MM', 400, 'VALIDATION_ERROR');
  const rows = await prisma.$queryRawUnsafe<Array<{ order_number: string; delivered_on: string; kitchens: string; payment_method: string; collected_by: string | null; gst: string; taxable: string }>>(
    `SELECT o.order_number,
            to_char(${DELIVERED_PKT}, 'YYYY-MM-DD') AS delivered_on,
            (SELECT string_agg(DISTINCT s.business_name, ', ') FROM order_items i JOIN sellers s ON s.id = i.seller_id WHERE i.order_id = o.id) AS kitchens,
            o.payment_method, o.payment_collected_by AS collected_by, l.amount AS gst, ${TAXABLE} AS taxable
     FROM ledger_entries l JOIN orders o ON o.id = l.order_id
     WHERE l.transaction_type = 'gst_payable' AND to_char(${DELIVERED_PKT}, 'YYYY-MM') = $1
     ORDER BY ${DELIVERED_PKT}, o.order_number`,
    month
  );
  const lines = rows.map((r) => {
    const gst = round(Number(r.gst));
    return {
      orderNumber: r.order_number,
      deliveredOn: r.delivered_on,
      kitchens: r.kitchens ?? '',
      paymentMethod: r.payment_method,
      heldBy: HELD_BY[r.collected_by ?? ''] ?? 'Nuray',
      taxableSales: round(Number(r.taxable)),
      gst,
    };
  });
  const summary = (await gstByMonth()).find((m) => m.month === month) ?? null;
  return { month: summary, lines };
}

export function gstMonthCsv(detail: { month: GstMonth | null; lines: GstLine[] }, month: string): string {
  const m = detail.month;
  return toCsv([
    ['GST report', month],
    ['Orders', m?.orders ?? 0],
    ['Taxable sales (Rs)', m?.taxableSales ?? 0],
    ['GST owed to the tax office (Rs)', m?.gst ?? 0],
    ['  held by Nuray (Rs)', m?.heldBy.nuray ?? 0],
    ['  held by kitchens, owed to Nuray (Rs)', m?.heldBy.kitchens ?? 0],
    ['  held by riders, owed to Nuray (Rs)', m?.heldBy.riders ?? 0],
    [],
    ['Order', 'Delivered on', 'Kitchen', 'Payment', 'Money held by', 'Taxable sales (Rs)', 'GST (Rs)'],
    ...detail.lines.map((l) => [l.orderNumber, l.deliveredOn, l.kitchens, l.paymentMethod, l.heldBy, l.taxableSales, l.gst]),
  ]);
}
