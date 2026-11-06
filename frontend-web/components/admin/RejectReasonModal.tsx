'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The least an administrator must write when turning an application down; the server asks for the same. */
export const MIN_REASON_LENGTH = 5;

interface RejectReasonModalProps {
  isOpen: boolean;
  /** "Reject Zainab's Tandoor Kitchen?" */
  title: string;
  /** What happens to the applicant, in a sentence. */
  description: string;
  /** Common reasons, one tap each. */
  suggestions?: string[];
  confirmLabel?: string;
  /** Who reads the reason: "applicant" (default), "kitchen". */
  audience?: string;
  /** What the person can do next, under the box. */
  helpText?: string;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

/** Asks for the reason an application is turned down. The applicant is shown it, so it is required. */
export function RejectReasonModal(props: RejectReasonModalProps) {
  // Mounted only while open, so every opening starts with an empty box.
  return props.isOpen ? <RejectReasonForm {...props} /> : null;
}

function RejectReasonForm({ title, description, suggestions = [], confirmLabel = 'Reject', audience = 'applicant', helpText = 'They can fix what you name and send the application again.', busy = false, onConfirm, onCancel }: RejectReasonModalProps) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_REASON_LENGTH;

  const submit = () => {
    setTouched(true);
    if (valid && !busy) onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/40" onClick={() => !busy && onCancel()}>
      <div
        className="w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 pb-[calc(1.25rem+var(--safe-bottom))] sm:pb-6 shadow-[var(--shadow-hover)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-reason-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 id="reject-reason-title" className="text-lg font-semibold text-ink leading-snug">
            {title}
          </h3>
          <button type="button" disabled={busy} onClick={onCancel} aria-label="Close" className="w-11 h-11 -me-2 -mt-1 shrink-0 rounded-full text-muted hover:text-ink hover:bg-raised flex items-center justify-center transition-colors disabled:opacity-50">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">{description}</p>

        {suggestions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Common reasons">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setReason(s)}
                className="min-h-9 pointer-coarse:min-h-11 px-3 rounded-full border border-line-strong bg-surface text-xs font-medium text-ink hover:bg-raised"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <label htmlFor="reject-reason-text" className="mt-4 block text-sm font-medium text-ink">
          Reason (the {audience} will read this)
        </label>
        <textarea
          id="reject-reason-text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          rows={3}
          maxLength={1000}
          aria-invalid={touched && !valid}
          aria-describedby="reject-reason-help"
          className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-4 py-2 text-base sm:text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 aria-[invalid=true]:border-red-700"
          placeholder="For example: the photos of the CNIC are too blurry to read"
        />
        <p id="reject-reason-help" className={`mt-1 text-[13px] ${touched && !valid ? 'text-red-700' : 'text-muted'}`}>
          {touched && !valid ? `Write at least ${MIN_REASON_LENGTH} characters, so they know what to fix.` : helpText}
        </p>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={submit}>
            {busy ? 'Rejecting…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
