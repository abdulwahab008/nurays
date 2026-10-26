'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { askProblem } from '@/lib/ask-validation';

/**
 * Questions put to the person in the page's own windows instead of the browser's confirm() and prompt() boxes. Those boxes
 * are suppressed in many in-app browsers (the action then silently does not happen), cannot be styled or translated,
 * and a prompt shows a typed password in clear text. Both calls return a promise, so a call site reads the same as before:
 *
 *   if (!(await confirm({ message: 'Delete this?' }))) return;
 *   const password = await ask({ title: 'Your password', message: '...', type: 'password' }); // null when cancelled
 */
export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** `danger` (default) for deleting and suspending, `warning` for the rest. */
  variant?: 'danger' | 'warning';
}

export interface AskOptions {
  title: string;
  message?: string;
  /** The label above the box. */
  label?: string;
  placeholder?: string;
  /** `password` hides what is typed. */
  type?: 'text' | 'password';
  confirmText?: string;
  cancelText?: string;
  /** The fewest characters accepted. */
  minLength?: number;
  /** An empty answer is accepted (and returned as ''). */
  optional?: boolean;
  /** The exact text that must be typed, such as DELETE. */
  mustEqual?: string;
}

type Pending =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (answer: boolean) => void }
  | { kind: 'ask'; options: AskOptions; resolve: (answer: string | null) => void };

interface Dialogs {
  /** Resolves true when the person confirms, false when they cancel (button, Escape, or a click outside). */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Resolves the text the person entered, or null when they cancel. */
  ask: (options: AskOptions) => Promise<string | null>;
}

const DialogsContext = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const context = useContext(DialogsContext);
  if (!context) throw new Error('useDialogs must be used within DialogProvider');
  return context;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  // Questions wait their turn: a second one asked while the first is open is shown after it.
  const [queue, setQueue] = useState<Pending[]>([]);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setQueue((q) => [...q, { kind: 'confirm', options, resolve }])),
    []
  );
  const ask = useCallback(
    (options: AskOptions) => new Promise<string | null>((resolve) => setQueue((q) => [...q, { kind: 'ask', options, resolve }])),
    []
  );
  const value = useMemo(() => ({ confirm, ask }), [confirm, ask]);

  const current = queue[0];
  const close = () => setQueue((q) => q.slice(1));

  return (
    <DialogsContext.Provider value={value}>
      {children}
      {current?.kind === 'confirm' && (
        <ConfirmDialog
          key={queue.length + current.options.message}
          options={current.options}
          onAnswer={(answer) => {
            current.resolve(answer);
            close();
          }}
        />
      )}
      {current?.kind === 'ask' && (
        <AskDialog
          key={queue.length + current.options.title}
          options={current.options}
          onAnswer={(answer) => {
            current.resolve(answer);
            close();
          }}
        />
      )}
    </DialogsContext.Provider>
  );
}

function ConfirmDialog({ options, onAnswer }: { options: ConfirmOptions; onAnswer: (answer: boolean) => void }) {
  const tc = useT(commonMessages);
  return (
    <ConfirmModal
      isOpen
      title={options.title ?? tc('areYouSure')}
      message={options.message}
      confirmText={options.confirmText}
      cancelText={options.cancelText}
      variant={options.variant ?? 'danger'}
      onConfirm={() => onAnswer(true)}
      onCancel={() => onAnswer(false)}
    />
  );
}

function AskDialog({ options, onAnswer }: { options: AskOptions; onAnswer: (answer: string | null) => void }) {
  const tc = useT(commonMessages);
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const isPassword = options.type === 'password';
  // A password is taken as typed (a space can be part of it); other text is trimmed.
  const answer = isPassword ? value : value.trim();

  const kind = askProblem(options, answer);
  const problem =
    kind === 'mustEqual'
      ? tc('typeToContinue', { text: options.mustEqual ?? '' })
      : kind === 'required'
        ? tc('fieldRequired')
        : kind === 'minLength'
          ? tc('atLeastChars', { count: options.minLength ?? 0 })
          : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onAnswer(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAnswer]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!problem) onAnswer(answer);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/60" onClick={() => onAnswer(null)}>
      <form
        onSubmit={submit}
        noValidate
        className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            {isPassword && (
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-amber-50 text-amber-600 border border-amber-100">
                <Lock className="w-5 h-5" aria-hidden="true" />
              </div>
            )}
            <h3 id="ask-dialog-title" className="text-base font-bold text-slate-900 tracking-tight">
              {options.title}
            </h3>
          </div>
          <button type="button" onClick={() => onAnswer(null)} aria-label={tc('close')} className="w-8 h-8 rounded-full text-slate-500 hover:bg-slate-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        {options.message && <p className="text-xs text-slate-600 leading-relaxed mb-4">{options.message}</p>}

        <label htmlFor="ask-dialog-input" className="block text-xs font-bold uppercase tracking-wide text-slate-600">
          {options.label ?? options.title}
        </label>
        <input
          id="ask-dialog-input"
          autoFocus
          type={isPassword ? 'password' : 'text'}
          autoComplete={isPassword ? 'current-password' : 'off'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={options.placeholder}
          aria-invalid={touched && !!problem}
          aria-describedby="ask-dialog-help"
          dir="auto"
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <p id="ask-dialog-help" className={`mt-1 text-xs ${touched && problem ? 'text-red-700' : 'text-slate-600'}`} role={touched && problem ? 'alert' : undefined}>
          {touched && problem ? problem : ' '}
        </p>

        <div className="mt-4 flex items-center justify-end gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => onAnswer(null)} className="rounded-xl px-4 text-xs font-semibold">
            {options.cancelText ?? tc('cancel')}
          </Button>
          <Button type="submit" size="sm" className="rounded-xl px-5 text-xs font-bold text-on-brand bg-brand hover:bg-brand-500">
            {options.confirmText ?? tc('confirm')}
          </Button>
        </div>
      </form>
    </div>
  );
}
