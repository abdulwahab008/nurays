/**
 * A delivered, paid order whose ledger posting failed after the delivery was saved is posted by the catch-up sweep. The
 * sweep only looks at recent orders left alone for a few minutes, and an order posted meanwhile is not posted twice.
 */
const db: { $queryRaw: jest.Mock } = { $queryRaw: jest.fn() };
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));

import ledgerService from '../src/services/ledger.service';

const now = new Date('2026-11-09T12:00:00Z');

beforeEach(() => jest.restoreAllMocks());

it('posts each missed order and counts only the ones it actually posted', async () => {
  db.$queryRaw.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }]);
  const record = jest
    .spyOn(ledgerService, 'recordOrderCompletion')
    .mockResolvedValueOnce({ recorded: true, orderId: 'o1' })
    .mockResolvedValueOnce({ recorded: false, reason: 'ALREADY_RECORDED' });

  await expect(ledgerService.postMissedCompletions(now)).resolves.toEqual({ checked: 2, posted: 1 });
  expect(record.mock.calls.map(([id]) => id)).toEqual(['o1', 'o2']);
});

it('looks back 14 days and leaves the last 5 minutes to the delivery path', async () => {
  db.$queryRaw.mockResolvedValue([]);
  await ledgerService.postMissedCompletions(now);
  const [sql, since, settled] = db.$queryRaw.mock.calls[0];
  expect(sql.join('?')).toMatch(/payment_status = 'paid'[\s\S]*order_status IN \('delivered', 'completed'\)[\s\S]*NOT EXISTS/);
  expect(since).toEqual(new Date('2026-10-26T12:00:00Z'));
  expect(settled).toEqual(new Date('2026-11-09T11:55:00Z'));
});
