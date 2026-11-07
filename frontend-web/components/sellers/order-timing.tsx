'use client';

import { useEffect, useState } from 'react';
import { useLocale, useT } from '@/lib/i18n';
import { kitchenOrderMessages } from '@/lib/i18n/messages/kitchen-orders';
import { cn, formatTime } from '@/lib/utils';

/** The rider on an order as the kitchen API gives it: a first name and how far the pickup has got. */
export interface KitchenOrderRider {
  name: string | null;
  status: string;
  arrivedAtPickup?: string | null;
  pickedUpAt?: string | null;
}

/** The current time, moving on every half minute, so "4 min ago" and "5 min late" stay true while the screen is open. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const intlLocale = (locale: string) => (locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK');

/** "6 Nov", the year only when it is not this one. */
export function shortDay(date: string | Date, locale: string): string {
  const d = new Date(date);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }) }).format(d);
}

/** "6 Nov, 9:05 pm" (the year only when it is not this one), the time kept in one piece in Urdu as formatTime keeps it. */
export function dateClock(iso: string | Date, locale: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${shortDay(d, locale)}${locale === 'ur' ? '، ' : ', '}${formatTime(d)}`;
}

/** "Today", "Yesterday", then "6 Nov": the heading over a day's orders. */
export function useDayLabel() {
  const t = useT(kitchenOrderMessages);
  const { locale } = useLocale();
  return (iso: string, now: number) => {
    const d = new Date(iso);
    const today = new Date(now);
    if (d.toDateString() === today.toDateString()) return t('list.today');
    today.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return t('list.yesterday');
    return shortDay(d, locale);
  };
}

/** The clock time for today, with the date in front for anything older ("6 Nov, 12:42 PM" read after midnight). */
function whenShort(iso: string, now: number, locale: string): string {
  return new Date(iso).toDateString() === new Date(now).toDateString() ? formatTime(iso) : dateClock(iso, locale);
}

/** An order number that fits a phone row: "#…1255" there, the whole number from sm up. */
export function OrderNo({ number }: { number: string }) {
  return (
    <bdi dir="ltr">
      <span className="sm:hidden">#…{number.slice(-4)}</span>
      <span className="hidden sm:inline">#{number}</span>
    </bdi>
  );
}

/** "Just now", "12 min ago", then the clock time once it is more than an hour old. */
export function useAge() {
  const t = useT(kitchenOrderMessages);
  const { locale } = useLocale();
  return (iso: string, now: number) => {
    const min = Math.floor((now - new Date(iso).getTime()) / 60_000);
    if (min < 1) return t('list.justNow');
    if (min < 60) return t('list.minAgo', { min });
    return whenShort(iso, now, locale);
  };
}

/** How long ready food has waited: "Ready 6 min ago", "Ready since 9:05 pm" after an hour, "Ready since 6 Nov" from an earlier day. */
export function useReadyFor() {
  const t = useT(kitchenOrderMessages);
  const { locale } = useLocale();
  return (iso: string, now: number) => {
    const min = Math.floor((now - new Date(iso).getTime()) / 60_000);
    if (min < 1) return t('list.readyJustNow');
    if (min < 60) return t('list.readyMinAgo', { min });
    const today = new Date(iso).toDateString() === new Date(now).toDateString();
    return t('list.readySince', { time: today ? formatTime(iso) : shortDay(iso, locale) });
  };
}

/** "Ready by 8:40 pm", or "5 min late" in red once that time has passed. */
export function ReadyBy({ at, now }: { at: string; now: number }) {
  const t = useT(kitchenOrderMessages);
  const lateMin = Math.floor((now - new Date(at).getTime()) / 60_000);
  if (lateMin >= 1) return <span className="font-semibold text-red-700">{t('list.late', { min: lateMin })}</span>;
  return <span className="text-ink">{t('list.readyBy', { time: formatTime(at) })}</span>;
}

/** Who is collecting a ready order, and how far they have got. */
export function RiderStatus({ rider, className = '' }: { rider: KitchenOrderRider | null | undefined; className?: string }) {
  const t = useT(kitchenOrderMessages);
  if (!rider) return null;
  const name = rider.name;
  let text: string;
  if (rider.pickedUpAt) {
    const time = formatTime(rider.pickedUpAt);
    text = name ? t('rider.pickedUp', { name, time }) : t('rider.pickedUpNoName', { time });
  } else if (rider.arrivedAtPickup || rider.status === 'arrived_at_pickup') {
    text = name ? t('rider.here', { name }) : t('rider.hereNoName');
  } else if (rider.status === 'pending' || !name) {
    text = rider.status === 'pending' ? t('rider.finding') : t('rider.comingNoName');
  } else {
    text = t('rider.coming', { name });
  }
  return <p className={cn('text-sm text-ink', className)}>{text}</p>;
}

const PREP_CHOICES = [15, 20, 30, 45, 60];

/** The accept endpoint takes 5 to 240 minutes, so a suggestion outside that is pulled into range. */
export function fitPrepMinutes(min: number): number {
  return Math.min(240, Math.max(5, Math.round(min)));
}

/** The minutes the kitchen says it needs, chosen with one tap before it accepts; the dishes' own time is picked first. */
export function PrepTimePicker({
  suggested,
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  suggested: number;
  value: number;
  onChange: (min: number) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const t = useT(kitchenOrderMessages);
  const fitted = fitPrepMinutes(suggested);
  const options = Array.from(new Set([...PREP_CHOICES, fitted])).sort((a, b) => a - b);
  return (
    <fieldset disabled={disabled}>
      <legend id={`${idPrefix}-prep-label`} className="text-sm text-muted">{t('prep.label')}</legend>
      <div role="radiogroup" aria-labelledby={`${idPrefix}-prep-label`} className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((min) => {
          const selected = value === min;
          return (
            <button
              key={min}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t('prep.option', { min })}
              onClick={() => onChange(min)}
              className={`min-w-11 h-11 px-2 rounded-xl text-[15px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 disabled:opacity-60 ${
                selected ? 'bg-brand-soft text-brand-soft-ink font-semibold ring-1 ring-inset ring-brand-600' : 'bg-raised text-ink hover:bg-line'
              }`}
            >
              {min}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
