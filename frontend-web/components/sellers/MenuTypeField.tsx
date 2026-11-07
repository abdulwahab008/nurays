'use client';

import { SwitchRow, chipClass, labelClass, optionClass } from '@/components/sellers/product-form/fields';
import { useLocale, useT } from '@/lib/i18n';
import { kitchenProductFormMessages } from '@/lib/i18n/messages/kitchen-product-form';

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

const OPTIONS: MenuType[] = ['fixed', 'weekly', 'daily'];

/** What to send the API for this value. */
export function menuPayload(v: MenuValue) {
  return {
    menuType: v.menuType,
    availableDays: v.menuType === 'weekly' ? v.availableDays : [],
    menuDate: v.menuType === 'daily' ? (v.onTodaysMenu ? ('today' as const) : null) : null,
  };
}

/** A weekly dish with no day picked: it could never be ordered, so it is not saved. */
export function menuIncomplete(v: MenuValue): boolean {
  return v.menuType === 'weekly' && v.availableDays.length === 0;
}

export default function MenuTypeField({ value, onChange }: { value: MenuValue; onChange: (v: MenuValue) => void }) {
  const t = useT(kitchenProductFormMessages);
  const { locale } = useLocale();
  const dayName = (d: number) =>
    new Intl.DateTimeFormat(locale === 'ur' ? 'ur-PK' : 'en-PK', { weekday: 'short' }).format(new Date(2024, 0, 7 + d));
  const toggleDay = (d: number) =>
    onChange({
      ...value,
      availableDays: value.availableDays.includes(d) ? value.availableDays.filter((x) => x !== d) : [...value.availableDays, d].sort(),
    });
  return (
    <div className="mt-6" data-testid="menu-type-field" role="group" aria-labelledby="menu-type-label">
      <p id="menu-type-label" className={labelClass}>
        {t('menuType')}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {OPTIONS.map((o) => (
          <button
            key={o}
            type="button"
            data-testid={`menu-type-${o}`}
            aria-pressed={value.menuType === o}
            onClick={() => onChange({ ...value, menuType: o })}
            className={optionClass(value.menuType === o)}
          >
            <span className="block text-[15px] font-semibold text-ink">{t(`menu.${o}`)}</span>
            <span className="mt-0.5 block text-sm text-muted">{t(`menu.${o}.desc`)}</span>
          </button>
        ))}
      </div>

      {value.menuType === 'weekly' && (
        <div className="mt-4 flex flex-wrap gap-2" data-testid="menu-days" role="group" aria-label={t('daysAvailable')}>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={value.availableDays.includes(d)}
              onClick={() => toggleDay(d)}
              className={chipClass(value.availableDays.includes(d))}
            >
              {dayName(d)}
            </button>
          ))}
        </div>
      )}

      {value.menuType === 'daily' && (
        <div className="mt-4">
          <SwitchRow
            checked={value.onTodaysMenu}
            onChange={() => onChange({ ...value, onTodaysMenu: !value.onTodaysMenu })}
            label={t('onTodaysMenu')}
            hint={t('onTodaysMenuHint')}
          />
        </div>
      )}
    </div>
  );
}
