/**
 * PERF-1: the kitchen balance reads every order, which is fine until a kitchen has very many. A balance slower than
 * SLOW_BALANCE_MS is logged, so we learn when the stored running total is worth building, and only then.
 */
jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));

import { logger } from '../src/utils/logger';
import { SLOW_BALANCE_MS, sellerBalanceLines } from '../src/services/seller-balance.service';

const noOrders: any = { $queryRaw: async () => [] };

describe('the slow-balance warning', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('stays quiet for a quick balance', async () => {
    await sellerBalanceLines(noOrders, 'k1');
    expect(warn).not.toHaveBeenCalled();
  });

  it('names the kitchen, its order count and the time when a balance takes over a second', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const slow: any = {
      $queryRaw: async () => {
        now += SLOW_BALANCE_MS + 1;
        return [];
      },
    };
    await sellerBalanceLines(slow, 'k1');
    expect(warn).toHaveBeenCalledWith({ sellerId: 'k1', orders: 0, ms: SLOW_BALANCE_MS + 1 }, expect.stringContaining('PERF-1'));
  });
});
