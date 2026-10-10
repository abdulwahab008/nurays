/**
 * A free-text search term as it may reach a `contains` filter: trimmed, capped, and with the
 * ILIKE wildcards escaped so "100%" looks for the text 100% rather than everything.
 * Returns null when nothing useful is left.
 */
export function searchTerm(raw: unknown, max = 100): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, max);
  if (!trimmed) return null;
  return trimmed.replace(/[\\%_]/g, (c) => `\\${c}`);
}
