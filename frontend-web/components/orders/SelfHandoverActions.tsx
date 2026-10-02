'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
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
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || t('couldNotUpdate'), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!['ready', 'dispatched', 'in_transit'].includes(orderStatus)) return null;

  return (
    <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-200 space-y-3">
      <p className="text-sm font-bold text-indigo-900">
        {isPickup ? t('handover.pickupTitle') : t('handover.deliverTitle')}
      </p>

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {orderStatus === 'ready' && !isPickup && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => call('dispatch', {}, t('handover.dispatched'))}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy === 'dispatch' ? t('handover.updating') : t('handover.outForDelivery')}
            </button>
          )}
          <button
            type="button"
            disabled={!!busy}
            onClick={() => setMode('deliver')}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            {isPickup ? t('handover.collected') : t('handover.delivered')}
          </button>
          {!isPickup && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => setMode('fail')}
              className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
            >
              {t('handover.deliveryFailed')}
            </button>
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
          <label className="block text-xs font-semibold text-indigo-900" htmlFor={`code-${orderId}`}>
            {t('handover.askCode')}
          </label>
          <div className="flex gap-2">
            <input
              id={`code-${orderId}`}
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              autoComplete="one-time-code"
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-28 h-10 rounded-lg border border-indigo-300 px-3 text-center font-mono text-lg tracking-widest"
              placeholder="0000"
              required
            />
            <button
              type="submit"
              disabled={!!busy || code.length !== 4}
              className="px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy === 'deliver' ? t('handover.checking') : tc('confirm')}
            </button>
            <button type="button" onClick={() => setMode('idle')} className="px-3 text-sm text-gray-600 underline">
              {tc('cancel')}
            </button>
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
          <label className="block text-xs font-semibold text-red-800" htmlFor={`reason-${orderId}`}>
            {t('handover.whatHappened')}
          </label>
          <div className="flex gap-2">
            <input
              id={`reason-${orderId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="flex-1 h-10 rounded-lg border border-red-300 px-3 text-sm"
              minLength={3}
              maxLength={500}
              required
            />
            <button
              type="submit"
              disabled={!!busy || reason.trim().length < 3}
              className="px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              {busy === 'delivery-failed' ? t('handover.sending') : t('handover.report')}
            </button>
            <button type="button" onClick={() => setMode('idle')} className="px-3 text-sm text-gray-600 underline">
              {tc('cancel')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
