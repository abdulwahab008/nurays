/**
 * The definitions the kitchen's dashboard and its analytics screen both report on, in one
 * place so the same day can't show two different numbers under the same word.
 *
 * "Earned" matches the ledger (seller-balance.service.ts): a line counts only once the order
 * actually arrived AND the money is still ours — a cancelled line, a cancelled order or one
 * refunded back to the customer has earned the kitchen nothing.
 */

export interface ReportLine {
  status: string;
  quantity: number;
  sellerPayout: unknown;
  order: { id: string; orderStatus: string; paymentStatus: string; createdAt: Date } | null;
}

export function isEarned(line: ReportLine): boolean {
  const o = line.order;
  return (
    line.status !== 'cancelled' &&
    !!o &&
    (o.orderStatus === 'delivered' || o.orderStatus === 'completed') &&
    o.paymentStatus === 'paid'
  );
}

export interface PeriodTotals {
  /** Distinct orders — never a line or unit count. */
  orders: number;
  /** Units of food sold. Counted separately from money, and never called "sales". */
  unitsSold: number;
  /** The kitchen's own money: seller payout, net of commission and of discounts it funded. */
  revenue: number;
}

export function periodTotals(lines: ReportLine[], since: Date): PeriodTotals {
  const orders = new Set<string>();
  let unitsSold = 0;
  let revenue = 0;
  for (const line of lines) {
    if (!isEarned(line) || !line.order || line.order.createdAt < since) continue;
    orders.add(line.order.id);
    unitsSold += line.quantity;
    revenue += Number(line.sellerPayout);
  }
  return { orders: orders.size, unitsSold, revenue: Math.round(revenue * 100) / 100 };
}
