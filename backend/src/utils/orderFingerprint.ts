import { createHash } from 'crypto';

/**
 * What a checkout asked for, as one short string (MONEY-7). An Idempotency-Key promises "this is the same order
 * again": a retry gets the order already placed. Sent with a different basket or delivery, the key is being reused
 * for a new order, which used to be dropped silently; now the order keeps a fingerprint of its request and a reused
 * key with a different one is refused. The fingerprint ignores how the request was written: item order, a dish
 * listed twice instead of once with quantity two, the case and spacing of a promo code.
 */
export interface FingerprintedOrder {
  items: Array<{ productId: string; variantId?: string | null; quantity: number; stockType?: string | null; hubId?: string | null }>;
  deliveryType: string;
  deliveryAddressId?: string | null;
  hubId?: string | null;
  deliverySlotDate?: string | null;
  deliverySlotTime?: string | null;
  paymentMethod: string;
  promotionCode?: string | null;
  deliveryInstructions?: string | null;
}

export function orderFingerprint(o: FingerprintedOrder): string {
  const lines = new Map<string, number>();
  for (const i of o.items) {
    const key = [i.productId, i.variantId ?? '', i.stockType ?? '', i.hubId ?? ''].join('|');
    lines.set(key, (lines.get(key) ?? 0) + Number(i.quantity));
  }
  const canonical = {
    items: [...lines.entries()].sort(([a], [b]) => a.localeCompare(b)),
    deliveryType: o.deliveryType,
    deliveryAddressId: o.deliveryAddressId ?? null,
    hubId: o.hubId ?? null,
    slot: [o.deliverySlotDate ?? null, o.deliverySlotTime ?? null],
    paymentMethod: o.paymentMethod,
    promotionCode: o.promotionCode?.trim().toUpperCase() || null,
    deliveryInstructions: o.deliveryInstructions?.trim() || null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
