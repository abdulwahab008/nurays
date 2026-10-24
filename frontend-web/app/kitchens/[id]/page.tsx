import type { Metadata } from 'next';
import KitchenStorefrontPage from './KitchenStorefrontPage';
import { kitchenMetadata, NOT_FOUND_METADATA, routeSegment, type PublicKitchen } from '@/lib/seo';
import { publicApiGet } from '@/lib/server/public-api';
import type { PublicSeller } from '@/lib/services/seller.service';
import { siteUrl } from '@/lib/site';

type Props = { params: Promise<{ id: string }> };

/**
 * The title and the preview a chat app shows when a kitchen's link is shared. When the API cannot be reached the site's
 * own title and description stand.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = routeSegment((await params).id);
  if (!id) return NOT_FOUND_METADATA;
  const read = await publicApiGet<PublicKitchen>(`/sellers/${id}`);
  if (read.kind === 'missing') return NOT_FOUND_METADATA;
  if (read.kind === 'unavailable') return {};
  return kitchenMetadata(read.data, `/kitchens/${id}`, siteUrl());
}

/**
 * The page is rendered with the kitchen and its menu on the server (the same read as the preview above, made once per
 * request), so the first paint and what a search engine reads without running scripts already show them. Without it
 * (the API unreachable) the page loads the kitchen in the browser as before.
 */
export default async function Page({ params }: Props) {
  const id = routeSegment((await params).id);
  const read = id ? await publicApiGet<PublicSeller>(`/sellers/${id}`) : null;
  return <KitchenStorefrontPage initial={read?.kind === 'ok' ? read.data : undefined} />;
}
