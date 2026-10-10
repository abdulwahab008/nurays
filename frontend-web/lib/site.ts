/**
 * The address the site is served from (NEXT_PUBLIC_SITE_URL, for example https://nuray.pk): the origin only, no path.
 * Pages use it for the links they give to the outside world: the canonical address, the preview a chat app shows for a
 * shared link, and the sitemap. When it is not set (development, staging) there is none: search engines are told to
 * stay away (app/robots.ts) and pages carry no absolute address of their own.
 *
 * No imports, so `npm test` covers it (tests/unit/seo.test.ts).
 */
export function siteUrl(raw: string | undefined = process.env.NEXT_PUBLIC_SITE_URL): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** `path` on the site, or null when the site's address is not set. */
export function absoluteUrl(path: string, base: string | null = siteUrl()): string | null {
  if (!base) return null;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
