'use client';

export const fieldClass =
  'w-full min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink placeholder:text-muted/70 focus:outline-none focus:ring-3 focus:ring-brand/30 focus:border-brand-600';
export const textareaClass = `${fieldClass} py-2.5 resize-none`;
export const labelClass = 'block text-sm font-medium text-ink mb-1.5';
export const hintClass = 'mt-1.5 text-sm text-muted';

/** A choice laid out as a box (product type, fulfilment); turquoise when picked. */
export const optionClass = (on: boolean) =>
  `min-h-11 rounded-xl border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 ${
    on ? 'border-brand-600 bg-brand-soft' : 'border-line-strong bg-surface hover:bg-raised'
  }`;

export const chipClass = (on: boolean) =>
  `inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full border text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 ${
    on ? 'border-brand-600 bg-brand-soft text-brand-soft-ink font-medium' : 'border-line-strong bg-surface text-ink hover:bg-raised'
  }`;

export function FormSection({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line py-8 first:border-t-0 first:pt-0">
      <h2 id={id} className="text-sm font-semibold text-ink">
        {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** An on/off row, drawn like the dish list's "Showing" switch. */
export function SwitchRow({
  checked,
  onChange,
  label,
  hint,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <span>
        <span className="block text-[15px] text-ink">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || label}
        onClick={onChange}
        className="w-12 min-h-11 shrink-0 flex items-center rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
      >
        <span aria-hidden="true" className={`relative w-12 h-7 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-line-strong'}`}>
          <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-[inset-inline-start] ${checked ? 'start-6' : 'start-1'}`} />
        </span>
      </button>
    </div>
  );
}
