/**
 * Every dish view ran its own UPDATE on the dish row, which queued behind the stock-decrement
 * locks of orders for that dish and held a pool connection while it waited. Views are now counted
 * in memory and written in one statement that skips locked rows, retrying them on the next flush.
 * The database is a double.
 */
const db = {
  $queryRaw: jest.fn(),
  product: { findMany: jest.fn() },
};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: {} }));
jest.mock('../src/services/approvals.service', () => ({ notifyApprovers: jest.fn() }));
jest.mock('../src/services/notify.service', () => ({ notifySeller: jest.fn(), notify: jest.fn() }));
jest.mock('../src/storage', () => ({ isStoredFile: jest.fn(), presentFile: jest.fn() }));

import { flushProductViews, recordProductView } from '../src/services/product.service';

const flushedViews = (call: number) => {
  const values = db.$queryRaw.mock.calls[call].slice(1) as unknown[];
  return { ids: values[0], counts: values[1] };
};

describe('dish view counting', () => {
  afterEach(async () => {
    db.$queryRaw.mockResolvedValue([]);
    db.product.findMany.mockResolvedValue([]);
    await flushProductViews();
  });

  it('does not touch the database per view, and writes all views in one statement', async () => {
    recordProductView('p1');
    recordProductView('p1');
    recordProductView('p2');
    expect(db.$queryRaw).not.toHaveBeenCalled();

    db.$queryRaw.mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }]);
    await flushProductViews();

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(String((db.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?'))).toMatch(/FOR UPDATE OF p SKIP LOCKED/);
    expect(flushedViews(0)).toEqual({ ids: ['p1', 'p2'], counts: [2, 1] });
  });

  it('keeps the views of a dish an order has locked for the next flush, and drops a deleted dish', async () => {
    recordProductView('p1');
    recordProductView('busy');
    recordProductView('gone');
    db.$queryRaw.mockResolvedValueOnce([{ id: 'p1' }]);
    db.product.findMany.mockResolvedValueOnce([{ id: 'busy' }]);
    await flushProductViews();

    recordProductView('busy');
    db.$queryRaw.mockResolvedValueOnce([{ id: 'busy' }]);
    await flushProductViews();

    expect(flushedViews(1)).toEqual({ ids: ['busy'], counts: [2] });
  });

  it('keeps the views when the write fails', async () => {
    recordProductView('p1');
    db.$queryRaw.mockRejectedValueOnce(new Error('connection lost'));
    await flushProductViews();

    db.$queryRaw.mockResolvedValueOnce([{ id: 'p1' }]);
    await flushProductViews();

    expect(flushedViews(1)).toEqual({ ids: ['p1'], counts: [1] });
  });
});
