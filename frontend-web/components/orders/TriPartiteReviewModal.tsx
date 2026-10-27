'use client';

import React, { useState } from 'react';
import { Star, X, CheckCircle2, Award, Bike, Utensils } from 'lucide-react';
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
  const [foodRating, setFoodRating] = useState(5);
  const [sellerRating, setSellerRating] = useState(5);
  const [riderRating, setRiderRating] = useState(5);
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
    if (submitting) return;
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
            ...(ratesDelivery ? { deliveryRating: riderRating } : {}),
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

    if (created > 0) onReviewed?.();

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
          className="p-1 text-2xl transition-transform hover:scale-115 focus:outline-none"
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
      <span className="ms-2 text-xs font-extrabold text-ink">{value} / 5</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-surface rounded-3xl shadow-2xl border border-line overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0C1016] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⭐</span>
            <div>
              <h3 className="font-extrabold text-sm text-white">{t('review.title')}</h3>
              <p className="text-[11px] text-muted font-medium">{t('review.orderNumber', { number: orderNumber })}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label={t('review.close')}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
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
            <div className="p-3.5 bg-brand-50/60 border border-brand-100 rounded-2xl space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-brand-ink" />
                  <span className="font-extrabold text-xs text-ink">{t('review.food')}</span>
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
                  <Award className="w-4 h-4 text-purple-600" />
                  <span className="font-extrabold text-xs text-ink">{t('review.kitchen')}</span>
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
                    <Bike className="w-4 h-4 text-frozen-ink" />
                    <span className="font-extrabold text-xs text-ink">{t('review.rider')}</span>
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
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3 px-4 rounded-2xl font-extrabold text-xs text-on-brand bg-brand hover:bg-brand-500 disabled:opacity-50 transition-all shadow-md"
              >
                {submitting ? t('review.submitting') : t('review.submit')}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="py-3 px-4 rounded-2xl font-extrabold text-xs text-muted bg-raised hover:bg-line transition-colors"
              >
                {tc('cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
