/**
 * Menu types: when a dish can be ordered.
 *  - fixed:  always on the menu;
 *  - weekly: only on the days of the week the kitchen picked (0 = Sunday ... 6 = Saturday);
 *  - daily:  only on the date the kitchen put it on the menu (menuDate).
 * "Today" is Pakistan time, whatever the server's clock zone is.
 */
import { AppError } from '../middleware/errorHandler';

export type MenuType = 'fixed' | 'weekly' | 'daily';
export const MENU_TYPES: MenuType[] = ['fixed', 'weekly', 'daily'];
const TZ = 'Asia/Karachi';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface MenuFields {
  menuType?: string | null;
  availableDays?: number[] | null;
  menuDate?: Date | null;
}

/** The calendar date (as UTC midnight, matching a DATE column) and weekday in Pakistan for an instant. */
export function karachiDay(now: Date = new Date()): { date: Date; ymd: string; weekday: number } {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const date = new Date(`${ymd}T00:00:00.000Z`);
  return { date, ymd, weekday: date.getUTCDay() };
}

/** Whether a dish is on the menu on the day of `at` (default now). */
export function isOnMenu(product: MenuFields, at: Date = new Date()): boolean {
  const type = product.menuType ?? 'fixed';
  if (type === 'weekly') return (product.availableDays ?? []).includes(karachiDay(at).weekday);
  if (type === 'daily') return !!product.menuDate && product.menuDate.getTime() === karachiDay(at).date.getTime();
  return true;
}

/** The same rule as a Prisma `where` fragment, for listings. */
export function onMenuWhere(at: Date = new Date()) {
  const { date, weekday } = karachiDay(at);
  return {
    OR: [
      { menuType: 'fixed' },
      { menuType: 'weekly', availableDays: { has: weekday } },
      { menuType: 'daily', menuDate: date },
    ],
  };
}

/** A short line for the dish: "Today only", "Mon, Wed, Fri", or null for a fixed menu. */
export function menuNote(product: MenuFields): string | null {
  const type = product.menuType ?? 'fixed';
  if (type === 'daily') return "Today's menu";
  if (type === 'weekly') return [...(product.availableDays ?? [])].sort().map((d) => WEEKDAYS[d].slice(0, 3)).join(', ') || null;
  return null;
}

export function assertOnMenu(product: MenuFields & { name: string }, at: Date = new Date()) {
  if (!isOnMenu(product, at)) {
    throw new AppError(`${product.name} is not on the menu today`, 400, 'NOT_ON_MENU_TODAY');
  }
}

/**
 * Turn what a seller sent into the columns to save. `menuDate` may be 'today', null or a date.
 * A weekly dish needs at least one day. Only keys that were sent (or implied) are returned.
 */
export function normalizeMenuInput(
  input: { menuType?: string; availableDays?: number[]; menuDate?: string | null },
  existing?: MenuFields
): { menuType?: string; availableDays?: number[]; menuDate?: Date | null } {
  const out: { menuType?: string; availableDays?: number[]; menuDate?: Date | null } = {};
  const type = (input.menuType ?? existing?.menuType ?? 'fixed') as MenuType;
  if (!MENU_TYPES.includes(type)) throw new AppError('Menu type must be fixed, weekly or daily', 400, 'INVALID_MENU_TYPE');
  if (input.menuType !== undefined) out.menuType = type;

  if (input.availableDays !== undefined) out.availableDays = [...new Set(input.availableDays)].sort((a, b) => a - b);
  const days = out.availableDays ?? existing?.availableDays ?? [];
  if (type === 'weekly' && days.length === 0) {
    throw new AppError('Pick at least one day of the week for a weekly dish', 400, 'MENU_DAYS_REQUIRED');
  }

  if (input.menuDate !== undefined) {
    out.menuDate = input.menuDate === null ? null : input.menuDate === 'today' ? karachiDay().date : new Date(`${input.menuDate}T00:00:00.000Z`);
  }
  // A fixed menu has no schedule left over from an earlier type.
  if (type === 'fixed' && input.menuType !== undefined) {
    out.availableDays = [];
    out.menuDate = null;
  }
  return out;
}
