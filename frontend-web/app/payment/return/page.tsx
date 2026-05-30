'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

/**
 * Safepay redirects the customer back to this page after payment.
 * Query params from Safepay: ?tracker={token}&order_id={orderId}&status=...
 * We verify with our backend and then redirect to the order detail page.
 */
type Status = 'verifying' | 'success' | 'pending' | 'failed' | 'cancelled';

export default function PaymentReturnPage() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('Verifying your payment...');
  const [orderIdState, setOrderIdState] = useState<string | null>(null);

  useEffect(() => {
    const tracker = searchParams.get('tracker') ?? searchParams.get('beacon');
    const orderId = searchParams.get('order_id') ?? searchParams.get('orderId');
    const sfStatus = searchParams.get('status') ?? '';
    setOrderIdState(orderId);

    // Handle explicit cancel from Safepay
    if (sfStatus === 'cancelled' || sfStatus === 'cancel') {
      setStatus('cancelled');
      setMessage('Payment was cancelled. You can try again from checkout.');
      return;
    }

    if (!orderId) {
      setStatus('failed');
      setMessage('Invalid return URL — order ID missing.');
      return;
    }

    const verify = async () => {
      if (!tracker) {
        // No tracker — we can't ask the backend to verify. Show pending and
        // let the customer check their order; webhook may still confirm.
        setStatus('pending');
        setMessage('Your payment is being processed. Check your order shortly.');
        return;
      }

      try {
        const res = await apiClient.post<{
          success: boolean;
          data?: { paymentStatus?: string };
        }>('/payments/verify', { paymentId: tracker, transactionId: tracker });

        const paymentStatus = res.data?.data?.paymentStatus;

        if (paymentStatus === 'completed') {
          setStatus('success');
          setMessage('Payment successful! Redirecting to your order...');
          setTimeout(() => router.push(`/orders/${orderId}?placed=1`), 1500);
        } else {
          // Backend responded but payment isn't confirmed yet — webhook may
          // still arrive. Don't claim success.
          setStatus('pending');
          setMessage(
            'Your payment is being processed. You can view your order — we\'ll update its status as soon as the payment clears.',
          );
        }
      } catch {
        setStatus('failed');
        setMessage(
          'We couldn\'t verify your payment. If money was deducted, it will appear on your order shortly — otherwise please try again.',
        );
      }
    };

    verify();
  }, []);

  const icons: Record<Status, React.ReactNode> = {
    verifying: (
      <div className="w-16 h-16 rounded-full border-4 border-green-200 border-t-green-600 animate-spin mx-auto mb-4" />
    ),
    success: (
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    ),
    pending: (
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    ),
    failed: (
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    ),
    cancelled: (
      <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>
    ),
  };

  const heading: Record<Status, string> = {
    verifying: 'Verifying Payment',
    success: 'Payment Successful',
    pending: 'Payment Pending',
    failed: 'Payment Failed',
    cancelled: 'Payment Cancelled',
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center">
        {icons[status]}
        <h1 className="text-xl font-bold text-gray-900 mb-2">{heading[status]}</h1>
        <p className="text-gray-500 text-sm">{message}</p>

        {status === 'pending' && orderIdState && (
          <button
            onClick={() => router.push(`/orders/${orderIdState}`)}
            className="mt-6 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-all"
          >
            View Order
          </button>
        )}

        {(status === 'failed' || status === 'cancelled') && (
          <div className="mt-6 flex gap-3 justify-center">
            <button
              onClick={() => router.push('/checkout')}
              className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-all"
            >
              Back to Checkout
            </button>
            {orderIdState && (
              <button
                onClick={() => router.push(`/orders/${orderIdState}`)}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold rounded-xl transition-all"
              >
                View Order
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
