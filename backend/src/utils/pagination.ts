/** Deepest page served. Nobody pages this far, and a larger skip overflows the database's integer (a 500). */
export const MAX_PAGE = 100_000;

/**
 * Page and page-size from untrusted input. Anything that is not a whole number from 1 up
 * becomes the default; the page and the size are capped. (A negative or oversized skip or take
 * makes Prisma throw a 500.)
 */
export function pageArgs(page: unknown, limit: unknown, def = 20, max = 100) {
  const p = Math.min(MAX_PAGE, Math.max(1, Math.trunc(Number(page)) || 1));
  const l = Math.min(max, Math.max(1, Math.trunc(Number(limit)) || def));
  return { page: p, limit: l, skip: (p - 1) * l };
}
