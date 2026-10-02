'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { paymentService } from '@/lib/services/payment.service';
import { useT } from '@/lib/i18n';
import { paymentsMessages } from '@/lib/i18n/messages/payments';

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

type ReturnKey = keyof typeof paymentsMessages.en;

const COPY: Record<string, { title: ReturnKey; text: ReturnKey; tone: string }> = {
  cancelled: {
    title: 'return.cancelled.title',
    text: 'return.cancelled.text',
    tone: 'bg-amber-100 text-amber-700',
  },
  failed: {
    title: 'return.failed.title',
    text: 'return.failed.text',
    tone: 'bg-red-100 text-red-700',
  },
  unknown: {
    title: 'return.unknown.title',
    text: 'return.unknown.text',
    tone: 'bg-slate-100 text-slate-700',
  },
};

function PaymentReturnContent() {
  const t = useT(paymentsMessages);
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
      setError(err.response?.data?.error?.message || t('payPageFailedFromOrder'));
      setOpening(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md w-full text-center">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-black ${copy.tone}`}>!</div>
        <h1 className="text-xl font-bold text-slate-900">{t(copy.title)}</h1>
        <p className="mt-2 text-sm text-slate-600">{t(copy.text)}</p>
        {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}
        <div className="mt-6 flex flex-col gap-2">
          {orderId && result !== 'unknown' && (
            <button
              type="button"
              disabled={opening}
              onClick={retry}
              className="w-full py-2.5 rounded-xl bg-[#FF5500] text-white text-sm font-bold hover:bg-[#e04400] disabled:opacity-50"
            >
              {opening ? t('openingPayPage') : t('tryPayAgain')}
            </button>
          )}
          {orderId ? (
            <Link href={`/orders/${orderId}`} className="w-full py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {t('viewOrder')}
            </Link>
          ) : (
            <Link href="/orders" className="w-full py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              {t('myOrders')}
            </Link>
          )}
          <Link href="/wallet" className="text-xs text-slate-500 underline mt-1">
            {t('nurayWallet')}
          </Link>
        </div>
      </div>
    </div>
  );
}
