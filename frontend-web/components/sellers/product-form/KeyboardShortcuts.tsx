'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { kitchenProductFormMessages } from '@/lib/i18n/messages/kitchen-product-form';

const FOCUSABLE =
  'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])[type="button"]';

/**
 * Enter moves to the next field (a textarea keeps its new line), Ctrl/Cmd+S or Ctrl/Cmd+Enter saves
 * this form, Ctrl/Cmd+K opens the shortcuts list and Escape closes it or leaves the field.
 */
export function useFormShortcuts(formRef: React.RefObject<HTMLFormElement | null>, busy: boolean) {
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const form = formRef.current;
      const target = e.target as HTMLElement;
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'Enter' && !e.shiftKey && !mod && target.tagName === 'INPUT' && form?.contains(target)) {
        e.preventDefault();
        const fields = Array.from(form.querySelectorAll<HTMLElement>(FOCUSABLE));
        fields[fields.indexOf(target) + 1]?.focus();
      } else if (mod && (e.key === 's' || e.key === 'Enter')) {
        e.preventDefault();
        if (!busy) form?.requestSubmit();
      } else if (mod && e.key === 'k') {
        e.preventDefault();
        setHelpOpen((open) => !open);
      } else if (e.key === 'Escape') {
        if (helpOpen) setHelpOpen(false);
        else (document.activeElement as HTMLElement | null)?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formRef, busy, helpOpen]);

  return { helpOpen, setHelpOpen };
}

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded-md border border-line-strong bg-raised px-2 py-0.5 font-sans text-xs text-ink">{children}</kbd>
);

const ROWS = [
  { label: 'shortcut.save', keys: ['Ctrl', 'S'] },
  { label: 'shortcut.save', keys: ['Ctrl', 'Enter'] },
  { label: 'shortcut.toggle', keys: ['Ctrl', 'K'] },
  { label: 'shortcut.close', keys: ['Esc'] },
  { label: 'shortcut.next', keys: ['Enter', 'Tab'], or: true },
] as const;

export function ShortcutsButton({ onClick }: { onClick: () => void }) {
  const t = useT(kitchenProductFormMessages);
  return (
    <button
      type="button"
      onClick={onClick}
      className="hidden min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-muted hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 sm:inline-flex"
    >
      {t('shortcuts')}
      <Key>Ctrl K</Key>
    </button>
  );
}

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const t = useT(kitchenProductFormMessages);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="mx-4 w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 id="shortcuts-title" className="text-base font-semibold text-ink">
            {t('shortcuts')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <dl className="mt-3 divide-y divide-line">
          {ROWS.map((row) => (
            <div key={row.keys.join('-')} className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-sm text-ink">{t(row.label)}</dt>
              <dd className="flex flex-wrap items-center justify-end gap-1">
                {row.keys.map((k, i) => (
                  <span key={k} className="flex items-center gap-1">
                    {i > 0 && <span className="text-xs text-muted">{'or' in row ? t('or') : '+'}</span>}
                    <Key>{k}</Key>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
