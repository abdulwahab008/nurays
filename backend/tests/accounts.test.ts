/**
 * Statements read like a finance team's: credits raise what Nuray owes, debits lower it, a running balance, and a
 * period's opening balance is everything before it. The rider statement is the rider ledger as it stands.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
const mockMoney = jest.fn();
jest.mock('../src/services/rider-ledger.service', () => ({ riderMoney: (...a: unknown[]) => mockMoney(...a) }));

import { riderStatement, statementCsv } from '../src/services/accounts.service';

const at = (day: string) => new Date(`${day}T07:00:00Z`);
const entry = (day: string, type: string, amount: number, orderNumber?: string) => ({
  createdAt: at(day), type, amount, note: null, reference: null, delivery: orderNumber ? { order: { orderNumber } } : null,
});

beforeEach(() => {
  db.rider = { findUnique: jest.fn(async () => ({ id: 'r1', userId: 'u1' })) };
  db.userProfile = { findUnique: jest.fn(async () => ({ fullName: 'Imran Ali' })) };
  db.riderLedgerEntry = {
    findMany: jest.fn(async () => [
      entry('2026-11-19', 'delivery_fee', 120, 'FN1'),
      entry('2026-11-19', 'cod_collected', -756, 'FN1'),
      entry('2026-11-25', 'delivery_fee', 124, 'FN2'),
      entry('2026-11-25', 'cod_collected', -1208, 'FN2'),
      entry('2026-11-25', 'cash_deposit', 1208),
    ]),
  };
  mockMoney.mockResolvedValue({ cashHeld: 756 });
});

it('turns ledger entries into debits and credits with a running balance', async () => {
  const s = await riderStatement('r1');
  expect(s.party.name).toBe('Imran Ali');
  expect(s.lines.map((l) => [l.debit, l.credit, l.balance])).toEqual([
    [0, 120, 120],
    [756, 0, -636],
    [0, 124, -512],
    [1208, 0, -1720],
    [0, 1208, -512],
  ]);
  expect(s.lines[1].reference).toBe('FN1');
  expect([s.totalDebit, s.totalCredit, s.closingBalance]).toEqual([1964, 1452, -512]);
});

it('opens a period with the balance of everything before it', async () => {
  const s = await riderStatement('r1', '2026-11-20');
  expect(s.openingBalance).toBe(-636);
  expect(s.lines).toHaveLength(3);
  expect(s.closingBalance).toBe(-512);
});

it('ends a period on its last day, and refuses a date that is not YYYY-MM-DD', async () => {
  const s = await riderStatement('r1', undefined, '2026-11-19');
  expect(s.lines).toHaveLength(2);
  expect(s.closingBalance).toBe(-636);
  await expect(riderStatement('r1', '25/11/2026')).rejects.toMatchObject({ statusCode: 400 });
});

it('writes the statement as a spreadsheet with its totals', async () => {
  const csv = statementCsv(await riderStatement('r1'));
  expect(csv.split('\n')[0]).toBe('Rider,Imran Ali');
  expect(csv).toContain('2026-11-25,Cash collected from the customer (owed to Nuray),FN2,1208,,-1720');
  expect(csv).toContain('Totals,,,1964,1452,');
});
