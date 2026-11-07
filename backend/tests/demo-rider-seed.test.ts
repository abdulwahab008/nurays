/**
 * The demo seed (scripts/seed-ideal-flow-users.ts) leaves the demo rider with no cash in hand, so cash orders
 * delivered while trying the app never strand them at the cash limit.
 */
import { Prisma } from '@prisma/client';
import { handInDemoRiderCash } from '../scripts/seed-ideal-flow-users';
import { riderMoney } from '../src/services/rider-ledger.service';

jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));

type Entry = { type: string; amount: number };

function fakeLedger(entries: Entry[]) {
  return {
    riderLedgerEntry: {
      groupBy: jest.fn(async () => {
        const sums = new Map<string, number>();
        for (const e of entries) sums.set(e.type, (sums.get(e.type) ?? 0) + e.amount);
        return [...sums].map(([type, amount]) => ({ type, _sum: { amount } }));
      }),
      aggregate: jest.fn(async ({ where }: { where: { type: { in: string[] } } }) => ({
        _sum: { amount: entries.filter((e) => where.type.in.includes(e.type)).reduce((total, e) => total + e.amount, 0) },
      })),
      create: jest.fn(async ({ data }: { data: Entry }) => {
        entries.push({ type: data.type, amount: Number(data.amount) });
        return data;
      }),
    },
  };
}

const asClient = (fake: ReturnType<typeof fakeLedger>) => fake as unknown as Prisma.TransactionClient;

describe('handInDemoRiderCash', () => {
  it('records the cash the demo rider holds as handed in, keeping their earnings', async () => {
    const entries: Entry[] = [
      { type: 'delivery_fee', amount: 1200 },
      { type: 'cod_collected', amount: -9879 },
      { type: 'cash_deposit', amount: 500 },
    ];
    const fake = fakeLedger(entries);

    await expect(handInDemoRiderCash(asClient(fake), 'rider-1', 'admin-1')).resolves.toBe(9379);

    expect(fake.riderLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ riderId: 'rider-1', type: 'cash_deposit', amount: 9379, createdBy: 'admin-1' }),
    });
    await expect(riderMoney(asClient(fake), 'rider-1')).resolves.toMatchObject({ cashHeld: 0, unpaid: 1200, earned: 1200 });
  });

  it('writes nothing when the demo rider holds no cash, so a re-run is a no-op', async () => {
    const fake = fakeLedger([{ type: 'delivery_fee', amount: 300 }]);

    await expect(handInDemoRiderCash(asClient(fake), 'rider-1', 'admin-1')).resolves.toBe(0);

    expect(fake.riderLedgerEntry.create).not.toHaveBeenCalled();
  });
});
