import { addDays, payoutWeek, pktDate } from '../src/utils/payoutWeek';

describe('the weekly payout calendar (Pakistan time)', () => {
  it('a Monday before 06:00 is not due yet; at 06:00 it is', () => {
    // Monday 2026-10-19 05:59 PKT = 00:59 UTC
    expect(payoutWeek(new Date('2026-10-19T00:59:00Z'))).toEqual({ runDate: '2026-10-19', periodEnd: '2026-10-18', due: false });
    expect(payoutWeek(new Date('2026-10-19T01:00:00Z'))).toEqual({ runDate: '2026-10-19', periodEnd: '2026-10-18', due: true });
  });

  it('later on Monday it is still due (a missed hour catches up); on the other days it is not', () => {
    expect(payoutWeek(new Date('2026-10-19T18:59:00Z'))).toEqual({ runDate: '2026-10-19', periodEnd: '2026-10-18', due: true }); // 23:59 PKT
    expect(payoutWeek(new Date('2026-10-21T10:00:00Z'))).toEqual({ runDate: '2026-10-19', periodEnd: '2026-10-18', due: false });
    // Sunday 23:30 PKT is still the week before the next Monday
    expect(payoutWeek(new Date('2026-10-25T18:30:00Z'))).toEqual({ runDate: '2026-10-19', periodEnd: '2026-10-18', due: false });
  });

  it('Sunday 19:00 UTC is already Monday in Pakistan', () => {
    expect(payoutWeek(new Date('2026-10-25T19:00:00Z'))).toEqual({ runDate: '2026-10-26', periodEnd: '2026-10-25', due: false });
  });

  it('dates are Pakistan dates', () => {
    expect(pktDate(new Date('2026-10-18T19:30:00Z'))).toBe('2026-10-19');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
