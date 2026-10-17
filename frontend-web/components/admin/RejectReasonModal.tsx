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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60" onClick={() => !busy && onCancel()}>
      <div
        className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-reason-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 id="reject-reason-title" className="text-base font-bold text-slate-900">
            {title}
          </h3>
          <button type="button" disabled={busy} onClick={onCancel} aria-label="Close" className="w-8 h-8 rounded-full text-slate-500 hover:bg-slate-100 flex items-center justify-center disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-600">{description}</p>

        {suggestions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2" aria-label="Common reasons">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setReason(s)}
                className="px-2.5 py-1 rounded-full border border-slate-300 bg-slate-50 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <label htmlFor="reject-reason-text" className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-600">
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
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="For example: the photos of the CNIC are too blurry to read"
        />
        <p id="reject-reason-help" className={`mt-1 text-xs ${touched && !valid ? 'text-red-700' : 'text-slate-600'}`}>
          {touched && !valid ? `Write at least ${MIN_REASON_LENGTH} characters, so they know what to fix.` : helpText}
        </p>

        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={submit} className="bg-red-600 hover:bg-red-700 text-white">
            {busy ? 'Rejecting…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
