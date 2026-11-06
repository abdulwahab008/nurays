'use client';

export interface AdminTab<T extends string> {
  id: T;
  label: string;
  /** Shown beside the label; null or undefined shows nothing (the count is not known). */
  count?: number | null;
  /** The count is work waiting for the admin, so it is drawn in the "waiting" colour. */
  waiting?: boolean;
}

/** The underlined tabs of the staff screens (as on the rider dashboard), with an optional count on each. */
export function AdminFilterTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className = '',
}: {
  tabs: ReadonlyArray<AdminTab<T>>;
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`flex gap-6 border-b border-line overflow-x-auto [scrollbar-width:none] ${className}`}>
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`relative -mb-px flex items-center gap-2 min-h-11 pb-1 text-[15px] whitespace-nowrap border-b-2 transition-colors ${
              selected ? 'border-brand-600 text-ink font-semibold' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={`min-w-6 px-1.5 py-0.5 rounded-full text-xs font-semibold tabular-nums ${
                  tab.waiting && tab.count > 0 ? 'bg-accent-soft text-accent-soft-ink' : 'bg-raised text-muted'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
