import type { Metadata } from 'next';
import KitchenStorefrontPage from './KitchenStorefrontPage';
import { kitchenMetadata, NOT_FOUND_METADATA, routeSegment, type PublicKitchen } from '@/lib/seo';
import { publicApiGet } from '@/lib/server/public-api';
import { siteUrl } from '@/lib/site';

type Props = { params: Promise<{ id: string }> };

/**
 * The title and the preview a chat app shows when a kitchen's link is shared. The page itself is the client page beside
 * this file; when the API cannot be reached the site's own title and description stand.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = routeSegment((await params).id);
  if (!id) return NOT_FOUND_METADATA;
  const read = await publicApiGet<PublicKitchen>(`/sellers/${id}`);
  if (read.kind === 'missing') return NOT_FOUND_METADATA;
  if (read.kind === 'unavailable') return {};
  return kitchenMetadata(read.data, `/kitchens/${id}`, siteUrl());
}

export default function Page() {
  return <KitchenStorefrontPage />;
}
