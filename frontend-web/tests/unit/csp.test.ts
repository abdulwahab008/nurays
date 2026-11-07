import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectSources, cspHeaderName, cspValue } from '../../lib/csp.ts';

test('enforced unless the switch says exactly "false"', () => {
  assert.equal(cspHeaderName(undefined), 'Content-Security-Policy');
  assert.equal(cspHeaderName('true'), 'Content-Security-Policy');
  assert.equal(cspHeaderName('1'), 'Content-Security-Policy');
  assert.equal(cspHeaderName('false'), 'Content-Security-Policy-Report-Only');
});

test('scripts need the page\'s nonce: no inline script or event handler runs without it', () => {
  const script = cspValue({}, 'abc123').split('; ').find((d) => d.startsWith('script-src')) ?? '';
  assert.ok(script.includes("'nonce-abc123'"));
  assert.ok(script.includes("'strict-dynamic'"));
  assert.ok(!script.includes("'unsafe-inline'"));
  assert.ok(!script.includes("'unsafe-eval'"), 'eval only in development');
  assert.ok(cspValue({}, 'n', true).includes("'unsafe-eval'"));
  assert.ok(cspValue({}, 'n').includes("object-src 'none'"));
  assert.ok(cspValue({}, 'n').includes("worker-src 'self'"), 'the push service worker is allowed on its own');
  assert.ok(cspValue({}, 'n').includes("media-src 'self' data: blob: https:"), 'voice notes from signed storage links play');
});

test('the API and its realtime origin may be reached, a relative API path adds nothing', () => {
  const src = connectSources({ apiUrl: 'https://api.nuray.pk/api/v1', wsUrl: 'wss://rt.nuray.pk' });
  for (const origin of ["'self'", 'https://api.nuray.pk', 'wss://api.nuray.pk', 'wss://rt.nuray.pk']) assert.ok(src.includes(origin), origin);
  assert.equal(connectSources({ apiUrl: '/api/v1' }), connectSources({}));
});

test('reports go to the collector, and the site cannot be framed', () => {
  const v = cspValue({}, 'n');
  assert.ok(v.includes('report-uri /api/csp-report'));
  assert.ok(v.includes("frame-ancestors 'none'"));
});
