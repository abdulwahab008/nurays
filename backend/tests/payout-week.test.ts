import { addDays, payoutDay, pktDate } from '../src/utils/payoutWeek';

describe('the payout calendar: every working day, Pakistan time', () => {
  it('a weekday before 06:00 is not due yet; at 06:00 it is, for everything up to the day before', () => {
    // Tuesday 2026-10-20 05:59 PKT = 00:59 UTC
    expect(payoutDay(new Date('2026-10-20T00:59:00Z'))).toEqual({ runDate: '2026-10-20', periodEnd: '2026-10-19', due: false });
    expect(payoutDay(new Date('2026-10-20T01:00:00Z'))).toEqual({ runDate: '2026-10-20', periodEnd: '2026-10-19', due: true });
    expect(payoutDay(new Date('2026-10-20T18:59:00Z'))).toEqual({ runDate: '2026-10-20', periodEnd: '2026-10-19', due: true }); // 23:59 PKT
  });

  it('Saturday and Sunday are not payout days; Monday covers the weekend', () => {
    expect(payoutDay(new Date('2026-10-24T05:00:00Z')).due).toBe(false); // Saturday 10:00 PKT
    expect(payoutDay(new Date('2026-10-25T05:00:00Z')).due).toBe(false); // Sunday
    expect(payoutDay(new Date('2026-10-26T02:00:00Z'))).toEqual({ runDate: '2026-10-26', periodEnd: '2026-10-25', due: true }); // Monday 07:00
    expect(payoutDay(new Date('2026-10-23T02:00:00Z')).due).toBe(true); // Friday
  });

  it('a listed holiday is not a payout day', () => {
    expect(payoutDay(new Date('2026-12-25T02:00:00Z'), ['2026-12-25']).due).toBe(false);
    expect(payoutDay(new Date('2026-12-24T02:00:00Z'), ['2026-12-25']).due).toBe(true);
  });

  it('Sunday 19:00 UTC is already Monday in Pakistan', () => {
    expect(payoutDay(new Date('2026-10-25T19:00:00Z'))).toEqual({ runDate: '2026-10-26', periodEnd: '2026-10-25', due: false });
  });

  it('dates are Pakistan dates', () => {
    expect(pktDate(new Date('2026-10-18T19:30:00Z'))).toBe('2026-10-19');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
