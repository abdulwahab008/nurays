'use client';

import { useEffect, useState } from 'react';
import { cartService, type DeliveryEstimate } from '@/lib/services/cart.service';
import { addressService } from '@/lib/services/address.service';

/** Stands for the customer's default saved address (or the first one), for a screen that has not been told which to use. */
export const DEFAULT_ADDRESS = 'default';

interface Answer {
  addressId: string;
  key: string;
  value: DeliveryEstimate | null;
}

/**
 * What delivering the signed-in customer's tray to an address costs, as the server works it out (the fee, what would
 * waive it, whether the kitchen delivers there at all). Nothing is guessed here: `estimate` is null when it cannot be
 * asked for (not enabled, no address) or the server could not say, and the screen then says it is worked out later.
 *
 * `version` must change whenever the tray changed on the server (a dish added, removed, a quantity changed) so the
 * estimate is asked for again. While the new answer is on its way the previous one for the same address is still
 * returned, with `pending` true, so the screen can show it as out of date instead of blanking.
 */
export function useDeliveryEstimate({
  enabled,
  addressId,
  version,
}: {
  enabled: boolean;
  addressId: string | null;
  version: number;
}): { estimate: DeliveryEstimate | null; pending: boolean } {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const wanted = enabled && !!addressId;
  const key = `${addressId}:${version}`;

  useEffect(() => {
    if (!wanted || !addressId) return;
    let cancelled = false;
    (async () => {
      let value: DeliveryEstimate | null = null;
      try {
        let id: string | null = addressId;
        if (addressId === DEFAULT_ADDRESS) {
          const saved = (await addressService.getAddresses()).data ?? [];
          id = (saved.find((a) => a.isDefault) ?? saved[0])?.id ?? null;
        }
        if (id) value = (await cartService.getDeliveryFeeEstimate(id)).data ?? null;
      } catch {
        // no estimate: the screen says what it can and the order is priced by the server anyway
      }
      if (!cancelled) setAnswer({ addressId, key, value });
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted, addressId, key]);

  if (!wanted) return { estimate: null, pending: false };
  return {
    estimate: answer && answer.addressId === addressId ? answer.value : null,
    pending: answer?.key !== key,
  };
}
