/**
 * What a customer is told about why an order of theirs was cancelled. Only reasons written for the customer to read are
 * repeated: the kitchen's (picked from a list) and the system's ("not accepted in time"). A note a support person typed on
 * their own account is theirs, and the customer's own reason they wrote themselves.
 */
export function cancellationReasonForCustomer(cancelledBy: string | null | undefined, reason: string | null | undefined): string | null {
  if (cancelledBy !== 'seller' && cancelledBy !== 'system') return null;
  const text = (reason ?? '').replace(/^Rejected by kitchen:\s*/i, '').trim();
  return text || null;
}
