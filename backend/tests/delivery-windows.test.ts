/**
 * Delivery windows come from the kitchen's own opening hours: checkout offers them and placing an order checks them
 * (utils/deliveryWindows.ts). Times are Pakistan time (UTC+5).
 */
import { deliveryDays, windowProblem, windowStartMinutes, windowsOnWeekday } from '../src/utils/deliveryWindows';
import { readyBy } from '../src/utils/preOrder';

// Friday 2026-11-06 12:40 in Pakistan is 07:40 UTC.
const LUNCHTIME_PKT = new Date('2026-11-06T07:40:00Z');
// Saturday 2026-11-07 02:00 in Pakistan is still 2026-11-06 in UTC.
const AFTER_MIDNIGHT_PKT = new Date('2026-11-06T21:00:00Z');
const FRIDAY = 5;

const allDay = { scheduleMode: '24_7', operatingHours: null };
const keys = (windows: { key: string }[]) => windows.map((w) => w.key);

describe('windows from the kitchen hours', () => {
  it('a kitchen open all day gets morning, afternoon and evening', () => {
    expect(keys(windowsOnWeekday(allDay, FRIDAY))).toEqual(['09:00-12:00', '12:00-17:00', '17:00-21:30']);
  });

  it('the standard windows are cut to the hours a kitchen is open', () => {
    const tenToThree = { scheduleMode: 'fixed_daily', operatingHours: { fixedDaily: { open: '10:00', close: '15:00' } } };
    const windows = windowsOnWeekday(tenToThree, FRIDAY);
    expect(keys(windows)).toEqual(['10:00-12:00', '12:00-15:00']);
    expect(windows.map((w) => w.name)).toEqual(['morning', 'afternoon']);
  });

  it('several sessions in a day are each a window, under the kitchen\'s names', () => {
    const lunchAndDinner = {
      scheduleMode: 'per_day',
      operatingHours: { weekly: { friday: { closed: false, sessions: [{ name: 'Dinner', open: '19:00', close: '22:00' }, { name: 'Lunch', open: '12:00', close: '15:00' }] } } },
    };
    const windows = windowsOnWeekday(lunchAndDinner, FRIDAY);
    expect(keys(windows)).toEqual(['12:00-15:00', '19:00-22:00']);
    expect(windows.map((w) => w.label)).toEqual(['Lunch', 'Dinner']);
  });

  it('a closed day has none, and a late session outside the standard windows is one window', () => {
    const lateNights = { scheduleMode: 'per_day', operatingHours: { weekly: { friday: { closed: false, sessions: [{ name: 'Open', open: '22:00', close: '23:30' }] }, saturday: { closed: true, sessions: [] } } } };
    expect(keys(windowsOnWeekday(lateNights, FRIDAY))).toEqual(['22:00-23:30']);
    expect(windowsOnWeekday(lateNights, 6)).toEqual([]);
  });
});

describe('the days checkout offers', () => {
  it('today keeps only windows the kitchen can still cook for, and none after its cut-off', () => {
    const days = deliveryDays({ ...allDay, minPrepTimeMinutes: 60 }, 0, 1, LUNCHTIME_PKT);
    expect(days[0].date).toBe('2026-11-06');
    expect(keys(days[0].windows)).toEqual(['12:00-17:00', '17:00-21:30']);
    expect(keys(days[1].windows)).toHaveLength(3);
    const cutOff = deliveryDays({ ...allDay, orderCutoffTime: '12:00' }, 0, 1, LUNCHTIME_PKT);
    expect(cutOff.map((d) => d.date)).toEqual(['2026-11-07']);
  });
});

describe('checking the window an order asks for', () => {
  const tenToThree = { scheduleMode: 'fixed_daily', operatingHours: { fixedDaily: { open: '10:00', close: '15:00' } } };

  it('refuses a time the kitchen does not deliver, or one that has passed', () => {
    expect(windowProblem(tenToThree, '17:00-21:30', '2026-11-07', LUNCHTIME_PKT)).toMatch(/does not deliver/);
    expect(windowProblem(tenToThree, '10:00-12:00', undefined, LUNCHTIME_PKT)).toMatch(/passed/);
    expect(windowProblem(tenToThree, '12:00-15:00', undefined, LUNCHTIME_PKT)).toBeNull();
    expect(windowProblem(tenToThree, '10:00-12:00', '2026-11-07', LUNCHTIME_PKT)).toBeNull();
  });

  it('works out today in Pakistan time, and still accepts an old named window by its hours', () => {
    expect(windowProblem(allDay, 'morning', '2026-11-06', AFTER_MIDNIGHT_PKT)).toMatch(/day has already passed/);
    expect(windowProblem(allDay, 'morning', undefined, AFTER_MIDNIGHT_PKT)).toBeNull();
    expect(windowProblem(allDay, 'morning', undefined, LUNCHTIME_PKT)).toMatch(/passed/);
    expect(windowProblem(allDay, undefined, undefined, LUNCHTIME_PKT)).toBeNull();
  });

  it('the kitchen starts on a booked order from the window\'s own start', () => {
    expect(windowStartMinutes('19:00-22:00')).toBe(19 * 60);
    expect(windowStartMinutes('evening')).toBe(17 * 60);
    expect(windowStartMinutes(null)).toBeUndefined();
  });
});

describe('when an accepted order should be ready', () => {
  it('a booked order is ready when its window opens, not prep time from now', () => {
    const tomorrowDinner = { deliverySlotDate: new Date('2026-11-07T00:00:00Z'), deliverySlotTime: '19:00-22:00' };
    // 19:00 on the 7th in Pakistan is 14:00 UTC.
    expect(readyBy(tomorrowDinner, 20, LUNCHTIME_PKT).toISOString()).toBe('2026-11-07T14:00:00.000Z');
  });

  it('an order for now, or a window already open, is ready after its prep time', () => {
    expect(readyBy({ deliverySlotDate: null, deliverySlotTime: null }, 20, LUNCHTIME_PKT).toISOString()).toBe('2026-11-06T08:00:00.000Z');
    const lunchToday = { deliverySlotDate: new Date('2026-11-06T00:00:00Z'), deliverySlotTime: '12:00-15:00' };
    expect(readyBy(lunchToday, 20, LUNCHTIME_PKT).toISOString()).toBe('2026-11-06T08:00:00.000Z');
  });
});
