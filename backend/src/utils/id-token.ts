import { createPublicKey, verify, type JsonWebKey } from 'crypto';

/**
 * Verifying an OpenID Connect ID token (a JWT), which is what a native app's sign-in with Google or Apple hands over.
 * The token is trusted only after its RS256 signature checks out against one of the provider's published keys, and
 * its issuer, audience (this app's client ids), expiry and e-mail verification all match. Nothing here talks to a
 * user's account: it only says who the provider vouches for. google-id-token.ts and apple-id-token.ts are the two
 * providers.
 *
 * Keys are cached for as long as the provider says (an hour by default); a key id nobody has seen triggers one new
 * fetch, no more than once a minute.
 */

const FETCH_TIMEOUT_MS = 10_000;
const CLOCK_SKEW_SECONDS = 60;
const MIN_REFETCH_MS = 60_000;
const DEFAULT_KEY_TTL_MS = 3_600_000;
const MIN_KEY_TTL_MS = 60_000;
const MAX_KEY_TTL_MS = 24 * 3_600_000;

export type IdTokenFailure =
  | 'malformed'
  | 'algorithm'
  | 'unknown_key'
  | 'signature'
  | 'issuer'
  | 'audience'
  | 'expired'
  | 'no_subject'
  | 'no_email'
  | 'email_unverified'
  /** The provider's keys could not be fetched (and none are cached): not the token's fault. */
  | 'unavailable';

export class IdTokenError extends Error {
  constructor(public readonly reason: IdTokenFailure) {
    super(`ID token refused: ${reason}`);
    this.name = 'IdTokenError';
  }
}

export interface VerifiedIdentity {
  /** The provider's stable id for the person. */
  subject: string;
  email: string;
  /** Empty when the token carries none (Apple never puts the name in its token). */
  name: string;
  picture: string | null;
}

interface Key extends JsonWebKey {
  kid: string;
}
interface KeyCache {
  keys: Map<string, Key>;
  fetchedAt: number;
  expiresAt: number;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; headers: { get(name: string): string | null }; json(): Promise<unknown> }>;

const decode = (part: string): Record<string, unknown> => {
  try {
    const value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    /* falls through */
  }
  throw new IdTokenError('malformed');
};

/** Whether the token's signature (RS256 over "header.payload") was made by the private half of this key. */
function signatureMatches(parts: string[], jwk: Key): boolean {
  try {
    return verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  } catch {
    return false; // a key or signature that cannot even be read is not a match
  }
}

function ttlFrom(cacheControl: string | null): number {
  const seconds = Number(/max-age=(\d+)/i.exec(cacheControl ?? '')?.[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_KEY_TTL_MS;
  return Math.min(MAX_KEY_TTL_MS, Math.max(MIN_KEY_TTL_MS, seconds * 1000));
}

export interface Provider {
  /** Where the provider publishes its signing keys (a JWKS). */
  certsUrl: string;
  /** The `iss` values its tokens carry. */
  issuers: string[];
}

export interface VerifyOptions {
  /** The client ids the token may have been issued to (this app's web client, and its native clients). */
  audiences: string[];
  /** Seconds since the epoch; the real time unless a test says otherwise. */
  nowSeconds?: number;
  fetchImpl?: FetchLike;
}

export interface IdTokenVerifier {
  /** Check a token and say who it is for. Throws `IdTokenError` with the reason when it should not be trusted. */
  verify(idToken: string, options: VerifyOptions): Promise<VerifiedIdentity>;
  /** Forget the cached keys (tests, and nothing else). */
  reset(): void;
}

/** A verifier for one provider, with its own key cache. */
export function createIdTokenVerifier(provider: Provider): IdTokenVerifier {
  const issuers = new Set(provider.issuers);
  let cache: KeyCache | null = null;
  let loading: Promise<void> | null = null;

  async function fetchKeys(fetchImpl: FetchLike, now: number): Promise<void> {
    const res = await fetchImpl(provider.certsUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error('the certs endpoint answered with an error');
    const body = (await res.json()) as { keys?: Array<Record<string, unknown>> };
    const keys = new Map<string, Key>();
    for (const k of body.keys ?? []) {
      if (k.kty === 'RSA' && typeof k.kid === 'string' && typeof k.n === 'string' && typeof k.e === 'string') {
        keys.set(k.kid, { kty: 'RSA', kid: k.kid, n: k.n, e: k.e });
      }
    }
    if (keys.size === 0) throw new Error('certs held no usable keys');
    cache = { keys, fetchedAt: now, expiresAt: now + ttlFrom(res.headers.get('cache-control')) };
  }

  /** The key with this id: from the cache while it is fresh, from a new fetch when it is stale or the id is new. */
  async function keyFor(kid: string, fetchImpl: FetchLike, now: number): Promise<Key | null> {
    const fresh = cache !== null && now < cache.expiresAt;
    if (fresh && cache!.keys.has(kid)) return cache!.keys.get(kid)!;
    const mayRefetch = cache === null || !fresh || now - cache.fetchedAt >= MIN_REFETCH_MS;
    if (mayRefetch) {
      loading ??= fetchKeys(fetchImpl, now)
        .catch((err) => {
          // The provider could not be reached: keep using keys we already hold (they rotate over days), else give up.
          if (cache === null) throw new IdTokenError('unavailable');
          void err;
        })
        .finally(() => {
          loading = null;
        });
      await loading;
    }
    return cache?.keys.get(kid) ?? null;
  }

  async function verify(idToken: string, options: VerifyOptions): Promise<VerifiedIdentity> {
    const parts = idToken.split('.');
    if (parts.length !== 3 || parts.some((p) => p.length === 0)) throw new IdTokenError('malformed');
    const header = decode(parts[0]);
    const claims = decode(parts[1]);

    // Only RS256: never "none", and never a symmetric algorithm that could be forged with a public key as the secret.
    if (header.alg !== 'RS256') throw new IdTokenError('algorithm');
    if (typeof header.kid !== 'string' || header.kid === '') throw new IdTokenError('unknown_key');

    const nowMs = options.nowSeconds !== undefined ? options.nowSeconds * 1000 : Date.now();
    const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    const jwk = await keyFor(header.kid, fetchImpl, nowMs);
    if (!jwk) throw new IdTokenError('unknown_key');

    if (!signatureMatches(parts, jwk)) throw new IdTokenError('signature');

    const nowSeconds = Math.floor(nowMs / 1000);
    if (typeof claims.iss !== 'string' || !issuers.has(claims.iss)) throw new IdTokenError('issuer');
    if (typeof claims.aud !== 'string' || !options.audiences.includes(claims.aud)) throw new IdTokenError('audience');
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) throw new IdTokenError('expired');
    if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_SECONDS > nowSeconds) throw new IdTokenError('expired');
    if (typeof claims.sub !== 'string' || claims.sub === '') throw new IdTokenError('no_subject');
    if (typeof claims.email !== 'string' || claims.email.trim() === '') throw new IdTokenError('no_email');
    // A JWT carries a boolean; some providers (Apple) and libraries send it as a string.
    if (claims.email_verified !== true && claims.email_verified !== 'true') throw new IdTokenError('email_unverified');

    return {
      subject: claims.sub,
      email: claims.email.trim().toLowerCase(),
      name: typeof claims.name === 'string' ? claims.name : '',
      picture: typeof claims.picture === 'string' ? claims.picture : null,
    };
  }

  return {
    verify,
    reset() {
      cache = null;
      loading = null;
    },
  };
}
