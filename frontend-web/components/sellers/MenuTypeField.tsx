'use client';

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

const OPTIONS: Array<{ value: MenuType; icon: string; label: string; desc: string }> = [
  { value: 'fixed', icon: '📌', label: 'Fixed menu', desc: 'Always available' },
  { value: 'weekly', icon: '📅', label: 'Weekly menu', desc: 'Only on the days you choose' },
  { value: 'daily', icon: '🍲', label: 'Daily menu', desc: "Only on days you put it on today's menu" },
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
    <div className="mt-4" data-testid="menu-type-field">
      <label className="block text-sm font-medium text-gray-700 mb-2">Menu type</label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            data-testid={`menu-type-${o.value}`}
            onClick={() => onChange({ ...value, menuType: o.value })}
            className={`p-3 rounded-xl border-2 text-start transition-all ${value.menuType === o.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
          >
            <span className="text-xl">{o.icon}</span>
            <p className="font-medium text-sm text-gray-900 mt-1">{o.label}</p>
            <p className="text-xs text-gray-500">{o.desc}</p>
          </button>
        ))}
      </div>

      {value.menuType === 'weekly' && (
        <div className="mt-3 flex flex-wrap gap-2" data-testid="menu-days">
          {DAYS.map((name, d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${value.availableDays.includes(d) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {value.menuType === 'daily' && (
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={value.onTodaysMenu} onChange={(e) => onChange({ ...value, onTodaysMenu: e.target.checked })} />
          Put this dish on today&apos;s menu now (you can switch it on each day from your product list)
        </label>
      )}
    </div>
  );
}
