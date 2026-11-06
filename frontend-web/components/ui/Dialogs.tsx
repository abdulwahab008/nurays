'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { PageLocale, useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { askProblem } from '@/lib/ask-validation';
import { useToast } from '@/components/ui/toast';

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
  /** `delete` (the default for `danger`) shows a bin; `warning` a warning sign, for a danger that deletes nothing. */
  icon?: 'delete' | 'warning';
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
  /** The answer deletes or ends something: the confirm button is red. */
  destructive?: boolean;
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

  // Earlier messages would sit on top of the question (they are the topmost layer) and cover its buttons.
  const { clearToasts } = useToast();
  useEffect(() => {
    if (current) clearToasts();
  }, [current, clearToasts]);

  return (
    <DialogsContext.Provider value={value}>
      {children}
      <PageLocale>
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
      </PageLocale>
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
      icon={options.icon}
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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/40" onClick={() => onAnswer(null)}>
      <form
        onSubmit={submit}
        noValidate
        className="w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 pb-[calc(1.25rem+var(--safe-bottom))] sm:pb-6 shadow-[var(--shadow-hover)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {isPassword && (
              <div aria-hidden="true" className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-raised text-muted">
                <Lock className="w-5 h-5" />
              </div>
            )}
            <h3 id="ask-dialog-title" className="text-lg font-semibold text-ink leading-snug">
              {options.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onAnswer(null)}
            aria-label={tc('close')}
            className="w-11 h-11 -me-2 -mt-1 rounded-full text-muted hover:text-ink hover:bg-raised flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        {options.message && <p className="text-sm text-muted leading-relaxed mt-2">{options.message}</p>}

        <label htmlFor="ask-dialog-input" className="mt-4 block text-sm font-medium text-ink">
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
          className={`mt-1.5 h-11 w-full rounded-xl border bg-surface px-3 text-base sm:text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-3 focus:ring-brand/30 ${
            touched && problem ? 'border-red-700' : 'border-line-strong focus:border-brand'
          }`}
        />
        <p id="ask-dialog-help" className={`mt-1 min-h-5 text-xs ${touched && problem ? 'text-red-700' : 'text-muted'}`} role={touched && problem ? 'alert' : undefined}>
          {touched && problem ? problem : ' '}
        </p>

        <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => onAnswer(null)}>
            {options.cancelText ?? tc('cancel')}
          </Button>
          <Button type="submit" variant={options.destructive ? 'destructive' : 'default'} className="sm:min-w-28">
            {options.confirmText ?? tc('confirm')}
          </Button>
        </div>
      </form>
    </div>
  );
}
