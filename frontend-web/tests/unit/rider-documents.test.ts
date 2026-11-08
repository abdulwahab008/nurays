import test from 'node:test';
import assert from 'node:assert/strict';
import { riderDocumentRows } from '../../lib/rider-documents.ts';

test('every required document has a row, sent or not', () => {
  assert.deepEqual(riderDocumentRows([]), [
    { type: 'cnic_front', uploadedAt: null },
    { type: 'cnic_back', uploadedAt: null },
    { type: 'license', uploadedAt: null },
  ]);
});

test('the rows keep the application order whatever order the server sends', () => {
  const rows = riderDocumentRows([
    { type: 'license', uploadedAt: '2026-11-02T10:00:00.000Z' },
    { type: 'cnic_front', uploadedAt: '2026-11-01T10:00:00.000Z' },
  ]);
  assert.deepEqual(rows, [
    { type: 'cnic_front', uploadedAt: '2026-11-01T10:00:00.000Z' },
    { type: 'cnic_back', uploadedAt: null },
    { type: 'license', uploadedAt: '2026-11-02T10:00:00.000Z' },
  ]);
});

test('a document sent twice shows its newest copy, and other documents on file come last', () => {
  const rows = riderDocumentRows([
    { type: 'cnic_back', uploadedAt: '2026-10-01T10:00:00.000Z' },
    { type: 'vehicle_registration', uploadedAt: '2026-10-05T10:00:00.000Z' },
    { type: 'cnic_back', uploadedAt: '2026-11-03T10:00:00.000Z' },
  ]);
  assert.equal(rows.find((r) => r.type === 'cnic_back')?.uploadedAt, '2026-11-03T10:00:00.000Z');
  assert.deepEqual(rows.map((r) => r.type), ['cnic_front', 'cnic_back', 'license', 'vehicle_registration']);
});
