'use client';

import { useEffect, useState } from 'react';

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
  <kbd className="px-2 py-1 text-xs font-semibold bg-white border border-gray-300 rounded shadow-sm">{children}</kbd>
);

const ROWS: Array<{ label: string; keys: string[]; joiner?: string; bg: string }> = [
  { label: 'Save', keys: ['Ctrl', 'S'], bg: 'bg-blue-50' },
  { label: 'Quick Save', keys: ['Ctrl', 'Enter'], bg: 'bg-emerald-50' },
  { label: 'Toggle Shortcuts Help', keys: ['Ctrl', 'K'], bg: 'bg-purple-50' },
  { label: 'Close / Clear Focus', keys: ['Esc'], bg: 'bg-gray-50' },
  { label: 'Navigate Between Fields', keys: ['Enter', 'Tab'], joiner: '/', bg: 'bg-amber-50' },
];

export function ShortcutsButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="mb-4 flex justify-end">
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 hover:text-blue-600 bg-white hover:bg-blue-50 rounded-lg border border-gray-200 hover:border-blue-300 transition-all"
      >
        <span>⌨️</span>
        <span>Keyboard Shortcuts</span>
        <kbd className="px-1.5 py-0.5 text-xs bg-gray-100 border border-gray-300 rounded">Ctrl+K</kbd>
      </button>
    </div>
  );
}

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="shortcuts-title" className="text-xl font-bold text-gray-900">
            ⌨️ Keyboard Shortcuts
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-600 text-2xl leading-none">
            ×
          </button>
        </div>
        <div className="space-y-3">
          {ROWS.map((row) => (
            <div key={row.label} className={`flex items-center justify-between p-3 ${row.bg} rounded-lg`}>
              <span className="text-sm text-gray-700">{row.label}</span>
              <div className="flex gap-1 flex-wrap justify-end">
                {row.keys.map((k, i) => (
                  <span key={k} className="flex gap-1">
                    {i > 0 && <span className="text-gray-500">{row.joiner || '+'}</span>}
                    <Key>{k}</Key>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-800">
            <span className="font-bold">💡 Pro Tip:</span> Press Enter in input fields to jump to the next one. Tab works too!
          </p>
        </div>
      </div>
    </div>
  );
}
