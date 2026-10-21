import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectSources, cspHeaderName, cspValue } from '../../lib/csp.ts';

test('report-only unless the switch says exactly "true"', () => {
  assert.equal(cspHeaderName(undefined), 'Content-Security-Policy-Report-Only');
  assert.equal(cspHeaderName('1'), 'Content-Security-Policy-Report-Only');
  assert.equal(cspHeaderName('false'), 'Content-Security-Policy-Report-Only');
  assert.equal(cspHeaderName('true'), 'Content-Security-Policy');
});

test('the API and its realtime origin may be reached, a relative API path adds nothing', () => {
  const src = connectSources({ apiUrl: 'https://api.nuray.pk/api/v1', wsUrl: 'wss://rt.nuray.pk' });
  for (const origin of ["'self'", 'https://api.nuray.pk', 'wss://api.nuray.pk', 'wss://rt.nuray.pk']) assert.ok(src.includes(origin), origin);
  assert.equal(connectSources({ apiUrl: '/api/v1' }), connectSources({}));
});

test('reports go to the collector, and the site cannot be framed', () => {
  const v = cspValue({});
  assert.ok(v.includes('report-uri /api/csp-report'));
  assert.ok(v.includes("frame-ancestors 'none'"));
});
