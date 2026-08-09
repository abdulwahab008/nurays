jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: { orderItem: { count: jest.fn() } },
}));

import { computeSellerAvailability, isAcceptingOrders, validateOrderTiming } from '../src/services/availability.service';
import prisma from '../src/config/database';

const countMock = (prisma as any).orderItem.count as jest.Mock;

// 2026-08-03T10:00:00Z is a Monday, 15:00 PKT (UTC+5).
const MONDAY_3PM_PKT = new Date('2026-08-03T10:00:00Z');

function baseSeller(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: 'active',
    scheduleMode: '24_7',
    operatingHours: null,
    availabilityOverride: null,
    availabilityOverrideUntil: null,
    availabilityNote: null,
    ...overrides,
  };
}

describe('computeSellerAvailability', () => {
  it('is always open for 24_7 sellers', () => {
    const result = computeSellerAvailability(baseSeller({ scheduleMode: '24_7' }), MONDAY_3PM_PKT);
    expect(result.status).toBe('open');
    expect(result.isOpen).toBe(true);
  });

  it('treats a non-active seller as closed regardless of schedule', () => {
    const result = computeSellerAvailability(baseSeller({ status: 'suspended', scheduleMode: '24_7' }), MONDAY_3PM_PKT);
    expect(result.isOpen).toBe(false);
    expect(result.status).toBe('closed');
  });

  describe('fixed_daily', () => {
    it('is open within same-day hours (9am-10pm) at 3pm', () => {
      const seller = baseSeller({
        scheduleMode: 'fixed_daily',
        operatingHours: { fixedDaily: { open: '09:00', close: '22:00' } },
      });
      const result = computeSellerAvailability(seller, MONDAY_3PM_PKT);
      expect(result.isOpen).toBe(true);
      // Closes today at 22:00 PKT = 17:00 UTC same day
      expect(result.closesAt?.toISOString()).toBe('2026-08-03T17:00:00.000Z');
    });

    it('is closed before opening hours and reports todays opening time', () => {
      const seller = baseSeller({
        scheduleMode: 'fixed_daily',
        operatingHours: { fixedDaily: { open: '09:00', close: '22:00' } },
      });
      // 6am PKT = 01:00 UTC same day
      const sixAmPkt = new Date('2026-08-03T01:00:00Z');
      const result = computeSellerAvailability(seller, sixAmPkt);
      expect(result.isOpen).toBe(false);
      expect(result.opensAt?.toISOString()).toBe('2026-08-03T04:00:00.000Z'); // 09:00 PKT same day
    });

    it('is closed after hours and reports tomorrows opening time', () => {
      const seller = baseSeller({
        scheduleMode: 'fixed_daily',
        operatingHours: { fixedDaily: { open: '09:00', close: '22:00' } },
      });
      // 11pm PKT = 18:00 UTC same day
      const elevenPmPkt = new Date('2026-08-03T18:00:00Z');
      const result = computeSellerAvailability(seller, elevenPmPkt);
      expect(result.isOpen).toBe(false);
      expect(result.opensAt?.toISOString()).toBe('2026-08-04T04:00:00.000Z'); // 09:00 PKT next day
    });

    it('handles an overnight window (6pm-2am, home-kitchen delivery-only-evening case)', () => {
      const seller = baseSeller({
        scheduleMode: 'fixed_daily',
        operatingHours: { fixedDaily: { open: '18:00', close: '02:00' } },
      });
      // 8pm PKT = 15:00 UTC same day -> open, closes at 02:00 PKT NEXT day
      const eightPmPkt = new Date('2026-08-03T15:00:00Z');
      const openResult = computeSellerAvailability(seller, eightPmPkt);
      expect(openResult.isOpen).toBe(true);
      expect(openResult.closesAt?.toISOString()).toBe('2026-08-03T21:00:00.000Z'); // 02:00 PKT Aug 4 = 21:00 UTC Aug 3

      // 1am PKT = 20:00 UTC previous day -> still open (rolled past midnight), closes today at 02:00 PKT
      const oneAmPkt = new Date('2026-08-02T20:00:00Z');
      const stillOpen = computeSellerAvailability(seller, oneAmPkt);
      expect(stillOpen.isOpen).toBe(true);

      // 10am PKT -> closed (in the daytime gap), opens today at 18:00 PKT
      const tenAmPkt = new Date('2026-08-03T05:00:00Z');
      const closedResult = computeSellerAvailability(seller, tenAmPkt);
      expect(closedResult.isOpen).toBe(false);
      expect(closedResult.opensAt?.toISOString()).toBe('2026-08-03T13:00:00.000Z'); // 18:00 PKT same day
    });
  });

  describe('per_day with multiple sessions', () => {
    const weeklySchedule = {
      scheduleMode: 'per_day',
      operatingHours: {
        weekly: {
          monday: {
            closed: false,
            sessions: [
              { name: 'Breakfast', open: '07:00', close: '10:30' },
              { name: 'Lunch', open: '12:00', close: '15:00' },
              { name: 'Dinner', open: '18:00', close: '22:00' },
            ],
          },
          tuesday: { closed: false, sessions: [{ name: 'Lunch', open: '12:00', close: '15:00' }] },
          sunday: { closed: true, sessions: [] },
        },
      },
    };

    it('is open during the lunch session at exactly 3pm PKT (Monday)', () => {
      // MONDAY_3PM_PKT = 15:00 PKT, which is exactly the lunch session's close boundary (12:00-15:00) -> should be closed at 15:00 exactly (exclusive end)
      const result = computeSellerAvailability(baseSeller(weeklySchedule), MONDAY_3PM_PKT);
      expect(result.isOpen).toBe(false);
    });

    it('is open mid-lunch-session (1pm PKT Monday)', () => {
      const onePmPkt = new Date('2026-08-03T08:00:00Z'); // 13:00 PKT
      const result = computeSellerAvailability(baseSeller(weeklySchedule), onePmPkt);
      expect(result.isOpen).toBe(true);
      expect(result.closesAt?.toISOString()).toBe('2026-08-03T10:00:00.000Z'); // 15:00 PKT
    });

    it('is closed during the break between lunch and dinner, and reports dinners start as next opening', () => {
      const fourPmPkt = new Date('2026-08-03T11:00:00Z'); // 16:00 PKT, between lunch(close 15:00) and dinner(open 18:00)
      const result = computeSellerAvailability(baseSeller(weeklySchedule), fourPmPkt);
      expect(result.isOpen).toBe(false);
      expect(result.opensAt?.toISOString()).toBe('2026-08-03T13:00:00.000Z'); // 18:00 PKT same day (dinner)
    });

    it('is closed after the last session and reports the NEXT DAYs first session (Tuesday lunch)', () => {
      const elevenPmMonday = new Date('2026-08-03T18:00:00Z'); // 23:00 PKT Monday, after dinner ends at 22:00
      const result = computeSellerAvailability(baseSeller(weeklySchedule), elevenPmMonday);
      expect(result.isOpen).toBe(false);
      // Tuesday's only session is Lunch 12:00 -> Aug 4 12:00 PKT = Aug 4 07:00 UTC
      expect(result.opensAt?.toISOString()).toBe('2026-08-04T07:00:00.000Z');
    });

    it('is closed all day on a day marked closed:true (Sunday) and skips to the next open day', () => {
      // Sunday Aug 2 2026, any time e.g. noon PKT = 07:00 UTC
      const sundayNoonPkt = new Date('2026-08-02T07:00:00Z');
      const result = computeSellerAvailability(baseSeller(weeklySchedule), sundayNoonPkt);
      expect(result.isOpen).toBe(false);
      // Next day with sessions is Monday breakfast at 07:00 PKT = Aug 3 02:00 UTC
      expect(result.opensAt?.toISOString()).toBe('2026-08-03T02:00:00.000Z');
    });
  });

  describe('manual override', () => {
    it('forces open regardless of a closed schedule', () => {
      const seller = baseSeller({
        scheduleMode: 'per_day',
        operatingHours: { weekly: { monday: { closed: true, sessions: [] } } },
        availabilityOverride: 'open',
      });
      const result = computeSellerAvailability(seller, MONDAY_3PM_PKT);
      expect(result.isOpen).toBe(true);
      expect(result.isManualOverride).toBe(true);
    });

    it('reports vacation status while override is active and in the future', () => {
      const seller = baseSeller({
        availabilityOverride: 'vacation',
        availabilityOverrideUntil: new Date('2026-08-10T00:00:00Z'),
        availabilityNote: 'Back on the 10th',
      });
      const result = computeSellerAvailability(seller, MONDAY_3PM_PKT);
      expect(result.status).toBe('vacation');
      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe('Back on the 10th');
    });

    it('ignores an expired override and falls back to the computed schedule', () => {
      const seller = baseSeller({
        scheduleMode: '24_7',
        availabilityOverride: 'vacation',
        availabilityOverrideUntil: new Date('2026-08-01T00:00:00Z'), // in the past relative to MONDAY_3PM_PKT
      });
      const result = computeSellerAvailability(seller, MONDAY_3PM_PKT);
      expect(result.status).toBe('open');
      expect(result.isManualOverride).toBe(false);
    });
  });
});

describe('isAcceptingOrders', () => {
  beforeEach(() => countMock.mockReset());

  it('refuses when the seller is closed', async () => {
    const seller = { ...baseSeller({ scheduleMode: '24_7', status: 'inactive' }), id: 's1', orderCutoffTime: null, maxDailyOrders: null, preOrderOnly: false };
    const result = await isAcceptingOrders(seller, MONDAY_3PM_PKT);
    expect(result.accepting).toBe(false);
  });

  it('accepts when open with no cutoff/cap/preorder constraints', async () => {
    const seller = { ...baseSeller({ scheduleMode: '24_7' }), id: 's1', orderCutoffTime: null, maxDailyOrders: null, preOrderOnly: false };
    const result = await isAcceptingOrders(seller, MONDAY_3PM_PKT);
    expect(result.accepting).toBe(true);
  });

  it('refuses once the order cutoff time has passed today', async () => {
    const seller = { ...baseSeller({ scheduleMode: '24_7' }), id: 's1', orderCutoffTime: '14:00', maxDailyOrders: null, preOrderOnly: false };
    const result = await isAcceptingOrders(seller, MONDAY_3PM_PKT); // 15:00 PKT, past 14:00 cutoff
    expect(result.accepting).toBe(false);
    expect(result.reason).toMatch(/14:00/);
  });

  it('accepts before the cutoff time', async () => {
    const seller = { ...baseSeller({ scheduleMode: '24_7' }), id: 's1', orderCutoffTime: '16:00', maxDailyOrders: null, preOrderOnly: false };
    const result = await isAcceptingOrders(seller, MONDAY_3PM_PKT); // 15:00 PKT, before 16:00 cutoff
    expect(result.accepting).toBe(true);
  });

  it('refuses once the daily order cap is reached', async () => {
    countMock.mockResolvedValue(30);
    const seller = { ...baseSeller({ scheduleMode: '24_7' }), id: 's1', orderCutoffTime: null, maxDailyOrders: 30, preOrderOnly: false };
    const result = await isAcceptingOrders(seller, MONDAY_3PM_PKT);
    expect(result.accepting).toBe(false);
    expect(result.reason).toMatch(/30-order/);
  });

  it('accepts when under the daily order cap', async () => {
    countMock.mockResolvedValue(29);
    const seller = { ...baseSeller({ scheduleMode: '24_7' }), id: 's1', orderCutoffTime: null, maxDailyOrders: 30, preOrderOnly: false };
    const result = await isAcceptingOrders(seller, MONDAY_3PM_PKT);
    expect(result.accepting).toBe(true);
  });

  it('refuses an immediate order from an open, preOrderOnly seller with no delivery date', async () => {
    // Regression test: preOrderOnly used to only be checked inside the
    // "!isOpen" branch, so an OPEN preOrderOnly seller (e.g. 24_7) showed
    // customers isAcceptingOrders:true for an immediate order, while checkout
    // (validateOrderTiming) rejected that same immediate order — a false
    // "accepting orders" signal. Being open just means it's working through
    // prep, not that it takes same-day orders.
    const seller = { ...baseSeller({ scheduleMode: '24_7' }), id: 's1', orderCutoffTime: null, maxDailyOrders: null, preOrderOnly: true };
    const result = await isAcceptingOrders(seller, MONDAY_3PM_PKT);
    expect(result.accepting).toBe(false);
  });

  it('accepts a genuinely valid future slot from an open, preOrderOnly seller', async () => {
    const seller = { ...baseSeller({ scheduleMode: '24_7' }), id: 's1', orderCutoffTime: null, maxDailyOrders: null, preOrderOnly: true };
    const result = await isAcceptingOrders(seller, MONDAY_3PM_PKT, '2026-08-05');
    expect(result.accepting).toBe(true);
  });

  it('refuses a "preorder_only" override with no delivery date (not just isOpen:false)', async () => {
    const seller = {
      ...baseSeller({ scheduleMode: '24_7', availabilityOverride: 'preorder_only' }),
      id: 's1', orderCutoffTime: null, maxDailyOrders: null, preOrderOnly: false,
    };
    const result = await isAcceptingOrders(seller, MONDAY_3PM_PKT);
    expect(result.accepting).toBe(false);
  });

  it('accepts a "preorder_only" override when a genuinely future delivery date is given', async () => {
    // Regression test: this override used to be treated exactly like
    // closed/busy/vacation/holiday and reject unconditionally, blocking every
    // pre-order a "preorder_only" seller was supposed to still take.
    const seller = {
      ...baseSeller({ scheduleMode: '24_7', availabilityOverride: 'preorder_only' }),
      id: 's1', orderCutoffTime: null, maxDailyOrders: null, preOrderOnly: false,
    };
    const result = await isAcceptingOrders(seller, MONDAY_3PM_PKT, '2026-08-05');
    expect(result.accepting).toBe(true);
  });

  it('still refuses a genuinely closed override even with a future delivery date', async () => {
    const seller = {
      ...baseSeller({ scheduleMode: '24_7', availabilityOverride: 'closed' }),
      id: 's1', orderCutoffTime: null, maxDailyOrders: null, preOrderOnly: false,
    };
    const result = await isAcceptingOrders(seller, MONDAY_3PM_PKT, '2026-08-05');
    expect(result.accepting).toBe(false);
  });

  it('accepts a preOrderOnly seller with a closed schedule when given a future delivery date', async () => {
    // Same bug, different trigger: a permanently pre-order-only kitchen whose
    // fixed_daily hours say "closed right now" must still take bookings ahead.
    const seller = {
      ...baseSeller({ scheduleMode: 'fixed_daily', operatingHours: { fixedDaily: { open: '02:00', close: '03:00' } } }),
      id: 's1', orderCutoffTime: null, maxDailyOrders: null, preOrderOnly: true,
    };
    const result = await isAcceptingOrders(seller, MONDAY_3PM_PKT, '2026-08-05');
    expect(result.accepting).toBe(true);
  });

  it('refuses a preOrderOnly seller with a closed schedule and no delivery date', async () => {
    const seller = {
      ...baseSeller({ scheduleMode: 'fixed_daily', operatingHours: { fixedDaily: { open: '02:00', close: '03:00' } } }),
      id: 's1', orderCutoffTime: null, maxDailyOrders: null, preOrderOnly: true,
    };
    const result = await isAcceptingOrders(seller, MONDAY_3PM_PKT);
    expect(result.accepting).toBe(false);
  });
});

describe('validateOrderTiming', () => {
  it('is always valid when the seller has no pre-order/advance-booking rules', () => {
    const seller = { preOrderOnly: false, advanceBookingMinDays: null, advanceBookingMaxDays: null };
    expect(validateOrderTiming(seller, undefined, MONDAY_3PM_PKT).valid).toBe(true);
  });

  it('rejects a pre-order-only seller with no delivery date given', () => {
    const seller = { preOrderOnly: true, advanceBookingMinDays: null, advanceBookingMaxDays: null };
    expect(validateOrderTiming(seller, undefined, MONDAY_3PM_PKT).valid).toBe(false);
  });

  it('accepts a pre-order-only sellers delivery date exactly 1 day ahead (default min)', () => {
    const seller = { preOrderOnly: true, advanceBookingMinDays: null, advanceBookingMaxDays: null };
    const result = validateOrderTiming(seller, '2026-08-04', MONDAY_3PM_PKT);
    expect(result.valid).toBe(true);
  });

  it('rejects a date beyond the max advance-booking window', () => {
    const seller = { preOrderOnly: false, advanceBookingMinDays: 0, advanceBookingMaxDays: 3 };
    const result = validateOrderTiming(seller, '2026-08-10', MONDAY_3PM_PKT); // 7 days ahead
    expect(result.valid).toBe(false);
  });

  it('rejects a date sooner than the configured minimum advance', () => {
    const seller = { preOrderOnly: false, advanceBookingMinDays: 2, advanceBookingMaxDays: 7 };
    const result = validateOrderTiming(seller, '2026-08-04', MONDAY_3PM_PKT); // only 1 day ahead
    expect(result.valid).toBe(false);
  });
});
