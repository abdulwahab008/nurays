'use client';

/** Said on the tray and at checkout when the tray's kitchen can't take the order; the server refuses it too. */
import Link from 'next/link';
import { useT } from '@/lib/i18n';
import { checkoutMessages } from '@/lib/i18n/messages/checkout';
import type { KitchenUnavailableReason } from '@/lib/services/cart.service';

export function KitchenUnavailable({ reason, kitchen, className = '' }: { reason: KitchenUnavailableReason; kitchen: string; className?: string }) {
  const t = useT(checkoutMessages);
  return (
    <div role="alert" data-testid="kitchen-unavailable" className={`rounded-2xl bg-red-50 p-4 ${className}`}>
      <p className="text-[15px] font-semibold text-red-700">{t('kitchenUnavailableTitle', { kitchen })}</p>
      <p className="text-sm text-ink mt-0.5">{t(reason === 'outside_area' ? 'kitchenOutsideAreaBody' : 'kitchenSuspendedBody')}</p>
      <Link href="/products" className="inline-flex items-center min-h-11 text-sm font-semibold text-brand-ink hover:underline">
        {t('findOtherKitchens')}
      </Link>
    </div>
  );
}
