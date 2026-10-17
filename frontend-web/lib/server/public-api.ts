/**
 * Reads of the public API made on the web server, for a page's metadata (its title and link preview). Only for server
 * code: the browser talks to the API itself.
 *
 * The address is API_INTERNAL_URL when it is set (the API's address as the web server sees it, for example
 * http://backend:3001/api/v1 in Docker), else NEXT_PUBLIC_API_URL. A read never throws and never waits long: when the API
 * cannot be reached the page is still served, with the site's own title and description.
 */
import { API_BASE_URL } from '../config';
import { classifyPublicRead, type PublicRead } from './public-read';

export type { PublicRead };

export async function publicApiGet<T>(path: string, { revalidate = 300, timeoutMs = 3000 } = {}): Promise<PublicRead<T>> {
  const base = (process.env.API_INTERNAL_URL || API_BASE_URL).replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) return { kind: 'unavailable' };
  try {
    const response = await fetch(`${base}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      next: { revalidate },
    });
    const body = await response.json().catch(() => null);
    return classifyPublicRead<T>(response.status, body);
  } catch {
    return { kind: 'unavailable' };
  }
}
