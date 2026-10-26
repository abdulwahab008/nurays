import test from 'node:test';
import assert from 'node:assert/strict';
import { activeCustomerTab, showsCustomerTabBar } from '../../lib/tab-bar.ts';

test('the tab bar is on the pages where people order food', () => {
  for (const path of ['/', '/kitchens', '/kitchens/abc', '/products', '/products/1', '/cart', '/orders', '/orders/42', '/profile', '/wallet', '/favorites']) {
    assert.ok(showsCustomerTabBar(path, null), path);
    assert.ok(showsCustomerTabBar(path, 'customer'), path);
  }
});

test('sign-in, checkout and payment keep the whole screen, and staff screens have their own menus', () => {
  for (const path of ['/login', '/register', '/checkout', '/payment/return', '/verify-email', '/admin', '/admin/orders', '/sellers/dashboard', '/riders/dashboard', '/hub', '/delete-account']) {
    assert.ok(!showsCustomerTabBar(path, null), path);
  }
  // A path that only starts with the same letters is not hidden
  assert.ok(showsCustomerTabBar('/hubs-near-me', null));
  for (const userType of ['seller', 'rider', 'admin', 'hub_manager']) assert.ok(!showsCustomerTabBar('/', userType), userType);
});

test('the tab for the page you are on is marked', () => {
  assert.equal(activeCustomerTab('/'), 'home');
  assert.equal(activeCustomerTab('/kitchens/abc'), 'home');
  assert.equal(activeCustomerTab('/orders/42'), 'orders');
  assert.equal(activeCustomerTab('/cart'), 'tray');
  assert.equal(activeCustomerTab('/profile/addresses'), 'profile');
  assert.equal(activeCustomerTab('/wallet'), 'profile');
  assert.equal(activeCustomerTab('/terms'), null);
});
