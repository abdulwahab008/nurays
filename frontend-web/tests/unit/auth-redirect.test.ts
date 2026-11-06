import test from 'node:test';
import assert from 'node:assert/strict';
import { accountTypeFor, clearSignOut, landingAfterLogin, loginUrlFor, loginUrlHere, noteSignOut, safeNextPath } from '../../lib/auth-redirect.ts';

const at = (href: string) => {
  (globalThis as unknown as { window: { location: URL } }).window = { location: new URL(href, 'https://x.test') };
};

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

test('each area of the site is for one kind of account; the rest is for anyone', () => {
  assert.equal(accountTypeFor('/admin/orders'), 'admin');
  assert.equal(accountTypeFor('/admin/login'), null);
  assert.equal(accountTypeFor('/sellers/orders?status=new'), 'seller');
  assert.equal(accountTypeFor('/sellers/register'), null);
  assert.equal(accountTypeFor('/riders/dashboard'), 'rider');
  assert.equal(accountTypeFor('/hub'), 'hub_manager');
  for (const p of ['/orders', '/orders/abc', '/cart', '/wallet', '/checkout?x=1']) assert.equal(accountTypeFor(p), 'customer', p);
  for (const p of ['/', '/products', '/profile', '/support', '/hubspot', '/ordersx']) assert.equal(accountTypeFor(p), null, p);
});

test('after sign-in, a ?next= page for another kind of account is not followed', () => {
  at('/login?next=%2Friders%2Fdashboard');
  assert.equal(landingAfterLogin('/dashboard'), '/dashboard');
  assert.equal(landingAfterLogin('/riders/dashboard'), '/riders/dashboard');
  at('/login?next=%2Forders%2Fabc');
  assert.equal(landingAfterLogin('/dashboard'), '/orders/abc');
  assert.equal(landingAfterLogin('/admin/dashboard'), '/admin/dashboard');
  at('/login?next=%2Fsupport');
  assert.equal(landingAfterLogin('/sellers/dashboard'), '/support');
});

test('signing out on a page does not carry that page into the sign-in address', () => {
  at('/riders/dashboard?tab=jobs');
  assert.equal(loginUrlHere(), '/login?next=%2Friders%2Fdashboard%3Ftab%3Djobs');
  noteSignOut();
  assert.equal(loginUrlHere(), '/login');
  at('/riders/dashboard');
  clearSignOut();
  assert.equal(loginUrlHere(), '/login?next=%2Friders%2Fdashboard');
});

test('after signing out, a page reached with Back does not carry the previous person\'s page either', () => {
  at('/riders/dashboard');
  noteSignOut();
  at('/riders/earnings?week=2');
  assert.equal(loginUrlHere(), '/login');
  at('/orders');
  assert.equal(loginUrlHere(), '/login');
  clearSignOut();
  assert.equal(loginUrlHere(), '/login?next=%2Forders');
});

test('a sign-out is remembered by the tab, so a page that Back loads afresh does not carry the previous page either', () => {
  const stored = new Map<string, string>();
  const sessionStorage = {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  };
  const atWithStorage = (href: string) => {
    (globalThis as unknown as { window: { location: URL; sessionStorage: typeof sessionStorage } }).window = {
      location: new URL(href, 'https://x.test'),
      sessionStorage,
    };
  };
  atWithStorage('/riders/dashboard');
  noteSignOut();
  assert.equal(stored.size, 1);
  clearSignOut();
  assert.equal(stored.size, 0);
  stored.set('nuray-signed-out', '1');
  atWithStorage('/riders/earnings');
  assert.equal(loginUrlHere(), '/login');
  clearSignOut();
  assert.equal(loginUrlHere(), '/login?next=%2Friders%2Fearnings');
});
