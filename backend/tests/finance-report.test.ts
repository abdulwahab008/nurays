/** The monthly GST report: sums of the ledger's gst_payable entries, by who holds the money, and the accountant's CSV. */
const db: any = { $queryRawUnsafe: jest.fn() };
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));

import { gstByMonth, gstMonthCsv, gstMonthDetail } from '../src/services/finance-report.service';

beforeEach(() => db.$queryRawUnsafe.mockReset());

it('turns the monthly sums into rupees, with who holds the GST', async () => {
  db.$queryRawUnsafe.mockResolvedValue([{ month: '2026-11', orders: BigInt(2), gst: '116.00', taxable: '2300.00', nuray: '0', kitchens: '0', riders: '116.00' }]);
  expect(await gstByMonth()).toEqual([{ month: '2026-11', orders: 2, taxableSales: 2300, gst: 116, heldBy: { nuray: 0, kitchens: 0, riders: 116 } }]);
});

it('refuses a month that is not YYYY-MM before touching the database', async () => {
  await expect(gstMonthDetail('2026-13')).rejects.toMatchObject({ statusCode: 400 });
  await expect(gstMonthDetail("2026-11' OR 1=1")).rejects.toMatchObject({ statusCode: 400 });
  expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
});

it('passes the month as a parameter and labels who holds each order’s money', async () => {
  db.$queryRawUnsafe
    .mockResolvedValueOnce([
      { order_number: 'FN1', delivered_on: '2026-11-25', kitchens: "Nani Jaan's Handi", payment_method: 'cod', collected_by: 'rider', gst: '58.00', taxable: '1150.00' },
      { order_number: 'FN2', delivered_on: '2026-11-25', kitchens: 'Wok Street', payment_method: 'safepay', collected_by: 'platform', gst: '40.00', taxable: '800.00' },
    ])
    .mockResolvedValueOnce([]);
  const detail = await gstMonthDetail('2026-11');
  expect(db.$queryRawUnsafe.mock.calls[0][1]).toBe('2026-11');
  expect(detail.lines.map((l) => l.heldBy)).toEqual(['Rider', 'Nuray']);
  const csv = gstMonthCsv(detail, '2026-11');
  expect(csv).toContain("FN1,2026-11-25,Nani Jaan's Handi,cod,Rider,1150,58");
  expect(csv.split('\n')[0]).toBe('GST report,2026-11');
});
