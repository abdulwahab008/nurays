import test from 'node:test';
import assert from 'node:assert/strict';
import { dateInDays, filterBatches, formatTemp, isColdEnough, newBatchCode, type HubBatch } from '../../lib/hub-console.ts';

test('frozen food is fine at -18°C and colder, a breach above it', () => {
  assert.equal(isColdEnough(-18), true);
  assert.equal(isColdEnough(-25.5), true);
  assert.equal(isColdEnough(-17.9), false);
});

test('a temperature is written to one decimal, and a missing one as a dash, never a made-up reading', () => {
  assert.equal(formatTemp(-19.25), '-19.3°C');
  assert.equal(formatTemp('-18'), '-18.0°C');
  assert.equal(formatTemp(null), '—');
  assert.equal(formatTemp(undefined), '—');
  assert.equal(formatTemp('n/a'), '—');
});

const batch = (over: Partial<HubBatch> & { productName?: string; kitchen?: string }): HubBatch => ({
  id: over.id ?? 'x',
  fefoPriority: 1,
  batchNumber: over.batchNumber ?? 'BATCH-1',
  barcode: over.barcode ?? null,
  quantity: 10,
  status: over.status ?? 'available',
  storageUnit: 'F1',
  manufacturedDate: null,
  expiryDate: '2026-12-01',
  daysUntilExpiry: 40,
  isExpired: over.isExpired ?? false,
  isExpiringSoon: over.isExpiringSoon ?? false,
  product: { id: 'p', name: over.productName ?? 'Samosa', price: 300, image: null, seller: { id: 's', businessName: over.kitchen ?? 'Ammi Kitchen', isVerified: true } },
  createdAt: '2026-10-01',
});

const queue = [
  batch({ id: 'a', batchNumber: 'BATCH-A', barcode: 'NR-1' }),
  batch({ id: 'q', status: 'damaged', productName: 'Kebab' }),
  batch({ id: 'e', isExpiringSoon: true, kitchen: 'Lahori Frozen' }),
  batch({ id: 'x', isExpiringSoon: true, isExpired: true }),
];
const ids = (list: HubBatch[]) => list.map((b) => b.id);

test('the FEFO chips narrow the queue; an expired batch is not "expiring soon"', () => {
  assert.deepEqual(ids(filterBatches(queue, 'all', '')), ['a', 'q', 'e', 'x']);
  assert.deepEqual(ids(filterBatches(queue, 'available', '')), ['a', 'e', 'x']);
  assert.deepEqual(ids(filterBatches(queue, 'quarantined', '')), ['q']);
  assert.deepEqual(ids(filterBatches(queue, 'expiringSoon', '')), ['e']);
});

test('the search matches batch number, product, barcode or kitchen', () => {
  assert.deepEqual(ids(filterBatches(queue, 'all', 'batch-a')), ['a']);
  assert.deepEqual(ids(filterBatches(queue, 'all', 'kebab')), ['q']);
  assert.deepEqual(ids(filterBatches(queue, 'all', 'nr-1')), ['a']);
  assert.deepEqual(ids(filterBatches(queue, 'all', ' lahori ')), ['e']);
});

test('a new batch code and its barcode share the same number', () => {
  const code = newBatchCode(new Date('2026-10-20T00:00:00Z'), 0.5);
  assert.equal(code.batchNumber, 'BATCH-2610-FROST-5500');
  assert.equal(code.barcode, 'NR-FROST-5500');
});

test('an expiry preset is that many days ahead', () => {
  assert.equal(dateInDays(90, new Date('2026-10-20T12:00:00Z')), '2027-01-18');
  assert.equal(dateInDays(0, new Date('2026-10-20T12:00:00Z')), '2026-10-20');
});
