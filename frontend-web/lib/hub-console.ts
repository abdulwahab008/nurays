/**
 * The cold hub console's rules: what the API sends, the -18°C line, the FEFO queue filter, new batch codes,
 * and how a temperature is written. No imports, so a unit test can read it (tests/unit/hub-console.test.ts).
 */

export interface Hub {
  id: string;
  name: string;
  code: string;
  city: string;
  area: string;
  address: string;
  status: string;
  availableProductsCount?: number;
}

export interface HubBatch {
  id: string;
  fefoPriority: number;
  batchNumber: string;
  barcode: string | null;
  quantity: number;
  status: string; // 'available' | 'damaged' | 'reserved' | 'expired'
  storageUnit: string;
  manufacturedDate: string | null;
  expiryDate: string;
  daysUntilExpiry: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  product: {
    id: string;
    name: string;
    nameUrdu?: string | null;
    price: number;
    image: string | null;
    seller: {
      id: string;
      businessName: string;
      isVerified: boolean;
    };
  };
  createdAt: string;
}

/** GET /hubs/:id/batches → summary */
export interface BatchSummary {
  totalBatches?: number;
  totalSellableUnits?: number;
  availableCount?: number;
  quarantinedCount?: number;
  expiringSoonCount?: number;
}

export interface HubStats {
  id: string;
  name: string;
  code: string;
  city: string;
  area: string;
  address: string;
  capacityCubicFeet: number;
  currentUtilization: number;
  freezerUnits: number;
  temperatureCelsius: number | null;
  status: string;
  metrics: {
    totalBatches: number;
    totalSellableUnits: number;
    quarantinedBatches: number;
    expiringSoonBatches: number;
    recentLogsCount: number;
    latestAlert: {
      id: string;
      temperatureCelsius: string | number;
      recordedAt: string;
    } | null;
  };
}

export interface TemperatureLog {
  id: string;
  temperatureCelsius: number;
  freezerUnit: number | null;
  isAlert: boolean;
  recordedAt: string;
}

export interface TempStats {
  totalReadings: number;
  breachCount: number;
  complianceRate: number;
  minTemp: number | null;
  maxTemp: number | null;
  avgTemp: number | null;
}

export interface FrozenProduct {
  id: string;
  name: string;
  price: number;
  primaryImage?: string | null;
  category?: { name: string } | null;
  seller?: { id: string; businessName: string } | null;
}

export type ConsoleTab = 'overview' | 'intake' | 'fefo' | 'temperature';
export type FefoFilter = 'all' | 'available' | 'quarantined' | 'expiringSoon';

/** Frozen food must be held at or below this; a batch received warmer is quarantined. */
export const COLD_CHAIN_MAX_C = -18;

export const isColdEnough = (celsius: number) => celsius <= COLD_CHAIN_MAX_C;

/** "-19.5°C", or "—" when there is no reading (never a made-up one). */
export function formatTemp(celsius: number | string | null | undefined): string {
  if (celsius === null || celsius === undefined || celsius === '') return '—';
  const n = Number(celsius);
  return Number.isFinite(n) ? `${n.toFixed(1)}°C` : '—';
}

/** The FEFO queue as the status chip and the search box narrow it (batch #, product, barcode or kitchen). */
export function filterBatches(batches: HubBatch[], filter: FefoFilter, search: string): HubBatch[] {
  const query = search.trim().toLowerCase();
  return batches.filter((b) => {
    if (filter === 'available' && b.status !== 'available') return false;
    if (filter === 'quarantined' && b.status !== 'damaged') return false;
    if (filter === 'expiringSoon' && (!b.isExpiringSoon || b.isExpired)) return false;
    if (!query) return true;
    return (
      b.batchNumber.toLowerCase().includes(query) ||
      b.product.name.toLowerCase().includes(query) ||
      (b.barcode ? b.barcode.toLowerCase().includes(query) : false) ||
      !!b.product.seller?.businessName.toLowerCase().includes(query)
    );
  });
}

/** A fresh batch number and barcode, e.g. BATCH-2610-FROST-4821 and NR-FROST-4821. */
export function newBatchCode(now: Date = new Date(), random: number = Math.random()): { batchNumber: string; barcode: string } {
  const suffix = Math.floor(1000 + random * 9000);
  const dateCode = now.toISOString().slice(2, 7).replace('-', '');
  return { batchNumber: `BATCH-${dateCode}-FROST-${suffix}`, barcode: `NR-FROST-${suffix}` };
}

/** The date `days` from now as YYYY-MM-DD (the date pickers' format). */
export function dateInDays(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
