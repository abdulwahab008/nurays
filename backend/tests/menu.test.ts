/** Menu types: fixed always, weekly on chosen days, daily only on the date put on the menu (Pakistan time). */
import { isOnMenu, karachiDay, menuNote, normalizeMenuInput, onMenuWhere } from '../src/utils/menu';

// 2026-10-05 is a Monday. 20:00 UTC on the 4th is already 01:00 on the 5th in Karachi (UTC+5).
const mondayKarachi = new Date('2026-10-04T20:00:00Z');
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe('menu day in Pakistan time', () => {
  it('uses the Karachi calendar day, not the server clock', () => {
    expect(karachiDay(mondayKarachi)).toMatchObject({ ymd: '2026-10-05', weekday: 1 });
    expect(karachiDay(new Date('2026-10-05T18:59:00Z')).ymd).toBe('2026-10-05');
    expect(karachiDay(new Date('2026-10-05T19:01:00Z')).ymd).toBe('2026-10-06');
  });
});

describe('isOnMenu', () => {
  it('a fixed dish is always on the menu', () => {
    expect(isOnMenu({ menuType: 'fixed' }, mondayKarachi)).toBe(true);
    expect(isOnMenu({}, mondayKarachi)).toBe(true);
  });
  it('a weekly dish is on its days only', () => {
    expect(isOnMenu({ menuType: 'weekly', availableDays: [1, 3] }, mondayKarachi)).toBe(true);
    expect(isOnMenu({ menuType: 'weekly', availableDays: [2, 4] }, mondayKarachi)).toBe(false);
    expect(isOnMenu({ menuType: 'weekly', availableDays: [] }, mondayKarachi)).toBe(false);
  });
  it("a daily dish is on the menu only on the date it was put on", () => {
    expect(isOnMenu({ menuType: 'daily', menuDate: day('2026-10-05') }, mondayKarachi)).toBe(true);
    expect(isOnMenu({ menuType: 'daily', menuDate: day('2026-10-04') }, mondayKarachi)).toBe(false);
    expect(isOnMenu({ menuType: 'daily', menuDate: null }, mondayKarachi)).toBe(false);
  });
});

describe('onMenuWhere and menuNote', () => {
  it('lists the three cases for a query', () => {
    expect(onMenuWhere(mondayKarachi).OR).toEqual([
      { menuType: 'fixed' },
      { menuType: 'weekly', availableDays: { has: 1 } },
      { menuType: 'daily', menuDate: day('2026-10-05') },
    ]);
  });
  it('describes the schedule', () => {
    expect(menuNote({ menuType: 'weekly', availableDays: [5, 1, 3] })).toBe('Mon, Wed, Fri');
    expect(menuNote({ menuType: 'daily' })).toBe("Today's menu");
    expect(menuNote({ menuType: 'fixed' })).toBeNull();
  });
});

describe('normalizeMenuInput', () => {
  it('a weekly dish needs a day', () => {
    expect(() => normalizeMenuInput({ menuType: 'weekly' })).toThrow('at least one day');
    expect(normalizeMenuInput({ menuType: 'weekly', availableDays: [3, 1, 3] })).toEqual({ menuType: 'weekly', availableDays: [1, 3] });
  });
  it("'today' becomes today's date; null takes the dish off the menu", () => {
    expect(normalizeMenuInput({ menuDate: 'today' }).menuDate).toEqual(karachiDay().date);
    expect(normalizeMenuInput({ menuDate: null }, { menuType: 'daily' })).toEqual({ menuDate: null });
  });
  it('switching to fixed clears the schedule', () => {
    expect(normalizeMenuInput({ menuType: 'fixed' }, { menuType: 'weekly', availableDays: [1] })).toEqual({ menuType: 'fixed', availableDays: [], menuDate: null });
  });
  it('an existing weekly dish can change its type check against its stored days', () => {
    expect(() => normalizeMenuInput({ menuType: 'weekly' }, { menuType: 'fixed', availableDays: [] })).toThrow();
    expect(normalizeMenuInput({ availableDays: [2] }, { menuType: 'weekly', availableDays: [1] })).toEqual({ availableDays: [2] });
  });
});
