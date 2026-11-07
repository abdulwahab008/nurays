'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export { StatusPill, OrderStatusPill, orderStatusTone } from '@/components/ui/StatusPill';
export type { StatusTone as PillTone } from '@/components/ui/StatusPill';

/** The heading of an admin page drawn inside AdminShell, the same size as the one DashboardLayout draws. */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  badges,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  badges?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="-mt-2 mb-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-ink hover:underline">
          <ChevronLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-[28px] sm:text-[32px] leading-tight font-extrabold tracking-tight text-ink break-words">{title}</h1>
            {badges}
          </div>
          {subtitle && <p className="mt-1.5 text-sm sm:text-[15px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** A figure: a muted label above the number. No tile, no icon. */
export function Figure({ label, value, sub, href }: { label: string; value: ReactNode; sub?: ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-ink tabular-nums">{value}</p>
      {sub != null && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg -m-1 p-1 hover:bg-raised focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

/** Loading: a small spinner with one line. */
export function LoadingLine({ text }: { text: string }) {
  return (
    <div className="py-12 text-center" role="status">
      <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-line border-t-brand-600" />
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

/** "20 kitchens · page 1 of 2" with Previous and Next; only the count when everything fits on one page. */
export function Pager({
  page,
  totalPages,
  total,
  noun,
  one,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  noun: string;
  one: string;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm" data-testid="pager">
      <span className="text-muted">
        {total} {total === 1 ? one : noun}
        {totalPages > 1 && ` · page ${page} of ${totalPages}`}
      </span>
      {totalPages > 1 && (
        <div className="flex gap-2">
          <Button variant="outline" className="min-h-11" disabled={page <= 1} onClick={() => onChange(page - 1)}>
            Previous
          </Button>
          <Button variant="outline" className="min-h-11" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

/** A search field with its button; the search runs when it is sent, not on every key. */
export function SearchForm({ placeholder, label, onSearch }: { placeholder: string; label: string; onSearch: (query: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      role="search"
      className="flex w-full gap-2 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value.trim());
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted sm:w-72 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
      />
      <Button type="submit" variant="outline" className="min-h-11">
        Search
      </Button>
    </form>
  );
}

/** The classes of an outline Button, for a Link that should look like one (a link inside a button is two controls). */
export const outlineLinkClass =
  'inline-flex items-center justify-center gap-2 rounded-xl h-11 px-5 text-sm font-semibold tracking-tight transition-colors bg-transparent text-ink border border-line-strong hover:bg-raised focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40';

/** A placeholder phone (+999…) stands in for "none given"; the server sends null for it. */
export function PhoneText({ phone, className }: { phone: string | null | undefined; className?: string }) {
  return phone ? (
    <a href={`tel:${phone}`} className={cn('inline-flex min-h-11 items-center text-brand-ink hover:underline', className)}>
      {phone}
    </a>
  ) : (
    <span className="text-muted">No phone given</span>
  );
}

/** A row of filter chips: one line that scrolls sideways on a phone, wrapping on wider screens. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ id: T; label: string; problem?: boolean }>;
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id || 'all'}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors ${
              on
                ? 'border-brand bg-brand-soft text-brand-soft-ink'
                : o.problem
                  ? 'border-red-200 bg-surface text-red-700 hover:bg-red-50'
                  : 'border-line bg-surface text-ink hover:bg-raised'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
