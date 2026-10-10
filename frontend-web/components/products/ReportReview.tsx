'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, apiErrorCode, apiErrorMessage } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';
import { browseMessages } from '@/lib/i18n/messages/browse';
import { commonMessages } from '@/lib/i18n/messages/common';

const REASONS = ['abusive', 'spam', 'false', 'privacy', 'other'] as const;
type Reason = (typeof REASONS)[number];

/**
 * "Report" under a review. Anyone signed in can ask the team to look at a review (an app-store rule for anything
 * people write); a report hides nothing, a person on the team decides. Someone who is not signed in is sent to sign in.
 */
export default function ReportReview({ reviewId }: { reviewId: string }) {
  const t = useT(browseMessages);
  const tc = useT(commonMessages);
  const router = useRouter();
  const { showToast } = useToast();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const groupName = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (sent) {
    return (
      <span className="text-xs text-gray-500" data-testid="review-reported">
        {t('reportThanks')}
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid="report-review"
        onClick={() => (isAuthenticated ? setOpen(true) : router.push('/login'))}
        className="text-xs text-gray-400 hover:text-gray-700 underline"
      >
        {t('reportReview')}
      </button>
    );
  }

  const send = async () => {
    if (!reason) {
      setError(t('reportPickReason'));
      return;
    }
    try {
      setSending(true);
      setError('');
      await apiClient.post(`/reviews/${reviewId}/report`, { reason, ...(note.trim() ? { note: note.trim() } : {}) });
      setSent(true);
      showToast(t('reportThanks'), 'success');
    } catch (err) {
      const code = apiErrorCode(err);
      setError(code === 'OWN_REVIEW' ? t('reportOwnReview') : code === 'REVIEW_NOT_FOUND' ? t('reportGone') : apiErrorMessage(err, t('reportFailed')));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="basis-full w-full mt-1 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2" data-testid="report-panel">
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-gray-900 mb-1">{t('reportTitle')}</legend>
        {REASONS.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name={groupName}
              value={r}
              checked={reason === r}
              onChange={() => {
                setReason(r);
                setError('');
              }}
            />
            {t(`reportReason.${r}`)}
          </label>
        ))}
      </fieldset>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        rows={2}
        placeholder={t('reportNote')}
        aria-label={t('reportNote')}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="report-send"
          disabled={sending}
          onClick={send}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {sending ? t('reportSending') : t('reportSend')}
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() => {
            setOpen(false);
            setError('');
          }}
          className="rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-sm text-gray-700"
        >
          {tc('cancel')}
        </button>
      </div>
    </div>
  );
}
