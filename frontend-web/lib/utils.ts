import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// The order maths lives in its own file (no imports, so a test can read it); pages keep importing it from here.
export { GST_RATE, orderTotals } from './order-totals';

export function formatPrice(price: number | string | undefined | null): string {
  const num = Number(price ?? 0);
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
  }).format(isNaN(num) ? 0 : num);
}

/** Dates follow the page's language (Urdu month names, Western digits as on Pakistani apps). */
function dateLocale(): string {
  return typeof document !== 'undefined' && document.documentElement.lang === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK';
}

export function formatDate(date: string | Date | undefined | null): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(dateLocale(), {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return '—';
  }
}

export function formatDateTime(date: string | Date | undefined | null): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat(dateLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '—';
  }
}

export function formatPhoneNumber(phone: string): string {
  // Format +923001234567 to +92 300 1234567
  if (phone.startsWith('+92')) {
    return `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
  }
  return phone;
}

export function maskPhoneNumber(phone: string): string {
  // Mask +923001234567 to +9230012***67
  if (phone.length > 7) {
    return `${phone.slice(0, 7)}***${phone.slice(-2)}`;
  }
  return phone;
}


/**
 * A smaller stored size of an uploaded photo. Uploads are stored in three sizes
 * ("...-lg.webp", "-md.webp", "-sm.webp"); lists should load "md" or "sm" instead of
 * the full photo. Older images (and external ones) are returned unchanged.
 */
export function imageVariant(url: string | null | undefined, size: 'sm' | 'md' | 'lg'): string | undefined {
  if (!url) return undefined;
  return url.replace(/-(lg|md|sm)\.webp(\?.*)?$/, `-${size}.webp$2`);
}

/**
 * A rating to show, or null when there isn't one yet (no reviews): show "New" instead of
 * inventing a number.
 */
export function displayRating(rating: number | string | null | undefined, reviewCount?: number | null): string | null {
  const r = Number(rating);
  if (!Number.isFinite(r) || r <= 0) return null;
  if (reviewCount != null && reviewCount <= 0) return null;
  return r.toFixed(1);
}

/** Where each kind of account lands after signing in. */
export function homeFor(userType?: string | null): string {
  switch (userType) {
    case 'admin':
      return '/admin/dashboard';
    case 'seller':
      return '/sellers/dashboard';
    case 'rider':
      return '/riders/dashboard';
    case 'hub_manager':
      return '/hub';
    default:
      return '/dashboard';
  }
}
