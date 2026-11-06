'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface StockRow {
  id: string;
  name: string;
  stockQuantity: number;
  isActive: boolean;
}

/**
 * The Stock tab: one line per dish with how many are left, a − / number / + stepper and "Sold out", saved in place. Prices, photos
 * and the rest of a dish live on the Dishes tab; this list is only for counting.
 */
export function StockList({
  rows,
  saving,
  onSave,
}: {
  rows: StockRow[];
  saving: Record<string, boolean>;
  onSave: (id: string, stock: number) => Promise<void>;
}) {
  // Counts typed but not saved yet, by dish.
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const setDraft = (id: string, value: number) => setDrafts((prev) => ({ ...prev, [id]: Math.max(0, value) }));

  const save = async (id: string, value: number) => {
    await onSave(id, value);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const stepClass =
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line-strong bg-surface text-ink hover:bg-raised disabled:opacity-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40';

  return (
    <ul className="divide-y divide-line rounded-[20px] border border-line bg-surface shadow-[var(--shadow-card)]">
      {rows.map((row) => {
        const value = drafts[row.id] ?? row.stockQuantity;
        const changed = value !== row.stockQuantity;
        const busy = !!saving[row.id];
        const tone =
          row.stockQuantity === 0
            ? 'bg-red-50 text-red-700'
            : row.stockQuantity <= 10
              ? 'bg-accent-soft text-accent-soft-ink'
              : 'bg-raised text-muted';
        return (
          <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1 basis-40">
              <Link href={`/sellers/products/${row.id}/edit`} className="font-medium text-ink hover:underline">
                {row.name}
              </Link>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${tone}`}>
                  {row.stockQuantity === 0 ? 'Sold out' : `${row.stockQuantity} left`}
                </span>
                {!row.isActive && <span>Hidden from customers</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={stepClass}
                onClick={() => setDraft(row.id, value - 1)}
                disabled={busy || value === 0}
                aria-label={`One fewer ${row.name}`}
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <label htmlFor={`stock-count-${row.id}`} className="sr-only">
                How many {row.name} you have
              </label>
              <input
                id={`stock-count-${row.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                value={value}
                onChange={(e) => setDraft(row.id, parseInt(e.target.value, 10) || 0)}
                disabled={busy}
                className="h-11 w-16 rounded-xl border border-line-strong bg-surface text-center text-[15px] font-semibold text-ink tabular-nums focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand/30"
              />
              <button
                type="button"
                className={stepClass}
                onClick={() => setDraft(row.id, value + 1)}
                disabled={busy}
                aria-label={`One more ${row.name}`}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
              {changed ? (
                <Button onClick={() => save(row.id, value)} disabled={busy} className="min-w-20 px-4">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" /> : 'Save'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => save(row.id, 0)}
                  disabled={busy || row.stockQuantity === 0}
                  className="min-w-20 px-4"
                >
                  Sold out
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
