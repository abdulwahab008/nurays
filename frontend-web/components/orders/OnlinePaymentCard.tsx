'use client';

import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';
import { paymentService, OrderPaymentStatus } from '@/lib/services/payment.service';
import { useToast } from '@/components/ui/toast';
import { formatPrice } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { paymentsMessages } from '@/lib/i18n/messages/payments';

interface Props {
  orderId: string;
  totalAmount: number;
}

/**
 * For an order placed for online payment that isn't paid yet: a way to (re)open the payment
 * page. The order is paid once the payment provider confirms it; this page then updates by itself.
 */
export default function OnlinePaymentCard({ orderId, totalAmount }: Props) {
  const t = useT(paymentsMessages);
  const { showToast } = useToast();
  const [status, setStatus] = useState<OrderPaymentStatus | null>(null);
  // Whether a payment page was opened in the last half hour, decided when the status arrives (the time is not read while rendering).
  const [recentAttempt, setRecentAttempt] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    paymentService
      .getOrderPaymentStatus(orderId)
      .then((next) => {
        setStatus(next);
        setRecentAttempt(next.lastAttempt?.status === 'pending' && Date.now() - new Date(next.lastAttempt.createdAt).getTime() < 30 * 60 * 1000);
      })
      .catch(() => setStatus(null));
  }, [orderId]);

  if (!status || status.paymentStatus === 'paid') return null;

  const pay = async () => {
    try {
      setOpening(true);
      window.location.href = await paymentService.startOrderPayment(orderId);
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || t('payPageFailed'), 'error');
      setOpening(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-[#FF5500]/40 bg-orange-50/40 p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#FF5500] text-white flex items-center justify-center shrink-0">
          <CreditCard className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-bold text-slate-900">{t('completePayment', { amount: formatPrice(totalAmount) })}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {t('onlineText')}
          </p>
          {recentAttempt && (
            <p className="mt-2 text-xs text-slate-500">
              {t('alreadyPaid')}
            </p>
          )}
          {status.canPayOnline ? (
            <button
              type="button"
              disabled={opening}
              onClick={pay}
              className="mt-3 px-5 py-2.5 rounded-xl bg-[#FF5500] text-white text-sm font-bold hover:bg-[#e04400] disabled:opacity-50"
            >
              {opening ? t('openingPayPage') : recentAttempt ? t('openAgain') : t('payNow')}
            </button>
          ) : (
            <p className="mt-3 text-sm font-medium text-slate-700">{t('onlineUnavailable')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
