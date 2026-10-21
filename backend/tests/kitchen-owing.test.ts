jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));
import { owingState, CASH_PAUSE_AFTER_DAYS } from '../src/services/kitchen-owing.service';
import { payoutDestination } from '../src/services/weekly-payout.service';

const DAY = 24 * 3600e3;
const none = { bankAccountNumber: null, bankAccountName: null, bankName: null, jazzcashNumber: null, jazzcashAccountTitle: null, easypaisaNumber: null, easypaisaAccountTitle: null };

describe('what a kitchen owes, and the cash pause', () => {
  const since = new Date('2026-10-01T00:00:00Z');
  it('owes nothing at a zero or positive balance, whatever owes_since says', () => {
    expect(owingState(0, since)).toEqual({ owed: 0, owesSince: null, cashPausesAt: null, cashPaused: false });
    expect(owingState(250, since).cashPaused).toBe(false);
  });
  it(`cash pauses ${CASH_PAUSE_AFTER_DAYS} days after it started owing, not before`, () => {
    const pausesAt = new Date(since.getTime() + CASH_PAUSE_AFTER_DAYS * DAY);
    expect(owingState(-300, since, new Date(pausesAt.getTime() - 1))).toEqual({ owed: 300, owesSince: since, cashPausesAt: pausesAt, cashPaused: false });
    expect(owingState(-300, since, pausesAt).cashPaused).toBe(true);
  });
});

describe('where a weekly payout goes', () => {
  it('bank first, then JazzCash, then EasyPaisa; the schedule can put one first', () => {
    const k = { ...none, bankAccountNumber: '1234-5678-9012', bankAccountName: 'A', jazzcashNumber: '+92 300 1234567', jazzcashAccountTitle: 'B' };
    expect(payoutDestination(k)).toMatchObject({ payoutMethod: 'bank_transfer', accountNumber: '123456789012', accountTitle: 'A' });
    expect(payoutDestination(k, 'jazzcash')).toMatchObject({ payoutMethod: 'jazzcash', accountNumber: '03001234567', accountTitle: 'B' });
  });
  it('skips a saved number that is not a valid one, and gives up when there is none', () => {
    expect(payoutDestination({ ...none, bankAccountNumber: '12', easypaisaNumber: '03451234567' })).toMatchObject({ payoutMethod: 'easypaisa', accountNumber: '03451234567' });
    expect(payoutDestination(none)).toBeNull();
  });
});
