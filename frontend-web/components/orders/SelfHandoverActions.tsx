'use client';

import { useState } from 'react';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { kitchenOrderMessages } from '@/lib/i18n/messages/kitchen-orders';

interface Props {
  orderId: string;
  orderStatus: string;
  deliveryType?: string;
  /** Called after any successful change so the caller can reload. */
  onChanged: () => void;
}

/**
 * Handover controls for an order the kitchen hands over itself: its own delivery,
 * or the customer collecting it. Completing it needs the customer's 4-digit code
 * (shown only on the customer's order screen), so an order can't be marked
 * delivered without the customer.
 */
export default function SelfHandoverActions({ orderId, orderStatus, deliveryType, onChanged }: Props) {
  const { showToast } = useToast();
  const t = useT(kitchenOrderMessages);
  const tc = useT(commonMessages);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'deliver' | 'fail'>('idle');
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const isPickup = deliveryType === 'self_pickup';

  const call = async (path: string, body: object, ok: string) => {
    try {
      setBusy(path);
      await apiClient.post(`/seller/orders/${orderId}/${path}`, body);
      showToast(ok, 'success');
      setMode('idle');
      setCode('');
      setReason('');
      onChanged();
    } catch (err) {
      showToast(apiErrorMessage(err, t('couldNotUpdate')), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!['ready', 'dispatched', 'in_transit'].includes(orderStatus)) return null;

  const field =
    'h-11 rounded-lg border border-line-strong bg-surface px-3 text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40';
  // Out for delivery comes first while the food is still in the kitchen; after that, handing it over is the next step.
  const dispatchFirst = orderStatus === 'ready' && !isPickup;

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-ink">{isPickup ? t('handover.pickupTitle') : t('handover.deliverTitle')}</p>

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {dispatchFirst && (
            <Button disabled={!!busy} onClick={() => call('dispatch', {}, t('handover.dispatched'))} className="flex-1">
              {busy === 'dispatch' ? t('handover.updating') : t('handover.outForDelivery')}
            </Button>
          )}
          <Button variant={dispatchFirst ? 'outline' : 'default'} disabled={!!busy} onClick={() => setMode('deliver')} className="flex-1">
            {isPickup ? t('handover.collected') : t('handover.delivered')}
          </Button>
          {!isPickup && (
            <Button variant="outline" disabled={!!busy} onClick={() => setMode('fail')} className="text-red-700 hover:bg-red-50">
              {t('handover.deliveryFailed')}
            </Button>
          )}
        </div>
      )}

      {mode === 'deliver' && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            call('deliver', { handoverCode: code.trim() }, t('handover.completed'));
          }}
        >
          <label className="block text-sm text-muted" htmlFor={`code-${orderId}`}>
            {t('handover.askCode')}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`code-${orderId}`}
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              autoComplete="one-time-code"
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className={`${field} w-28 text-center font-mono text-lg tracking-widest`}
              placeholder="0000"
              required
            />
            <Button type="submit" disabled={!!busy || code.length !== 4}>
              {busy === 'deliver' ? t('handover.checking') : tc('confirm')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('idle')}>
              {tc('cancel')}
            </Button>
          </div>
        </form>
      )}

      {mode === 'fail' && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            call('delivery-failed', { reason: reason.trim() }, t('handover.reported'));
          }}
        >
          <label className="block text-sm text-muted" htmlFor={`reason-${orderId}`}>
            {t('handover.whatHappened')}
          </label>
          <input
            id={`reason-${orderId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={`${field} w-full text-[15px]`}
            minLength={3}
            maxLength={500}
            required
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={!!busy || reason.trim().length < 3} className="text-red-700 hover:bg-red-50">
              {busy === 'delivery-failed' ? t('handover.sending') : t('handover.report')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode('idle')}>
              {tc('cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
