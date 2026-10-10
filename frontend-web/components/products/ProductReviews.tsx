'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { browseMessages } from '@/lib/i18n/messages/browse';
import ReportReview from './ReportReview';

interface Review {
  id: string;
  customerName: string;
  productRating: number;
  comment?: string;
  isVerifiedPurchase: boolean;
  sellerResponse?: string;
  createdAt: string;
}

interface ReviewsResponse {
  reviews: Review[];
  summary: {
    averageRating: number;
    totalReviews: number;
    ratingBreakdown: Record<string, number>;
  };
  pagination: { page: number; totalPages: number };
}

function Stars({ rating }: { rating: number }) {
  const t = useT(browseMessages);
  return (
    <span className="text-amber-500" aria-label={t('starsOutOf5', { rating })}>
      {'★'.repeat(Math.round(rating))}
      <span className="text-gray-300">{'★'.repeat(5 - Math.round(rating))}</span>
    </span>
  );
}

export default function ProductReviews({ productId }: { productId: string }) {
  const t = useT(browseMessages);
  const [page, setPage] = useState(1);
  // The last answer and which page of which product it was for: loading is "the answer is for something else".
  const [answer, setAnswer] = useState<{ key: string; data: ReviewsResponse | null }>({ key: '', data: null });
  const key = `${productId}:${page}`;
  const { data } = answer;
  const loading = answer.key !== key;

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get(`/products/${productId}/reviews?page=${page}`)
      .then((res) => {
        if (!cancelled) setAnswer((last) => ({ key, data: res.data?.success ? res.data.data : last.data }));
      })
      .catch(() => {
        if (!cancelled) setAnswer((last) => ({ key, data: last.data }));
      });
    return () => {
      cancelled = true;
    };
  }, [productId, page, key]);

  if (loading && !data) {
    return <div className="text-sm text-gray-500 py-6">{t('loadingReviews')}</div>;
  }

  if (!data || data.summary.totalReviews === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <h3 className="font-semibold text-gray-900 mb-1">{t('noReviews')}</h3>
        <p className="text-sm text-gray-500">{t('beFirst')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-4 mb-6">
        <div>
          <div className="text-3xl font-bold text-gray-900">{data.summary.averageRating.toFixed(1)}</div>
          <Stars rating={data.summary.averageRating} />
        </div>
        <div className="text-sm text-gray-500">
          {t(data.summary.totalReviews === 1 ? 'basedOnOne' : 'basedOnMany', { count: data.summary.totalReviews })}
        </div>
      </div>

      <div className="space-y-5">
        {data.reviews.map((review) => (
          <div key={review.id} className="border-t border-gray-100 pt-5 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-gray-900">{review.customerName}</span>
              {review.isVerifiedPurchase && (
                <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{t('verifiedPurchase')}</span>
              )}
            </div>
            <Stars rating={review.productRating} />
            {review.comment && <p className="text-sm text-gray-700 mt-2">{review.comment}</p>}
            {review.sellerResponse && (
              <div className="mt-2 bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                <span className="font-medium text-gray-800">{t('sellerReply')}</span>
                {review.sellerResponse}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 mt-1">
              <p className="text-xs text-gray-400">{formatDate(review.createdAt)}</p>
              <ReportReview reviewId={review.id} />
            </div>
          </div>
        ))}
      </div>

      {data.pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: data.pagination.totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-sm font-medium ${
                p === page ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
