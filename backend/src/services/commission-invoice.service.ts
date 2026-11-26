import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { DELIVERED_PKT } from './finance-report.service';
import adminService from './admin.service';
import { pktDate } from '../utils/payoutWeek';

/**
 * A kitchen's monthly invoice from Nuray: the commission on its delivered orders and the Nuray delivery fees it paid,
 * read from the ledger (orders count in the month they were delivered, Pakistan time, as in the GST report). Only
 * finished months are invoiced, so an invoice never changes once it can be seen.
 * ponytail: built on request, not stored; store issued invoices if an accountant needs them frozen beyond the ledger.
 */

const round = (n: number) => Math.round(n * 100) / 100;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface InvoiceSummary {
  month: string;
  number: string;
  orders: number;
  commission: number;
  deliveryCharges: number;
  total: number;
}

export interface CommissionInvoice extends InvoiceSummary {
  issuedOn: string;
  from: { name: string; email: string };
  to: { name: string; address: string | null };
  lines: Array<{ orderNumber: string; deliveredOn: string; commission: number; deliveryCharge: number }>;
}

/** NUR-202611-1A2B3C4D: the month and the kitchen, so it is unique and the same every time it is shown. */
const invoiceNumber = (sellerId: string, month: string) => `NUR-${month.replace('-', '')}-${sellerId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
const currentMonth = () => pktDate(new Date()).slice(0, 7);

type Row = { month: string; order_number: string; delivered_on: string; commission: string; delivery: string };

async function rows(sellerId: string, month?: string): Promise<Row[]> {
  return prisma.$queryRawUnsafe<Row[]>(
    `SELECT to_char(${DELIVERED_PKT}, 'YYYY-MM') AS month, o.order_number, to_char(${DELIVERED_PKT}, 'YYYY-MM-DD') AS delivered_on,
            coalesce(sum(l.amount) FILTER (WHERE l.transaction_type = 'platform_commission'), 0) AS commission,
            coalesce(sum(l.amount) FILTER (WHERE l.transaction_type = 'seller_delivery_charge'), 0) AS delivery
     FROM ledger_entries l JOIN orders o ON o.id = l.order_id
     WHERE l.seller_id = $1 AND l.transaction_type IN ('platform_commission', 'seller_delivery_charge')
       AND to_char(${DELIVERED_PKT}, 'YYYY-MM') < $2 ${month ? `AND to_char(${DELIVERED_PKT}, 'YYYY-MM') = $3` : ''}
     GROUP BY 1, 2, 3, ${DELIVERED_PKT} ORDER BY ${DELIVERED_PKT}, o.order_number`,
    sellerId,
    currentMonth(),
    ...(month ? [month] : [])
  );
}

function summarise(sellerId: string, month: string, lines: Row[]): InvoiceSummary {
  const commission = round(lines.reduce((s, r) => s + Number(r.commission), 0));
  const deliveryCharges = round(lines.reduce((s, r) => s + Number(r.delivery), 0));
  return { month, number: invoiceNumber(sellerId, month), orders: lines.length, commission, deliveryCharges, total: round(commission + deliveryCharges) };
}

/** The kitchen's invoices, newest first: one for each finished month with commission or delivery fees. */
export async function listInvoices(sellerId: string): Promise<InvoiceSummary[]> {
  const byMonth = new Map<string, Row[]>();
  for (const r of await rows(sellerId)) byMonth.set(r.month, [...(byMonth.get(r.month) ?? []), r]);
  return [...byMonth.entries()]
    .map(([month, lines]) => summarise(sellerId, month, lines))
    .filter((i) => i.total > 0)
    .sort((a, b) => b.month.localeCompare(a.month));
}

export async function getInvoice(sellerId: string, month: string): Promise<CommissionInvoice> {
  if (!MONTH.test(month)) throw new AppError('Choose a month as YYYY-MM', 400, 'VALIDATION_ERROR');
  const lines = await rows(sellerId, month);
  const summary = summarise(sellerId, month, lines);
  if (summary.total <= 0) throw new AppError('There is no invoice for that month', 404, 'INVOICE_NOT_FOUND');
  const seller = await prisma.seller.findUniqueOrThrow({ where: { id: sellerId }, select: { businessName: true, pickupAddress: true } });
  const [y, m] = month.split('-').map(Number);
  return {
    ...summary,
    issuedOn: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), // the first day after the month
    from: { name: await adminService.getSettingValue<string>('platformName'), email: await adminService.getSettingValue<string>('supportEmail') },
    to: { name: seller.businessName, address: seller.pickupAddress },
    lines: lines.map((r) => ({ orderNumber: r.order_number, deliveredOn: r.delivered_on, commission: round(Number(r.commission)), deliveryCharge: round(Number(r.delivery)) })),
  };
}
