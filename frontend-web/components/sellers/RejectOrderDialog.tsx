'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { kitchenOrderMessages } from '@/lib/i18n/messages/kitchen-orders';

// `label` is what the API receives (kept in English for support/admin); `key` is what the kitchen sees.
const REJECTION_REASONS = [
  { id: 'item_unavailable', label: 'Item unavailable', key: 'reason.item_unavailable' },
  { id: 'too_busy', label: 'Too busy / High kitchen load', key: 'reason.too_busy' },
  { id: 'unable_to_prepare', label: 'Unable to prepare in time', key: 'reason.unable_to_prepare' },
  { id: 'temporary_issue', label: 'Temporary kitchen or utility issue', key: 'reason.temporary_issue' },
  { id: 'other', label: 'Other reason', key: 'reason.other' },
] as const;

// "Something else" is sent as the kitchen's own words, so it needs a few of them: the customer reads this as the reason.
const MIN_OWN_REASON = 5;

/**
 * Asks the kitchen why before an order is rejected, and rejects it. The orders list, the order page and the new-order alert all
 * use it, so a customer is never sent a reason the kitchen did not choose.
 */
export function RejectOrderDialog({
  orderId,
  orderNumber,
  onClose,
  onRejected,
}: {
  orderId: string;
  orderNumber: string;
  onClose: () => void;
  onRejected?: () => void;
}) {
  const t = useT(kitchenOrderMessages);
  const tc = useT(commonMessages);
  const { showToast } = useToast();
  const [selectedReason, setSelectedReason] = useState<string>(REJECTION_REASONS[0].id);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tried, setTried] = useState(false);
  const firstRadioRef = useRef<HTMLInputElement>(null);

  const ownWords = selectedReason === 'other';
  const noteTooShort = ownWords && note.trim().length < MIN_OWN_REASON;

  useEffect(() => {
    firstRadioRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const confirm = async () => {
    setTried(true);
    if (noteTooShort) {
      document.getElementById('reject-order-note')?.focus();
      return;
    }
    const reason = REJECTION_REASONS.find((r) => r.id === selectedReason);
    const finalReason = ownWords
      ? note.trim()
      : (reason ? reason.label : selectedReason) + (note.trim() ? `: ${note.trim()}` : '');
    try {
      setSubmitting(true);
      const res = await apiClient.post(`/seller/orders/${orderId}/reject`, { reason: finalReason });
      if (res.data?.success) {
        showToast(t('list.rejected'), 'info');
        window.dispatchEvent(new CustomEvent('seller-orders-updated'));
        window.dispatchEvent(new CustomEvent('seller-order-status-changed', { detail: { orderId, status: 'rejected' } }));
        onRejected?.();
        onClose();
      }
    } catch (error) {
      showToast(apiErrorMessage(error, t('rejectFailed')), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 flex items-end sm:items-center justify-center p-4 pb-[calc(1rem+var(--safe-bottom,0px))]">
      <div
        id="reject-order-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-order-title"
        className="bg-surface text-ink rounded-[20px] max-w-md w-full max-h-full overflow-y-auto p-5 sm:p-6 shadow-xl border border-line space-y-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="reject-order-title" className="text-lg font-semibold text-ink">
              {t('list.rejectTitle')} <span data-ltr>#{orderNumber}</span>
            </h3>
            <p className="text-sm text-muted mt-0.5">{t('list.rejectHint')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tc('close')}
            className="-me-2 -mt-1 w-11 h-11 shrink-0 rounded-full text-muted hover:bg-raised flex items-center justify-center focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <fieldset className="space-y-2">
          <legend className="sr-only">{t('list.rejectHint')}</legend>
          {REJECTION_REASONS.map((r, i) => (
            <label
              key={r.id}
              className={`flex items-center gap-3 min-h-11 px-3.5 py-2.5 rounded-xl border cursor-pointer text-sm transition-colors ${
                selectedReason === r.id ? 'border-red-300 bg-red-50 text-red-700 font-medium' : 'border-line text-ink hover:bg-raised'
              }`}
            >
              <input
                ref={i === 0 ? firstRadioRef : undefined}
                type="radio"
                name="rejectReason"
                value={r.id}
                checked={selectedReason === r.id}
                onChange={() => setSelectedReason(r.id)}
                className="h-4 w-4 accent-red-700"
              />
              <span>{t(r.key)}</span>
            </label>
          ))}
        </fieldset>

        <div>
          <label htmlFor="reject-order-note" className={`block text-sm mb-1.5 ${ownWords ? 'font-medium text-ink' : 'text-muted'}`}>
            {ownWords ? t('list.whyLabel') : t('list.additionalNote')}
          </label>
          <textarea
            id="reject-order-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('list.notePlaceholder')}
            rows={2}
            aria-required={ownWords}
            aria-invalid={tried && noteTooShort}
            aria-describedby={tried && noteTooShort ? 'reject-order-note-error' : undefined}
            className={`w-full text-sm p-3 rounded-xl bg-surface text-ink border focus:outline-none focus:ring-3 focus:ring-brand/40 ${
              tried && noteTooShort ? 'border-red-700' : 'border-line-strong'
            }`}
          />
          {tried && noteTooShort && (
            <p id="reject-order-note-error" role="alert" className="text-sm text-red-700 mt-1.5">
              {t('list.whyTooShort')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button id="confirm-reject-btn" variant="destructive" onClick={confirm} disabled={submitting} className="flex-1">
            {submitting ? t('list.rejecting') : t('list.confirmReject')}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {tc('back')}
          </Button>
        </div>
      </div>
    </div>
  );
}
