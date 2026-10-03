'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { browseMessages } from '@/lib/i18n/messages/browse';

function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const t = useT(browseMessages);
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-gray-600 w-24">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`text-2xl leading-none ${n <= value ? 'text-amber-500' : 'text-gray-300'}`}
            aria-label={t(n > 1 ? 'starMany' : 'starOne', { n })}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

interface WriteReviewFormProps {
  orderId: string;
  orderItemId: string;
  productName: string;
}

export default function WriteReviewForm({ orderId, orderItemId, productName }: WriteReviewFormProps) {
  const { showToast } = useToast();
  const t = useT(browseMessages);
  const tc = useT(commonMessages);
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [productRating, setProductRating] = useState(5);
  const [sellerRating, setSellerRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      await apiClient.post('/reviews', {
        orderId,
        orderItemId,
        productRating,
        sellerRating,
        comment: comment.trim() || undefined,
      });
      showToast(t('thanksReview'), 'success');
      setSubmitted(true);
      setOpen(false);
    } catch (error: any) {
      const code = error.response?.data?.error?.code;
      if (code === 'REVIEW_ALREADY_EXISTS') {
        setSubmitted(true);
        setOpen(false);
      } else {
        showToast(error.response?.data?.error?.message || t('submitReviewFailed'), 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return <p className="text-xs text-green-600 mt-1">{t('reviewedItem')}</p>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-gray-700 underline hover:no-underline mt-1"
      >
        {t('writeReview')}
      </button>
    );
  }

  return (
    <div className="mt-3 p-4 bg-gray-50 rounded-xl space-y-3">
      <p className="text-sm font-medium text-gray-900">{t('reviewProduct', { name: productName })}</p>
      <StarPicker value={productRating} onChange={setProductRating} label={t('ratingProduct')} />
      <StarPicker value={sellerRating} onChange={setSellerRating} label={t('ratingSeller')} />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder={t('reviewPlaceholder')}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-400"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={submitting}>
          {submitting ? t('submitting') : t('submitReview')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
          {tc('cancel')}
        </Button>
      </div>
    </div>
  );
}
