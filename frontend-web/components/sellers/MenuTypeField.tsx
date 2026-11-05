'use client';

import { SwitchRow, chipClass, labelClass, optionClass } from '@/components/sellers/product-form/fields';

/** When a dish can be ordered: always (fixed menu), on chosen weekdays (weekly), or only on days the kitchen puts it on the menu (daily). */
export type MenuType = 'fixed' | 'weekly' | 'daily';

export interface MenuValue {
  menuType: MenuType;
  /** 0 = Sunday ... 6 = Saturday */
  availableDays: number[];
  /** Daily dishes: whether the dish is on today's menu. */
  onTodaysMenu: boolean;
}

export const DEFAULT_MENU: MenuValue = { menuType: 'fixed', availableDays: [], onTodaysMenu: false };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const OPTIONS: Array<{ value: MenuType; label: string; desc: string }> = [
  { value: 'fixed', label: 'Fixed menu', desc: 'Always available' },
  { value: 'weekly', label: 'Weekly menu', desc: 'Only on the days you choose' },
  { value: 'daily', label: 'Daily menu', desc: "Only on days you put it on today's menu" },
];

/** What to send the API for this value. */
export function menuPayload(v: MenuValue) {
  return {
    menuType: v.menuType,
    availableDays: v.menuType === 'weekly' ? v.availableDays : [],
    menuDate: v.menuType === 'daily' ? (v.onTodaysMenu ? ('today' as const) : null) : null,
  };
}

/** The error to show before saving, or null. */
export function menuError(v: MenuValue): string | null {
  return v.menuType === 'weekly' && v.availableDays.length === 0 ? 'Pick at least one day for a weekly dish' : null;
}

export default function MenuTypeField({ value, onChange }: { value: MenuValue; onChange: (v: MenuValue) => void }) {
  const toggleDay = (d: number) =>
    onChange({
      ...value,
      availableDays: value.availableDays.includes(d) ? value.availableDays.filter((x) => x !== d) : [...value.availableDays, d].sort(),
    });
  return (
    <div className="mt-6" data-testid="menu-type-field" role="group" aria-labelledby="menu-type-label">
      <p id="menu-type-label" className={labelClass}>
        Menu type
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            data-testid={`menu-type-${o.value}`}
            aria-pressed={value.menuType === o.value}
            onClick={() => onChange({ ...value, menuType: o.value })}
            className={optionClass(value.menuType === o.value)}
          >
            <span className="block text-[15px] font-semibold text-ink">{o.label}</span>
            <span className="mt-0.5 block text-sm text-muted">{o.desc}</span>
          </button>
        ))}
      </div>

      {value.menuType === 'weekly' && (
        <div className="mt-4 flex flex-wrap gap-2" data-testid="menu-days" role="group" aria-label="Days it is available">
          {DAYS.map((name, d) => (
            <button
              key={d}
              type="button"
              aria-pressed={value.availableDays.includes(d)}
              onClick={() => toggleDay(d)}
              className={chipClass(value.availableDays.includes(d))}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {value.menuType === 'daily' && (
        <div className="mt-4">
          <SwitchRow
            checked={value.onTodaysMenu}
            onChange={() => onChange({ ...value, onTodaysMenu: !value.onTodaysMenu })}
            label="On today's menu now"
            hint="You can switch it on each day from your dish list"
          />
        </div>
      )}
    </div>
  );
}
