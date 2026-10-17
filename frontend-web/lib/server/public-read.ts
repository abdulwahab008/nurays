// What an answer from the public API means for a page that reads it on the server. No imports: unit-tested on its own.

/** What a read found: the data, nothing there (the thing asked for does not exist), or no usable answer. */
export type PublicRead<T> = { kind: 'ok'; data: T } | { kind: 'missing' } | { kind: 'unavailable' };

/**
 * A 404 only means "this dish or kitchen does not exist" when it comes from the API with a reason of its own
 * (PRODUCT_NOT_FOUND, SELLER_NOT_FOUND...). The API also answers 404 NOT_FOUND for an address it has no route for, and
 * anything else that answers 404 (a proxy, a web server, the wrong host) says nothing about the dish at all. Taking those for
 * "missing" turned every dish and kitchen page into "not found", with search engines told to leave, whenever the address of
 * the API was set a little wrong.
 */
export function classifyPublicRead<T>(status: number, body: unknown): PublicRead<T> {
  const parsed = (body ?? null) as { success?: boolean; data?: T; error?: { code?: unknown } } | null;
  if (status === 404) {
    const code = parsed && parsed.success === false && typeof parsed.error?.code === 'string' ? parsed.error.code : null;
    return code && code !== 'NOT_FOUND' ? { kind: 'missing' } : { kind: 'unavailable' };
  }
  if (status < 200 || status > 299) return { kind: 'unavailable' };
  return parsed?.success && parsed.data ? { kind: 'ok', data: parsed.data } : { kind: 'unavailable' };
}
