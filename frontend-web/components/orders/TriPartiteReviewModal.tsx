'use client';

import React, { useState } from 'react';
import { Star, X, CheckCircle2, Award, Bike, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isAxiosError } from 'axios';
import { apiClient, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { ordersMessages } from '@/lib/i18n/messages/orders';

/** An order line. The reviews API takes one review per order item. */
interface ReviewableOrderItem {
  id: string;
  productName: string;
  status?: string;
}

interface TriPartiteReviewModalProps {
  orderId: string;
  orderNumber: string;
  items: ReviewableOrderItem[];
  /** home_delivery, hub_pickup or self_pickup. A pickup has no delivery to rate. */
  deliveryType?: string;
  sellerName?: string;
  riderName?: string;
  isOpen: boolean;
  onClose: () => void;
  /** Called once the order has a review: one just sent, or one the customer had already left. */
  onReviewed?: () => void;
}

// Items that never reached the customer: nothing to rate.
const UNREVIEWABLE_ITEM_STATUSES = ['cancelled', 'refunded'];

export default function TriPartiteReviewModal({
  orderId,
  orderNumber,
  items,
  deliveryType,
  sellerName: sellerNameProp,
  riderName: riderNameProp,
  isOpen,
  onClose,
  onReviewed,
}: TriPartiteReviewModalProps) {
  // Nothing is pre-filled: a rating is what the customer chose, not a default they did not change.
  const [foodRating, setFoodRating] = useState(0);
  const [sellerRating, setSellerRating] = useState(0);
  const [riderRating, setRiderRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();
  const t = useT(ordersMessages);
  const tc = useT(commonMessages);
  const sellerName = sellerNameProp ?? t('review.homeKitchen');
  const riderName = riderNameProp ?? t('review.deliveryPartner');

  if (!isOpen) return null;

  const reviewableItems = items.filter((item) => !UNREVIEWABLE_ITEM_STATUSES.includes(item.status ?? ''));
  const ratesDelivery = !deliveryType || deliveryType === 'home_delivery';
  const canSubmit = foodRating > 0 && sellerRating > 0;

  const handleClose = () => {
    setError(null);
    onClose();
  };

  /**
   * POST /reviews creates one review for one order item (orderItemId, productRating and
   * sellerRating are required; deliveryRating is optional). This modal rates the whole
   * order, so the same ratings and comment are sent for each delivered item, one request
   * at a time. An item that already has a review (REVIEW_ALREADY_EXISTS) counts as done,
   * so submitting again after a partial failure only retries the items that failed.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !canSubmit) return;
    if (reviewableItems.length === 0) {
      setError(t('review.noItems'));
      return;
    }

    setSubmitting(true);
    setError(null);
    let created = 0;
    let alreadyReviewed = 0;
    let failureMessage: string | null = null;

    try {
      for (const item of reviewableItems) {
        try {
          await apiClient.post('/reviews', {
            orderId,
            orderItemId: item.id,
            productRating: foodRating,
            sellerRating,
            ...(ratesDelivery && riderRating > 0 ? { deliveryRating: riderRating } : {}),
            comment: comment.trim() || undefined,
          });
          created++;
        } catch (err) {
          const apiError = isAxiosError<ApiError>(err) ? err.response?.data?.error : undefined;
          if (apiError?.code === 'REVIEW_ALREADY_EXISTS') {
            alreadyReviewed++;
          } else if (!failureMessage) {
            failureMessage =
              apiError?.message || (err instanceof Error ? err.message : '') || t('review.failed');
          }
        }
      }
    } finally {
      setSubmitting(false);
    }

    if (created > 0 || alreadyReviewed === reviewableItems.length) onReviewed?.();

    if (failureMessage) {
      const saved = created + alreadyReviewed;
      setError(
        saved > 0
          ? t('review.partial', { message: failureMessage, saved, total: reviewableItems.length })
          : failureMessage
      );
      return;
    }

    if (created === 0) {
      // Every item already had a review: nothing new was saved. Said in the person's language (the server's own words are English).
      setError(t('review.already'));
      return;
    }

    setSubmitted(true);
    showToast(t('review.thanksToast'), 'success');
    setTimeout(() => onClose(), 2000);
  };

  const renderStars = (value: number, onChange: (val: number) => void) => (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          aria-label={t('review.starAria', { count: star })}
          aria-pressed={star <= value}
          className="w-11 h-11 flex items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Star
            className={`w-6 h-6 ${
              star <= value
                ? 'fill-accent text-accent'
                : 'text-line-strong stroke-line-strong'
            }`}
          />
        </button>
      ))}
      <span className="ms-1 text-xs font-medium text-muted">{value > 0 ? `${value} / 5` : t('review.notRated')}</span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        className="relative w-full max-w-md bg-surface rounded-3xl shadow-2xl border border-line overflow-hidden max-h-[92vh] overflow-y-auto"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-line">
          <div className="min-w-0">
            <h3 id="review-title" className="font-semibold text-ink">{t('review.title')}</h3>
            <p className="text-xs text-muted" data-ltr>{t('review.orderNumber', { number: orderNumber })}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('review.close')}
            className="shrink-0 w-11 h-11 rounded-full bg-raised hover:bg-line text-ink flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-brand-soft text-brand-soft-ink flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h4 className="text-lg font-extrabold text-ink">{t('review.submittedTitle')}</h4>
            <p className="text-xs text-muted font-medium">
              {t('review.submittedBody')}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <p className="text-xs text-muted font-medium">
              {ratesDelivery ? t('review.introWithDelivery') : t('review.introNoDelivery')}
            </p>

            {/* 1. Food Rating */}
            <div className="p-3.5 bg-raised border border-line rounded-2xl space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-brand-ink" />
                  <span className="font-semibold text-sm text-ink">{t('review.food')}</span>
                </div>
              </div>
              {renderStars(foodRating, setFoodRating)}
              {reviewableItems.length > 0 && (
                <p className="text-[11px] text-muted font-medium">
                  {t('review.appliesTo', { items: reviewableItems.map((item) => item.productName).join(', ') })}
                </p>
              )}
            </div>

            {/* 2. Kitchen / Seller Rating */}
            <div className="p-3.5 bg-raised border border-line rounded-2xl space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-brand-ink" />
                  <span className="font-semibold text-sm text-ink">{t('review.kitchen')}</span>
                </div>
                <span className="text-[11px] text-muted font-bold">{sellerName}</span>
              </div>
              {renderStars(sellerRating, setSellerRating)}
            </div>

            {/* 3. Rider Rating (home deliveries only) */}
            {ratesDelivery && (
              <div className="p-3.5 bg-raised border border-line rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bike className="w-4 h-4 text-brand-ink" />
                    <span className="font-semibold text-sm text-ink">{t('review.rider')}</span>
                  </div>
                  <span className="text-[11px] text-muted font-bold">{riderName}</span>
                </div>
                {renderStars(riderRating, setRiderRating)}
              </div>
            )}

            {/* Comments */}
            <div>
              <label className="block text-xs font-extrabold text-ink mb-1">
                {t('review.commentLabel')}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder={t('review.commentPlaceholder')}
                className="w-full px-3.5 py-2.5 border border-line rounded-2xl text-xs font-medium focus:ring-2 focus:ring-brand focus:border-transparent bg-raised focus:bg-surface resize-none"
              />
            </div>

            {error && (
              <p role="alert" className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-2xl text-xs font-semibold text-red-700">
                {error}
              </p>
            )}

            {/* Action Buttons */}
            {!canSubmit && <p className="text-xs text-muted">{t('review.rateToSubmit')}</p>}
            <div className="flex gap-3 pt-1">
              <Button type="submit" disabled={submitting || !canSubmit} className="flex-1" data-testid="submit-review">
                {submitting ? t('review.submitting') : t('review.submit')}
              </Button>
              <Button type="button" variant="outline" onClick={handleClose}>
                {tc('cancel')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
