'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { paymentService } from '@/lib/services/payment.service';

/**
 * Where a customer lands when an online payment didn't go through: they cancelled on the
 * payment page, or the confirmation couldn't be verified. A successful payment goes straight
 * to the order page instead (the server confirms it before redirecting).
 */
export default function PaymentReturnPage() {
  return (
    <Suspense fallback={null}>
      <PaymentReturnContent />
    </Suspense>
  );
}

const COPY: Record<string, { title: string; text: string; tone: string }> = {
  cancelled: {
    title: 'Payment cancelled',
    text: 'Nothing was charged. Your order is waiting for payment: you can try again now.',
    tone: 'bg-amber-100 text-amber-700',
  },
  failed: {
    title: "We couldn't confirm your payment",
    text: 'If money left your account, your order will show it as paid as soon as the payment provider confirms it. Otherwise, try again.',
    tone: 'bg-red-100 text-red-700',
  },
  unknown: {
    title: "We couldn't match this payment",
    text: 'Check your orders and your Nuray Wallet. If money left your account and you can\'t see it, contact support.',
    tone: 'bg-slate-100 text-slate-700',
  },
};

function PaymentReturnContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('order') ?? searchParams.get('order_id');
  const result = searchParams.get('result') ?? (orderId ? 'failed' : 'unknown');
  const copy = COPY[result] ?? COPY.unknown;
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retry = async () => {
    if (!orderId) return;
    try {
      setOpening(true);
      setError(null);
      window.location.href = await paymentService.startOrderPayment(orderId);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'The payment page could not be opened. Please try again from your order.');
      setOpening(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md w-full text-center">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-black ${copy.tone}`}>!</div>
        <h1 className="text-xl font-bold text-slate-900">{copy.title}</h1>
        <p className="mt-2 text-sm text-slate-600">{copy.text}</p>
        {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}
        <div className="mt-6 flex flex-col gap-2">
          {orderId && result !== 'unknown' && (
            <button
              type="button"
              disabled={opening}
              onClick={retry}
              className="w-full py-2.5 rounded-xl bg-[#FF5500] text-white text-sm font-bold hover:bg-[#e04400] disabled:opacity-50"
            >
              {opening ? 'Opening the payment page…' : 'Try paying again'}
            </button>
          )}
          {orderId ? (
            <Link href={`/orders/${orderId}`} className="w-full py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              View order
            </Link>
          ) : (
            <Link href="/orders" className="w-full py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              My orders
            </Link>
          )}
          <Link href="/wallet" className="text-xs text-slate-500 underline mt-1">
            Nuray Wallet
          </Link>
        </div>
      </div>
    </div>
  );
}
