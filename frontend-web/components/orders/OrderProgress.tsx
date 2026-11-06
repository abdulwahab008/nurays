'use client';

import { Check } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { ordersMessages } from '@/lib/i18n/messages/orders';
import { orderProgress } from './order-progress';

/** The five-step tracker (placed, accepted, cooking, on the way, delivered); nothing for an order that ended early. */
export function OrderProgress({ status, deliveryType, compact = false }: { status: string; deliveryType?: string | null; compact?: boolean }) {
  const t = useT(ordersMessages);
  const progress = orderProgress(status, deliveryType);
  if (!progress) return null;
  const { steps, reached } = progress;

  return (
    <ol className="flex items-start" aria-label={t('progress.aria')} data-testid="order-progress">
      {steps.map((step, i) => {
        const done = i < reached || (i === reached && i === steps.length - 1);
        const current = i === reached && !done;
        return (
          <li key={step} className="flex-1 flex flex-col items-center text-center min-w-0 relative" aria-current={current ? 'step' : undefined}>
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute top-3 end-1/2 w-full h-0.5 -z-0 ${i <= reached ? 'bg-brand' : 'bg-line'}`}
              />
            )}
            <span
              className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                done ? 'bg-brand text-on-brand' : current ? 'bg-brand-soft text-brand-soft-ink ring-2 ring-brand' : 'bg-raised text-muted'
              }`}
            >
              {done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
            </span>
            {!compact || current ? (
              <span className={`mt-1.5 text-xs leading-tight px-0.5 ${current || done ? 'text-ink font-medium' : 'text-muted'}`}>
                {t(`progress.${step}`)}
              </span>
            ) : (
              <span className="sr-only">{t(`progress.${step}`)}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
