/**
 * What went wrong when a page could not load its data, in the terms a person needs to decide what to do: check the
 * connection, wait a moment, or just try again. A page that shows an empty list for a failed load tells a customer their
 * orders are gone, so every list shows one of these instead (see components/ui/LoadError.tsx).
 *
 * Pure on purpose (no axios or React import): it reads the shape an axios error has.
 */

export type LoadFailure = 'offline' | 'busy' | 'server' | 'refused' | 'unknown';

interface RequestFailure {
  isAxiosError?: boolean;
  code?: string;
  response?: { status?: number; data?: { error?: { message?: unknown } } };
}

const asFailure = (err: unknown): RequestFailure | null =>
  err && typeof err === 'object' && (err as RequestFailure).isAxiosError ? (err as RequestFailure) : null;

/**
 * - offline: no answer at all (no network, the server refused the connection, the request timed out)
 * - busy: 429, too many requests
 * - server: 5xx, or an answer that is not what the API sends (a proxy's page, a captive portal)
 * - refused: another 4xx, the server answered and said no (its own message is the thing to show)
 * - unknown: not a request error at all (a bug in the page's own code)
 */
export function classifyLoadFailure(err: unknown): LoadFailure {
  const failure = asFailure(err);
  if (!failure) return 'unknown';
  // axios's own code for an answer that cannot be used (a 5xx, or a 200 that is not the API's JSON: see isHtmlPage).
  if (failure.code === 'ERR_BAD_RESPONSE') return 'server';
  const status = failure.response?.status;
  if (status === undefined) return 'offline';
  if (status === 429) return 'busy';
  if (status >= 500) return 'server';
  return 'refused';
}

/** The server's own words for a refusal (a 4xx) when it sent any, else null. */
export function serverMessageOf(err: unknown): string | null {
  const message = asFailure(err)?.response?.data?.error?.message;
  return typeof message === 'string' && message.trim() ? message.trim() : null;
}

/**
 * A body that is a web page. A proxy's error page or a Wi-Fi network's sign-in page can come back with status 200 where
 * the API's JSON was expected; it is not an answer from the API, and a page that read it as "no data" would show an
 * empty list.
 */
export function isHtmlPage(body: unknown): boolean {
  return typeof body === 'string' && /^\s*<(!doctype\s+html|html[\s>]|head[\s>]|body[\s>])/i.test(body);
}
