/**
 * Shared pieces of the load-test tooling (see docs/LOAD_TESTING.md): where the generated files go, a seeded
 * random generator, sizes that can be scaled down, and the percentile arithmetic the reports use.
 */
import fs from 'fs';
import path from 'path';

export const GENERATED_DIR = path.join(__dirname, '.generated');
export const FIXTURE_FILE = path.join(GENERATED_DIR, 'fixture.json');
export const TOKENS_FILE = path.join(GENERATED_DIR, 'tokens.json');

/** The password of every account the seeder makes. The accounts exist only in a database named *_load. */
export const LOAD_PASSWORD = 'LoadTest-2026!';
export const LOAD_EMAIL_DOMAIN = 'nuray.load';

/** What the seeder writes down for the runner: ids to browse, accounts to sign in as, jobs to claim. */
export interface Fixture {
  createdAt: string;
  password: string;
  admin: { email: string; phone: string; userId: string };
  productIds: string[];
  productSlugs: string[];
  sellerIds: string[];
  categoryIds: string[];
  communityIds: string[];
  customers: Array<{ email: string; phone: string; userId: string; addressId: string; sellerProductIds: string[] }>;
  riders: Array<{ email: string; phone: string; userId: string; riderId: string; activeDeliveryId: string | null }>;
  /** `nearbyCustomers`: emails of fixture customers within the kitchen's delivery range (Nuray riders deliver up to 20 km). */
  kitchens: Array<{ email: string; phone: string; userId: string; sellerId: string; productIds: string[]; nearbyCustomers: string[] }>;
  openJobs: Array<{ deliveryId: string; orderId: string; handoverCode: string }>;
}

export interface TokenFile {
  createdAt: string;
  /** Access tokens last an hour: when the run is longer, mint again. */
  expiresAt: string;
  customers: Array<{ email: string; userId: string; token: string }>;
  riders: Array<{ email: string; userId: string; token: string }>;
  kitchens: Array<{ email: string; userId: string; token: string }>;
  admin: { email: string; userId: string; token: string } | null;
}

export function readJson<T>(file: string, what: string): T {
  if (!fs.existsSync(file)) throw new Error(`${what} not found at ${file}. ${what === 'The fixture' ? 'Run `npm run load:seed` first.' : 'Run `npm run load:tokens` first.'}`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

/** A small deterministic generator (mulberry32), so two seeds with the same LOAD_SEED are the same data. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A size from the environment (`LOAD_<NAME>`), else `fallback` times LOAD_SCALE (at least 1). */
export function size(name: string, fallback: number): number {
  const explicit = process.env[`LOAD_${name}`];
  if (explicit !== undefined && explicit !== '') {
    const n = Number(explicit);
    if (!Number.isInteger(n) || n < 0) throw new Error(`LOAD_${name} must be a whole number, got "${explicit}"`);
    return n;
  }
  const scale = Number(process.env.LOAD_SCALE ?? 1);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`LOAD_SCALE must be a positive number, got "${process.env.LOAD_SCALE}"`);
  return Math.max(1, Math.round(fallback * scale));
}

/** The q-quantile (0..1) of an ascending list. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** The database name in a connection URL, or null when it has none. */
export function databaseName(url: string | undefined): string | null {
  try {
    return url ? decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) || null : null;
  } catch {
    return null;
  }
}
