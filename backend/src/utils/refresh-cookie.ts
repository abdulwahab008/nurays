/**
 * The refresh token as an httpOnly cookie: page scripts cannot read it, so an injected script cannot carry a long-lived
 * sign-in away. It is scoped to the auth routes, the only ones that read it; every other route still takes the short-lived
 * access token from the Authorization header, so they need no CSRF defence of their own. The two routes that act on the
 * cookie alone (refresh, logout) accept it only from the website's own origin.
 */
import type { NextFunction, Request, Response } from 'express';
import { isProduction } from '../config/env';
import { tokenExpiry } from './jwt';

export const REFRESH_COOKIE = 'nuray_rt';
const COOKIE_PATH = `/api/${process.env.API_VERSION || 'v1'}/auth`;

const cookieOptions = () => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: 'lax' as const,
  path: COOKIE_PATH,
});

export function setRefreshCookie(res: Response, refreshToken: string): void {
  const expires = tokenExpiry(refreshToken);
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions(), expires });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

export function readRefreshCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === REFRESH_COOKIE) {
      const value = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(value) || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** A browser always sends Origin on a cross-origin POST; only the website's own may act on the cookie. */
export function fromWebsite(req: Request): boolean {
  const allowed = (process.env.CORS_ORIGIN || 'http://localhost:3000').trim();
  return req.headers.origin === allowed;
}

type TokenBody = { data?: { tokens?: { refresh_token?: unknown }; refreshToken?: unknown } };

/** Any auth response that hands out a refresh token also puts it in the cookie. */
export function refreshCookieOnSignIn(_req: Request, res: Response, next: NextFunction): void {
  const json = res.json.bind(res);
  res.json = (body: TokenBody) => {
    const token = body?.data?.tokens?.refresh_token ?? body?.data?.refreshToken;
    if (typeof token === 'string' && res.statusCode < 400) setRefreshCookie(res, token);
    return json(body);
  };
  next();
}
