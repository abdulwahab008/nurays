import test from 'node:test';
import assert from 'node:assert/strict';
import { activeCustomerTab, activeRiderTab, activeSellerTab, showsCustomerTabBar, tabBarFor } from '../../lib/tab-bar.ts';

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
  assert.equal(activeCustomerTab('/dashboard'), 'home');
  assert.equal(activeCustomerTab('/orders/42'), 'orders');
  assert.equal(activeCustomerTab('/cart'), 'tray');
  assert.equal(activeCustomerTab('/profile/addresses'), 'profile');
  assert.equal(activeCustomerTab('/wallet'), 'profile');
  assert.equal(activeCustomerTab('/terms'), null);
});

test('customers and visitors keep the customer bar where it was', () => {
  assert.equal(tabBarFor('/', null), 'customer');
  assert.equal(tabBarFor('/orders/42', 'customer'), 'customer');
  assert.equal(tabBarFor('/checkout', 'customer'), null);
  assert.equal(tabBarFor('/sellers/dashboard', null), null);
  assert.equal(tabBarFor('/riders/dashboard', null), null);
  for (const userType of ['admin', 'hub_manager']) {
    for (const path of ['/', '/profile', '/sellers/dashboard', '/riders/dashboard', '/admin', '/hub']) assert.equal(tabBarFor(path, userType), null, `${userType} ${path}`);
  }
});

test('a signed-in kitchen gets its bar on its own pages only', () => {
  for (const path of ['/sellers/dashboard', '/sellers/orders', '/sellers/orders/42', '/sellers/products', '/sellers/products/new', '/sellers/promotions', '/sellers/earnings', '/sellers/settings', '/sellers/delivery', '/sellers/analytics', '/sellers/notifications', '/notifications/settings']) {
    assert.equal(tabBarFor(path, 'seller'), 'seller', path);
  }
  for (const path of ['/sellers/register', '/', '/profile', '/notifications', '/riders/dashboard', '/checkout', '/payment/return', '/login', '/sellersx']) {
    assert.equal(tabBarFor(path, 'seller'), null, path);
  }
});

test('a signed-in rider gets its bar on the rider pages and its settings', () => {
  for (const path of ['/riders/dashboard', '/riders/earnings', '/riders/settings', '/profile', '/notifications/settings']) assert.equal(tabBarFor(path, 'rider'), 'rider', path);
  for (const path of ['/', '/profile/addresses', '/notifications', '/sellers/dashboard', '/checkout', '/login', '/support']) {
    assert.equal(tabBarFor(path, 'rider'), null, path);
  }
});

test('the kitchen tab for the page you are on is marked', () => {
  assert.equal(activeSellerTab('/sellers/dashboard'), 'home');
  assert.equal(activeSellerTab('/sellers/orders'), 'orders');
  assert.equal(activeSellerTab('/sellers/orders/42'), 'orders');
  assert.equal(activeSellerTab('/sellers/products'), 'menu');
  assert.equal(activeSellerTab('/sellers/products/7/edit'), 'menu');
  assert.equal(activeSellerTab('/sellers/promotions'), 'menu');
  assert.equal(activeSellerTab('/sellers/earnings'), 'earnings');
  assert.equal(activeSellerTab('/sellers/settings'), 'settings');
  assert.equal(activeSellerTab('/sellers/delivery'), null);
  assert.equal(activeSellerTab('/sellers/analytics'), null);
});

test('the rider tab for the page you are on is marked', () => {
  assert.equal(activeRiderTab('/riders/dashboard'), 'deliveries');
  assert.equal(activeRiderTab('/riders/earnings'), 'earnings');
  assert.equal(activeRiderTab('/riders/settings'), 'settings');
  assert.equal(activeRiderTab('/profile'), 'settings');
  assert.equal(activeRiderTab('/notifications/settings'), 'settings');
  assert.equal(activeRiderTab('/support'), null);
  assert.equal(activeRiderTab('/riders/settingsx'), null);
});

test('only a signed-in rider gets the rider bar on the rider settings page', () => {
  assert.equal(tabBarFor('/riders/settings', 'seller'), null);
  assert.equal(tabBarFor('/riders/settings', null), null);
  assert.equal(tabBarFor('/riders/settings', 'customer'), null);
});
