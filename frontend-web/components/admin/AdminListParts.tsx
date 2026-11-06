'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export type PillTone = 'neutral' | 'good' | 'waiting' | 'problem';

const PILL_TONE: Record<PillTone, string> = {
  neutral: 'bg-raised text-muted',
  good: 'bg-brand-soft text-brand-soft-ink',
  waiting: 'bg-accent-soft text-accent-soft-ink',
  problem: 'bg-red-50 text-red-700',
};

/** A status as one small pill (the staff-screen rule): grey by default, turquoise done, yellow waiting, red a problem. */
export function StatusPill({ tone = 'neutral', children, className = '' }: { tone?: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${PILL_TONE[tone]} ${className}`}>
      {children}
    </span>
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

/** "20 kitchens · page 1 of 2" with Previous and Next. Nothing when everything fits on one page. */
export function Pager({
  page,
  totalPages,
  total,
  noun,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  noun: string;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm" data-testid="pager">
      <span className="text-muted">
        {total} {noun} · page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" className="min-h-11" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" className="min-h-11" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
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
export function PhoneText({ phone }: { phone: string | null | undefined }) {
  return phone ? (
    <a href={`tel:${phone}`} className="inline-flex min-h-11 items-center text-brand-ink hover:underline">
      {phone}
    </a>
  ) : (
    <span className="text-muted">No phone given</span>
  );
}
