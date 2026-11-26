import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

/**
 * Matching a Nuray bank or wallet statement against Nuray's own records of money moved: each statement line is paired
 * with the payout, refund or deposit it is, by reference first, then by amount within a few days. What is left on
 * either side is what an admin has to look at.
 * ponytail: nothing is stored; keep the matched runs when admins need the history.
 */

export type Account = 'bank_transfer' | 'jazzcash' | 'easypaisa';

export interface StatementLine {
  row: number;
  date: string;
  description: string;
  /** Money in is positive, money out negative. */
  amount: number;
}

export interface NurayRecord {
  kind: 'kitchen_payout' | 'rider_payout' | 'refund' | 'rider_deposit' | 'kitchen_payment';
  id: string;
  date: string;
  amount: number;
  reference: string | null;
  label: string;
}

export interface StatementMatch {
  from: string;
  to: string;
  matched: Array<{ line: StatementLine; record: NurayRecord; by: 'reference' | 'amount_and_date' }>;
  /** A reference on the line matches a record whose amount differs. */
  amountDiffers: Array<{ line: StatementLine; record: NurayRecord }>;
  unmatchedLines: StatementLine[];
  unmatchedRecords: NurayRecord[];
}

const DAY = 24 * 3600e3;
const DATE_WINDOW_DAYS = 3;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** One CSV record per line, with quoted fields ("a, b" and "" inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

/** 2026-11-05, 05/11/2026, 05-11-2026, 05-Nov-2026 or 05 Nov 2026 (day before month, as Pakistani banks print it). */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return iso(year(m[3]), +m[2], +m[1]);
  m = t.match(/^(\d{1,2})[\s/-]([A-Za-z]{3})[A-Za-z]*[\s/,-]+(\d{2,4})/);
  if (m && MONTHS.includes(m[2].toLowerCase())) return iso(year(m[3]), MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  return null;
}
const year = (y: string) => (y.length === 2 ? 2000 + +y : +y);
function iso(y: number, mo: number, d: number): string | null {
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : null;
}

function parseAmount(s: string): number | null {
  const t = s.replace(/[,\s]|Rs\.?|PKR/gi, '');
  if (!t) return null;
  const negative = /^\(.*\)$/.test(t) || /^-/.test(t) || /DR$/i.test(t);
  const n = Number(t.replace(/[()]|^-|CR$|DR$/gi, ''));
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

const COLUMNS = {
  date: /^(transaction |txn |value |posting )?date/i,
  description: /description|narration|details|particulars|remarks|memo/i,
  reference: /ref|cheque|transaction id|txn id|tid/i,
  debit: /debit|withdraw|paid out|money out/i,
  credit: /credit|deposit|paid in|money in/i,
  amount: /^amount/i,
};

/** Statement lines from a CSV export: finds the header row and its columns, whatever the bank calls them. */
export function readStatement(csv: string): StatementLine[] {
  const rows = parseCsv(csv);
  const headerAt = rows.findIndex((r) => r.some((c) => COLUMNS.date.test(c.trim())) && r.some((c) => COLUMNS.debit.test(c) || COLUMNS.credit.test(c) || COLUMNS.amount.test(c.trim())));
  if (headerAt < 0) throw new AppError('No header row with a date and an amount (or debit and credit) column was found in this file.', 400, 'STATEMENT_UNREADABLE');
  const header = rows[headerAt].map((c) => c.trim());
  const col = (re: RegExp, skip: number[] = []) => header.findIndex((h, i) => !skip.includes(i) && re.test(h));
  const date = col(COLUMNS.date);
  const debit = col(COLUMNS.debit);
  const credit = col(COLUMNS.credit, [debit]);
  const amount = debit < 0 && credit < 0 ? col(COLUMNS.amount) : -1;
  const text = [col(COLUMNS.description), col(COLUMNS.reference, [date, debit, credit])].filter((i) => i >= 0);

  const lines: StatementLine[] = [];
  rows.slice(headerAt + 1).forEach((r, i) => {
    const day = parseDate(r[date] ?? '');
    if (!day) return; // balance brought forward, totals and footers
    const value = amount >= 0 ? parseAmount(r[amount] ?? '') : (parseAmount(r[credit] ?? '') ?? 0) - Math.abs(parseAmount(r[debit] ?? '') ?? 0);
    if (!value) return;
    lines.push({ row: headerAt + i + 2, date: day, description: [...new Set(text.map((c) => (r[c] ?? '').trim()).filter(Boolean))].join(' · '), amount: Math.round(value * 100) / 100 });
  });
  if (lines.length === 0) throw new AppError('No transactions with a date and an amount were found in this file.', 400, 'STATEMENT_UNREADABLE');
  return lines;
}

const day = (d: Date) => new Date(d.getTime() + 5 * 3600e3).toISOString().slice(0, 10); // Pakistan date
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Nuray's records of money that moved through an account between two dates (Pakistan days). */
async function nurayRecords(from: string, to: string, account: Account): Promise<NurayRecord[]> {
  const start = new Date(`${from}T00:00:00+05:00`);
  const end = new Date(new Date(`${to}T00:00:00+05:00`).getTime() + DAY);
  const between = { gte: start, lt: end };

  const [payouts, refunds, deposits, riderPayouts] = await Promise.all([
    prisma.sellerPayout.findMany({
      // A payout is sent from the account of its kind (bank to bank, JazzCash to JazzCash); a kitchen's payment to Nuray could be to any.
      where: { status: 'completed', processedAt: between, OR: [{ payoutMethod: account }, { netAmount: { lt: 0 } }] },
      include: { seller: { select: { businessName: true } } },
    }),
    prisma.refund.findMany({
      where: { status: 'completed', method: 'manual', processedAt: between },
      include: { order: { select: { orderNumber: true } } },
    }),
    prisma.$queryRaw<Array<{ id: string; amount: number; transaction_ref: string; status: string; created_at: Date; name: string | null }>>`
      SELECT d.id, d.amount::float AS amount, d.transaction_ref, d.status, d.created_at, p.full_name AS name
      FROM rider_cash_deposits d JOIN riders r ON r.id = d.rider_id LEFT JOIN user_profiles p ON p.user_id = r.user_id
      WHERE d.status IN ('pending', 'approved') AND d.method = ${account}
        AND d.created_at >= ${start}::timestamptz AT TIME ZONE 'UTC' AND d.created_at < ${end}::timestamptz AT TIME ZONE 'UTC'`,
    // Pay a rider kept from their cash moved no money: it is posted with a cash deposit of the same amount at the same moment.
    prisma.$queryRaw<Array<{ id: string; amount: number; reference: string | null; created_at: Date; name: string | null }>>`
      SELECT e.id, -e.amount::float AS amount, e.reference, e.created_at, p.full_name AS name
      FROM rider_ledger_entries e JOIN riders r ON r.id = e.rider_id LEFT JOIN user_profiles p ON p.user_id = r.user_id
      WHERE e.type = 'payout' AND e.created_at >= ${start}::timestamptz AT TIME ZONE 'UTC' AND e.created_at < ${end}::timestamptz AT TIME ZONE 'UTC'
        AND NOT EXISTS (SELECT 1 FROM rider_ledger_entries d WHERE d.rider_id = e.rider_id AND d.type = 'cash_deposit' AND d.created_at = e.created_at AND d.amount = -e.amount)`,
  ]);

  return [
    ...payouts.map((p): NurayRecord => {
      const toNuray = Number(p.netAmount) < 0;
      return {
        kind: toNuray ? 'kitchen_payment' : 'kitchen_payout',
        id: p.id,
        date: day(p.processedAt!),
        amount: -Number(p.netAmount),
        reference: p.transactionId,
        label: toNuray ? `${p.seller.businessName} paid Nuray` : `Payout to ${p.seller.businessName}`,
      };
    }),
    ...refunds.map((r): NurayRecord => ({ kind: 'refund', id: r.id, date: day(r.processedAt!), amount: -Number(r.amount), reference: r.reference, label: `Refund on order #${r.order.orderNumber}` })),
    ...deposits.map((d): NurayRecord => ({
      kind: 'rider_deposit',
      id: d.id,
      date: day(d.created_at),
      amount: Number(d.amount),
      reference: d.transaction_ref,
      label: `Cash deposit from ${d.name ?? 'a rider'}${d.status === 'pending' ? ' (not approved yet)' : ''}`,
    })),
    ...riderPayouts.map((e): NurayRecord => ({ kind: 'rider_payout', id: e.id, date: day(e.created_at), amount: -Number(e.amount), reference: e.reference, label: `Pay to ${e.name ?? 'a rider'}` })),
  ];
}

const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY;

/** Pairs statement lines with records: by reference, then by the same amount within three days (the closest day wins). */
export function matchLines(lines: StatementLine[], records: NurayRecord[]): Omit<StatementMatch, 'from' | 'to'> {
  const free = new Set(records);
  const matched: StatementMatch['matched'] = [];
  const amountDiffers: StatementMatch['amountDiffers'] = [];
  const left: StatementLine[] = [];

  for (const line of lines) {
    const text = norm(line.description);
    // A reference only counts when it is long enough not to turn up by chance.
    // Of several records whose reference is on the line, the one for this amount, then the most specific reference.
    const byRef = [...free]
      .filter((r) => r.reference && norm(r.reference).length >= 4 && text.includes(norm(r.reference)))
      .sort((a, b) => Number(Math.abs(b.amount - line.amount) < 0.01) - Number(Math.abs(a.amount - line.amount) < 0.01) || norm(b.reference!).length - norm(a.reference!).length)[0];
    if (!byRef) { left.push(line); continue; }
    free.delete(byRef);
    if (Math.abs(byRef.amount - line.amount) < 0.01) matched.push({ line, record: byRef, by: 'reference' });
    else amountDiffers.push({ line, record: byRef });
  }

  const unmatchedLines: StatementLine[] = [];
  for (const line of left) {
    const best = [...free]
      .filter((r) => Math.abs(r.amount - line.amount) < 0.01 && daysApart(r.date, line.date) <= DATE_WINDOW_DAYS)
      .sort((a, b) => daysApart(a.date, line.date) - daysApart(b.date, line.date))[0];
    if (!best) { unmatchedLines.push(line); continue; }
    free.delete(best);
    matched.push({ line, record: best, by: 'amount_and_date' });
  }

  return { matched, amountDiffers, unmatchedLines, unmatchedRecords: [...free].sort((a, b) => a.date.localeCompare(b.date)) };
}

export async function matchStatement(csv: string, account: Account): Promise<StatementMatch> {
  const lines = readStatement(csv);
  const dates = lines.map((l) => l.date).sort();
  const [from, to] = [dates[0], dates[dates.length - 1]];
  const pad = (d: string, days: number) => new Date(Date.parse(d) + days * DAY).toISOString().slice(0, 10);
  const records = await nurayRecords(pad(from, -DATE_WINDOW_DAYS), pad(to, DATE_WINDOW_DAYS), account);
  const result = matchLines(lines, records);
  // Records from the padding days are only there to catch a line booked a day or two late.
  return { from, to, ...result, unmatchedRecords: result.unmatchedRecords.filter((r) => r.date >= from && r.date <= to) };
}
