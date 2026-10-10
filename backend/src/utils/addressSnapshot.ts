/**
 * The address an order is delivered to is frozen on the order when it is placed (`deliveryAddressSnapshot`),
 * so editing or deleting the saved address later cannot move an order that is already on its way. Orders
 * placed before the snapshot kept every field have a snapshot with fewer keys, and orders older than the
 * snapshot have none: for those the saved address is all there is.
 *
 * One rule for every reader (kitchen, rider, dispatch): a field the snapshot HAS is final, even when it is
 * empty (the customer left it empty); a field it does not have comes from the saved address.
 */

export const ADDRESS_FIELDS = ['addressLine1', 'addressLine2', 'houseNumber', 'landmark', 'area', 'city', 'postalCode', 'latitude', 'longitude'] as const;
export type AddressField = (typeof ADDRESS_FIELDS)[number];

type Row = Record<string, unknown>;

const asRow = (value: unknown): Row | null => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : null);

/** One field of the door the order is going to: the snapshot's when it has the key, else the saved address's. */
export function doorField(snapshot: unknown, saved: unknown, key: AddressField): unknown {
  const snap = asRow(snapshot);
  if (snap && key in snap) return snap[key];
  return asRow(saved)?.[key];
}

/** The saved address row with the snapshot's value over each field the snapshot has; null when there is neither. */
export function addressAsOrdered(snapshot: unknown, saved: unknown): Row | null {
  const snap = asRow(snapshot);
  const row = asRow(saved);
  if (!snap && !row) return null;
  const out: Row = { ...(row ?? {}) };
  if (snap) for (const key of ADDRESS_FIELDS) if (key in snap) out[key] = snap[key];
  return out;
}
