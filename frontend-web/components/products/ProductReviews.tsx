'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

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
  return (
    <span className="text-amber-500" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(Math.round(rating))}
      <span className="text-gray-300">{'★'.repeat(5 - Math.round(rating))}</span>
    </span>
  );
}

export default function ProductReviews({ productId }: { productId: string }) {
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get(`/products/${productId}/reviews?page=${page}`)
      .then((res) => {
        if (!cancelled && res.data?.success) setData(res.data.data);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [productId, page]);

  if (loading && !data) {
    return <div className="text-sm text-gray-500 py-6">Loading reviews...</div>;
  }

  if (!data || data.summary.totalReviews === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <h3 className="font-semibold text-gray-900 mb-1">No reviews yet</h3>
        <p className="text-sm text-gray-500">Be the first to review this product after your order is delivered.</p>
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
          Based on {data.summary.totalReviews} review{data.summary.totalReviews === 1 ? '' : 's'}
        </div>
      </div>

      <div className="space-y-5">
        {data.reviews.map((review) => (
          <div key={review.id} className="border-t border-gray-100 pt-5 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-gray-900">{review.customerName}</span>
              {review.isVerifiedPurchase && (
                <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Verified purchase</span>
              )}
            </div>
            <Stars rating={review.productRating} />
            {review.comment && <p className="text-sm text-gray-700 mt-2">{review.comment}</p>}
            {review.sellerResponse && (
              <div className="mt-2 bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                <span className="font-medium text-gray-800">Seller reply: </span>
                {review.sellerResponse}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">{formatDate(review.createdAt)}</p>
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
