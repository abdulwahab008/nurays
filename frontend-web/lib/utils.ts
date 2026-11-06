import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// The order maths lives in its own file (no imports, so a test can read it); pages keep importing it from here.
export { GST_RATE, orderTotals } from './order-totals';

export function formatPrice(price: number | string | undefined | null): string {
  const raw = Number(price ?? 0);
  const num = isNaN(raw) ? 0 : raw;
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/** Dates follow the page's language (Urdu month names, Western digits as on Pakistani apps). */
const isUrdu = () => typeof document !== 'undefined' && document.documentElement.lang === 'ur';
const dateLocale = () => (isUrdu() ? 'ur-PK-u-nu-latn' : 'en-PK');

function toDate(date: string | Date | undefined | null): Date | null {
  if (!date) return null;
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * In Urdu the time ("9:35 PM", Intl has no Urdu word for PM) sits inside right-to-left text, where the bidi algorithm
 * would move "PM" ahead of the digits. A left-to-right isolate (LRI ... PDI) keeps it in one piece, and a no-break space
 * keeps "PM" on the digits' line.
 */
function clock(d: Date, hour: 'numeric' | '2-digit'): string {
  const time = new Intl.DateTimeFormat(dateLocale(), { hour, minute: '2-digit' }).format(d).replace(/\s/g, '\u00a0');
  return isUrdu() ? `\u2066${time}\u2069` : time;
}

export function formatDate(date: string | Date | undefined | null): string {
  const d = toDate(date);
  if (!d) return '—';
  return new Intl.DateTimeFormat(dateLocale(), { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}

/** "9:35 pm", the one way to write a time of day. */
export function formatTime(date: string | Date | undefined | null): string {
  const d = toDate(date);
  return d ? clock(d, 'numeric') : '—';
}

export function formatDateTime(date: string | Date | undefined | null): string {
  const d = toDate(date);
  if (!d) return '—';
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  if (!isUrdu()) return new Intl.DateTimeFormat(dateLocale(), { ...options, hour: '2-digit', minute: '2-digit' }).format(d);
  return `${new Intl.DateTimeFormat(dateLocale(), options).format(d)}، ${clock(d, '2-digit')}`;
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
      return '/';
  }
}
