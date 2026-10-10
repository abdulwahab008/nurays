import type { MetadataRoute } from 'next';
import { publicApiGet } from '@/lib/server/public-api';
import { siteUrl } from '@/lib/site';

/**
 * The public pages, and the kitchens the API lists (it lists at most 50, the best rated first: a full listing of every
 * kitchen and dish would need an endpoint of its own). Empty without a site address (NEXT_PUBLIC_SITE_URL); when the API
 * cannot be reached the fixed pages are still listed.
 */
// Built when asked (the API is not reachable while the site is being built); the kitchens it reads are cached for an hour.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  if (!base) return [];
  const fixed = ['/', '/products', '/kitchens', '/help', '/terms', '/privacy', '/refund-policy'].map((path) => ({ url: `${base}${path}` }));
  const kitchens = await publicApiGet<Array<{ id?: string }>>('/sellers?limit=50', { revalidate: 3600 });
  const listed = kitchens.kind === 'ok' && Array.isArray(kitchens.data) ? kitchens.data : [];
  return [
    ...fixed,
    ...listed.filter((k) => typeof k.id === 'string').map((k) => ({ url: `${base}/kitchens/${k.id}` })),
  ];
}
