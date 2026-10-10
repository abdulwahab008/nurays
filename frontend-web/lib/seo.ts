/**
 * What a search engine or a chat app shows for a dish or a kitchen: the page title, the description, the picture. Built
 * from the public API's answer, with no imports (types only), so `npm test` covers it (tests/unit/seo.test.ts).
 *
 * Only what the page itself shows to anyone is used: the dish's name, description, price and photo, the kitchen's name,
 * description, cover photo, rating and area. Nothing about a person.
 */
import type { Metadata } from 'next';

const SITE_NAME = 'Nuray';

/** Text for a description: whitespace collapsed, and cut at a word to at most `max` characters, with "…" when cut. */
export function clip(text: string | null | undefined, max = 160): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  // The cut may already fall at the end of a word; if not, back up to the last space (unless that loses more than half).
  const endsAWord = /[\s,;:.\-–—!?]/.test(clean[max - 1]);
  const space = cut.lastIndexOf(' ');
  const kept = endsAWord || space <= max * 0.5 ? cut : cut.slice(0, space);
  return `${kept.replace(/[\s,;:.\-–—]+$/, '')}…`;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * A route parameter that is safe to put into an API path (a dish or kitchen id or slug), or null. The parameter is
 * whatever the visitor typed into the address bar.
 */
export function routeSegment(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : null;
}

/** The first of these that is an address a browser can load. */
function firstImage(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const value = text(candidate);
    if (/^https?:\/\//i.test(value)) return value;
  }
  return null;
}

/** Rupees the way the pages write them: whole amounts without decimals. */
const rupees = (amount: unknown): string => {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `Rs ${Number.isInteger(n) ? n : n.toFixed(2)}`;
};

/** What the page says about itself when there is nothing (yet) to say: not found, so nothing to list. */
export const NOT_FOUND_METADATA: Metadata = {
  title: `Not found | ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

interface Card {
  title: string;
  description: string;
  image: string | null;
  imageAlt: string;
  path: string;
  base: string | null;
  index: boolean;
}

function card({ title, description, image, imageAlt, path, base, index }: Card): Metadata {
  const url = base ? `${base}${path}` : undefined;
  return {
    title,
    description,
    ...(url ? { alternates: { canonical: url } } : {}),
    // With no site address (development, staging) nothing is offered to search engines.
    robots: index && base ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title,
      description,
      ...(url ? { url } : {}),
      ...(image ? { images: [{ url: image, alt: imageAlt }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/** The parts of the public dish the preview uses. */
export interface PublicDish {
  name?: string | null;
  description?: string | null;
  price?: number | null;
  unit?: string | null;
  isActive?: boolean | null;
  approvalStatus?: string | null;
  images?: Array<{ imageUrl?: string | null; isPrimary?: boolean | null }> | null;
  seller?: { businessName?: string | null } | null;
}

/**
 * The preview for a dish page. A dish that is not on sale (switched off, or not approved) is not offered to search
 * engines, though its link still previews.
 */
export function dishMetadata(dish: PublicDish, path: string, base: string | null): Metadata {
  const name = text(dish.name);
  if (!name) return NOT_FOUND_METADATA;
  const kitchen = text(dish.seller?.businessName);
  const images = dish.images ?? [];
  const primary = images.find((i) => i?.isPrimary) ?? images[0];
  const per = text(dish.unit) ? ` per ${text(dish.unit)}` : '';
  const price = rupees(dish.price);
  const description = [
    clip(dish.description, 120),
    price ? `${price}${per}` : '',
    kitchen ? `from ${kitchen} on ${SITE_NAME}` : `on ${SITE_NAME}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return card({
    title: kitchen ? `${name} by ${kitchen} | ${SITE_NAME}` : `${name} | ${SITE_NAME}`,
    description,
    image: firstImage(primary?.imageUrl),
    imageAlt: name,
    path,
    base,
    index: dish.isActive !== false && (!dish.approvalStatus || dish.approvalStatus === 'approved'),
  });
}

/** The parts of the public kitchen the preview uses. */
export interface PublicKitchen {
  businessName?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  ratingAverage?: number | null;
  totalReviews?: number | null;
  verificationStatus?: string | null;
  isVerified?: boolean | null;
  community?: { name?: string | null; city?: string | null } | null;
}

/** The preview for a kitchen page. A kitchen that is not verified is not offered to search engines. */
export function kitchenMetadata(kitchen: PublicKitchen, path: string, base: string | null): Metadata {
  const name = text(kitchen.businessName);
  if (!name) return NOT_FOUND_METADATA;
  const area = text(kitchen.community?.name);
  const city = text(kitchen.community?.city);
  const where = area || city;
  const reviews = Number(kitchen.totalReviews ?? 0);
  const rating = Number(kitchen.ratingAverage ?? 0);
  const rated = reviews > 0 && Number.isFinite(rating) && rating > 0 ? `★ ${rating.toFixed(1)} (${reviews} ${reviews === 1 ? 'review' : 'reviews'})` : '';
  const description = [
    clip(kitchen.description, 130) || `Home-cooked food from ${name}`,
    where ? `${where}${city && area && city !== area ? `, ${city}` : ''}` : '',
    rated,
  ]
    .filter(Boolean)
    .join(' · ');
  const verified = kitchen.verificationStatus ? kitchen.verificationStatus === 'approved' : kitchen.isVerified !== false;
  return card({
    title: `${name} | home kitchen${where ? ` in ${where}` : ''} on ${SITE_NAME}`,
    description,
    image: firstImage(kitchen.coverImageUrl),
    imageAlt: name,
    path,
    base,
    index: verified,
  });
}
