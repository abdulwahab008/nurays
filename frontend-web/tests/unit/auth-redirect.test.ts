import test from 'node:test';
import assert from 'node:assert/strict';
import { loginUrlFor, safeNextPath } from '../../lib/auth-redirect.ts';

// After signing in a person goes back to the page they asked for, but only ever to a page of this site.
test('a path on this site is followed, with its query string', () => {
  for (const ok of ['/orders', '/orders/abc-123', '/checkout?step=2', '/kitchens/9f1c?tab=reviews#top', '/sellers/orders?status=pending']) {
    assert.equal(safeNextPath(ok), ok);
  }
});

test('anything that leaves the site, or could be read as doing so, is ignored', () => {
  for (const bad of [
    'https://evil.example/orders', 'http://evil.example', '//evil.example', '///evil.example', '/\\evil.example', '\\\\evil.example',
    'javascript:alert(1)', 'data:text/html,x', 'orders', '', ' /orders', '/%2F%2Fevil.example', '/%5Cevil.example', '/a\nb', '/a\u0000b', '/%E0%A4%A',
  ]) {
    assert.equal(safeNextPath(bad), null, JSON.stringify(bad));
  }
  assert.equal(safeNextPath(null), null);
  assert.equal(safeNextPath(undefined), null);
  assert.equal(safeNextPath('/' + 'a'.repeat(500)), null);
});

test('the sign-in and sign-up pages are never returned to (that would loop)', () => {
  for (const bad of ['/login', '/login?next=/orders', '/register', '/forgot-password', '/reset-password?token=x', '/verify-email', '/verify-email-pending', '/admin/login']) {
    assert.equal(safeNextPath(bad), null, bad);
  }
  assert.equal(safeNextPath('/loginhelp'), '/loginhelp');
  assert.equal(safeNextPath('/admin/orders'), '/admin/orders');
});

test('the sign-in address carries the page, encoded, and falls back to the plain page when it is not safe', () => {
  assert.equal(loginUrlFor('/orders/abc?x=1&y=2'), '/login?next=%2Forders%2Fabc%3Fx%3D1%26y%3D2');
  assert.equal(loginUrlFor('/orders', '/admin/login'), '/admin/login?next=%2Forders');
  assert.equal(loginUrlFor('//evil.example'), '/login');
  assert.equal(loginUrlFor('/login'), '/login');
  const url = new URL(loginUrlFor('/checkout?a=b&c=d'), 'https://x.test');
  assert.equal(safeNextPath(url.searchParams.get('next')), '/checkout?a=b&c=d');
});
