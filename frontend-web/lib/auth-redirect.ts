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

/** The sign-in address that brings the person back to the page they are on now. */
export function loginUrlHere(loginPath = '/login'): string {
  if (typeof window === 'undefined') return loginPath;
  return loginUrlFor(window.location.pathname + window.location.search, loginPath);
}

/** Where to go after signing in: the page asked for (?next= or ?redirect= in the address bar), else `fallback`. */
export function landingAfterLogin(fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search);
  return safeNextPath(params.get('next') ?? params.get('redirect')) ?? fallback;
}
