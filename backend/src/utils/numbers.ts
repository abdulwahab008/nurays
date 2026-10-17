/**
 * A finite number from anything that reads as one (a number, a numeric string, a database Decimal), else null. One
 * rule where several files each wrote their own: null for a missing value and for NaN or Infinity, so a location or a
 * fee that is not there is never turned into 0 or into NaN by accident.
 */
export const finiteOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
