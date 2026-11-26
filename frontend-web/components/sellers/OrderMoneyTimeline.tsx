'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useLocale, useT } from '@/lib/i18n';
import { kitchenOrderMessages } from '@/lib/i18n/messages/kitchen-orders';
import { dateClock } from '@/components/sellers/order-timing';

interface OrderMoney {
  kind: 'online' | 'rider_cash' | 'rider_cash_waiting' | 'kitchen_collected';
  orderTotal: number;
  kitchenShare: number;
  effect: number;
  deliveredAt: string | null;
  cashHandedInAt: string | null;
  payout: {
    amount: number;
    createdAt: string;
    sentAt: string | null;
    reference: string | null;
    confirmation: 'received' | 'not_received' | null;
    confirmedAt: string | null;
  } | null;
}

interface Step { text: string; at?: string | null; done: boolean; link?: boolean }

/** A delivered order's money, step by step: earned, cash handed in, which payout, sent, arrived. */
export function OrderMoneyTimeline({ orderId }: { orderId: string }) {
  const t = useT(kitchenOrderMessages);
  const { locale } = useLocale();
  const [money, setMoney] = useState<OrderMoney | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get(`/seller/orders/${orderId}/money`);
      setMoney(res.data.data);
    } catch {
      setFailed(true);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) return <p className="pt-6 border-t border-line text-muted">{t('money.loadFailed')}</p>;
  if (!money || (money.effect === 0 && money.kind !== 'rider_cash_waiting')) return null;

  const steps: Step[] = [];
  if (money.kind === 'kitchen_collected') {
    const owed = formatPrice(Math.abs(money.effect));
    steps.push({ text: t(money.effect < 0 ? 'money.collected' : 'money.collectedOwedYou', { total: formatPrice(money.orderTotal), owed }), at: money.deliveredAt, done: true });
  } else {
    steps.push({ text: t('money.earned', { amount: formatPrice(money.kitchenShare) }), at: money.deliveredAt, done: true });
    if (money.kind === 'online') steps.push({ text: t('money.online'), done: true });
    if (money.kind === 'rider_cash') steps.push({ text: t('money.cashHandedIn'), at: money.cashHandedInAt, done: true });
    if (money.kind === 'rider_cash_waiting') steps.push({ text: t('money.cashWaiting'), done: false });
  }

  const p = money.payout;
  if (money.kind !== 'rider_cash_waiting') {
    if (!p) {
      steps.push({ text: t('money.nextPayout'), done: false });
    } else if (p.amount < 0) {
      steps.push({ text: t('money.paidToNuray', { amount: formatPrice(-p.amount) }), at: p.createdAt, done: true });
    } else {
      steps.push({ text: t(money.effect < 0 ? 'money.inPayoutDeducted' : 'money.inPayout', { amount: formatPrice(p.amount) }), at: p.createdAt, done: true });
      steps.push(p.sentAt ? { text: p.reference ? t('money.sentRef', { reference: p.reference }) : t('money.sent'), at: p.sentAt, done: true } : { text: t('money.notSent'), done: false });
      if (p.sentAt) {
        if (p.confirmation === 'received') steps.push({ text: t('money.received'), at: p.confirmedAt, done: true });
        else if (p.confirmation === 'not_received') steps.push({ text: t('money.notReceived'), at: p.confirmedAt, done: false });
        else steps.push({ text: t('money.confirm'), done: false, link: true });
      }
    }
  }

  return (
    <section className="pt-6 border-t border-line" data-testid="order-money">
      <h2 className="text-sm font-semibold text-ink">{t('money.title')}</h2>
      <ol className="mt-2 space-y-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${s.done ? 'bg-brand' : 'border-2 border-line'}`} />
            <div>
              <p className={s.done ? 'text-ink' : 'text-muted'}>
                {s.link ? <Link href="/sellers/earnings" className="font-semibold text-brand-ink hover:underline">{s.text}</Link> : s.text}
              </p>
              {s.at ? <p className="text-xs text-muted">{dateClock(s.at, locale)}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
