// Sending a signed-out visitor to sign in and bringing them back to the page they asked for.
//
// The page is carried in the sign-in address as ?next=<path>. It is only ever followed when it is a path on this site: an
// address that names another site, or that the browser could read as one ("//evil.example", "/\evil.example"), is ignored.

const NEVER_RETURN_TO = /^\/(login|register|forgot-password|reset-password|verify-email|verify-email-pending|admin\/login)(\/|\?|#|$)/;
const MAX_LENGTH = 400;

/** The path to go to after signing in, from the value of ?next= (or the older ?redirect=), or null when there is none or it is not safe. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > MAX_LENGTH) return null;
  // eslint-disable-next-line no-control-regex -- control characters are what this refuses
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (NEVER_RETURN_TO.test(raw)) return null;
  // Whatever the path decodes to must stay on this site too (a "%2F%2Fevil.example" is "//evil.example" once decoded).
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('//') || /[\u0000-\u001f\u007f\\]/.test(decoded)) return null;
  } catch {
    return null;
  }
  return raw;
}

/** The sign-in address that brings the person back to `path` (a path with its query string) afterwards. */
export function loginUrlFor(path: string, loginPath = '/login'): string {
  const next = safeNextPath(path);
  return next ? `${loginPath}?next=${encodeURIComponent(next)}` : loginPath;
}

// Signing out makes the guards of the page, and of every page still in the tab's history (Back), send the now signed-out
// visitor to sign in. None of them may carry its page along: the next person to sign in on this device would be sent to
// the previous person's page. Back can load a page afresh, so the tab's session storage keeps the sign-out too.
const SIGNED_OUT_KEY = 'nuray-signed-out';
let signedOut = false;

function tabStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : (window.sessionStorage ?? null);
  } catch {
    return null;
  }
}

/** Called when someone signs out: sign-in addresses no longer carry the page as ?next= until someone signs in. */
export function noteSignOut(): void {
  signedOut = true;
  try {
    tabStorage()?.setItem(SIGNED_OUT_KEY, '1');
  } catch {
    // Storage refused (private mode): this page load still remembers.
  }
}

/** Called when someone signs in: pages carry themselves as ?next= again. */
export function clearSignOut(): void {
  signedOut = false;
  try {
    tabStorage()?.removeItem(SIGNED_OUT_KEY);
  } catch {
    // As above.
  }
}

function hasSignedOut(): boolean {
  if (signedOut) return true;
  try {
    return tabStorage()?.getItem(SIGNED_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

/** The sign-in address that brings the person back to the page they are on now. */
export function loginUrlHere(loginPath = '/login'): string {
  if (typeof window === 'undefined' || hasSignedOut()) return loginPath;
  return loginUrlFor(window.location.pathname + window.location.search, loginPath);
}

export type AccountType = 'customer' | 'seller' | 'rider' | 'admin' | 'hub_manager';

const AREAS: Array<{ path: RegExp; role: AccountType }> = [
  { path: /^\/admin(?!\/login(\/|\?|#|$))(\/|\?|#|$)/, role: 'admin' },
  { path: /^\/sellers(?!\/register(\/|\?|#|$))(\/|\?|#|$)/, role: 'seller' },
  { path: /^\/riders(\/|\?|#|$)/, role: 'rider' },
  { path: /^\/hub(\/|\?|#|$)/, role: 'hub_manager' },
  { path: /^\/(orders|cart|wallet|checkout)(\/|\?|#|$)/, role: 'customer' },
];

/** The one kind of account a page is for, or null when anyone may open it. */
export function accountTypeFor(path: string): AccountType | null {
  return AREAS.find((a) => a.path.test(path))?.role ?? null;
}

/**
 * Where to go after signing in: the page asked for (?next= or ?redirect= in the address bar), else `fallback` (the
 * account's home). A page that is for another kind of account than the home's is not followed: a kitchen sent to a
 * rider's page would only be bounced away from it.
 */
export function landingAfterLogin(fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search);
  const next = safeNextPath(params.get('next') ?? params.get('redirect'));
  if (!next) return fallback;
  const needs = accountTypeFor(next);
  const home = accountTypeFor(fallback) ?? 'customer';
  return needs === null || needs === home ? next : fallback;
}
