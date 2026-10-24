import type { Metadata } from 'next';
import ProductDetailPage, { type RawProduct } from './ProductDetailPage';
import { dishMetadata, NOT_FOUND_METADATA, routeSegment, type PublicDish } from '@/lib/seo';
import { publicApiGet } from '@/lib/server/public-api';
import { siteUrl } from '@/lib/site';

type Props = { params: Promise<{ id: string }> };

/**
 * The title and the preview a chat app shows when a dish's link is shared. When the API cannot be reached the site's
 * own title and description stand.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = routeSegment((await params).id);
  if (!id) return NOT_FOUND_METADATA;
  const read = await publicApiGet<PublicDish>(`/products/${id}`);
  if (read.kind === 'missing') return NOT_FOUND_METADATA;
  if (read.kind === 'unavailable') return {};
  return dishMetadata(read.data, `/products/${id}`, siteUrl());
}

/**
 * The page is rendered with the dish on the server (the same read as the preview above, made once per request), so the
 * first paint and what a search engine reads without running scripts already show it. Without it (the API unreachable,
 * or a dish only its kitchen may see) the page loads it in the browser as before.
 */
export default async function Page({ params }: Props) {
  const id = routeSegment((await params).id);
  const read = id ? await publicApiGet<RawProduct>(`/products/${id}`) : null;
  return <ProductDetailPage initial={read?.kind === 'ok' ? read.data : undefined} />;
}
