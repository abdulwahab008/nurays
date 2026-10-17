/**
 * The line shown on a cancelled order's page. The kitchen's reason (picked from a list) and the system's ("not accepted in
 * time") are repeated; a note a support person typed on their own account is not, and the customer needs no telling of their
 * own reason. The server applies the same rule to the notification (backend/src/utils/cancellationText.ts).
 */
export type CancelledBy = 'seller' | 'system' | 'customer' | 'admin' | string;

export function customerCancellationReason(cancelledBy: CancelledBy | null | undefined, reason: string | null | undefined): string | null {
  if (cancelledBy !== 'seller' && cancelledBy !== 'system') return null;
  const text = (reason ?? '').replace(/^Rejected by kitchen:\s*/i, '').trim();
  return text || null;
}

export type CancellationNotice = { who: 'kitchen' | 'system' | 'you' | 'support'; reason: string | null } | null;

/** Who cancelled the order, and the reason the customer is to read, or null when the record does not say. */
export function cancellationNotice(cancelledBy: CancelledBy | null | undefined, reason: string | null | undefined): CancellationNotice {
  switch (cancelledBy) {
    case 'seller':
      return { who: 'kitchen', reason: customerCancellationReason(cancelledBy, reason) };
    case 'system':
      return { who: 'system', reason: customerCancellationReason(cancelledBy, reason) };
    case 'customer':
      return { who: 'you', reason: null };
    case 'admin':
      return { who: 'support', reason: null };
    default:
      return null;
  }
}
