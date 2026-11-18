import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitingPayment, orderProgress, paymentNote } from '../../components/orders/order-progress.ts';
import { clock, pktDateString, storedWindowHours, windowStartsAt } from '../../app/checkout/delivery-slots.ts';

test('a ready delivery order sits on its third step, which reads "Ready"', () => {
  const p = orderProgress('ready', 'home_delivery');
  assert.equal(p?.reached, 2);
  assert.equal(p?.steps[2], 'ready');
});

test('a ready pickup order is on "Ready to collect"', () => {
  const p = orderProgress('ready', 'self_pickup');
  assert.equal(p?.steps[p.reached], 'readyToCollect');
});

test('cooking, on the way and delivered map to the same five steps', () => {
  assert.equal(orderProgress('preparing', 'home_delivery')?.steps[2], 'cooking');
  assert.equal(orderProgress('in_transit', 'home_delivery')?.reached, 3);
  assert.equal(orderProgress('delivered', 'home_delivery')?.reached, 4);
});

test('an order that ended early has no tracker', () => {
  assert.equal(orderProgress('cancelled', 'home_delivery'), null);
  assert.equal(orderProgress('delivery_failed', 'home_delivery'), null);
});

test('an unpaid online order waits for payment before the kitchen sees it', () => {
  assert.equal(awaitingPayment('pending', 'safepay', 'pending'), true);
  assert.equal(awaitingPayment('pending', 'cod', 'pending'), false);
  assert.equal(awaitingPayment('confirmed', 'safepay', 'paid'), false);
});

test('a transfer to the kitchen waits for payment only once the kitchen has accepted, until the customer reports it', () => {
  assert.equal(awaitingPayment('pending', 'jazzcash', 'pending'), false);
  assert.equal(awaitingPayment('preparing', 'jazzcash', 'pending'), true);
  assert.equal(awaitingPayment('confirmed', 'bank', 'disputed'), true);
  assert.equal(awaitingPayment('preparing', 'easypaisa', 'payment_submitted'), false);
  assert.equal(awaitingPayment('preparing', 'bank', 'paid'), false);
  assert.equal(awaitingPayment('ready', 'bank', 'pending'), false);
});

test('a cancelled order that was never paid is "not charged", never "payment pending"', () => {
  assert.equal(paymentNote('cancelled', 'cod', 'pending'), 'notCharged');
  assert.equal(paymentNote('cancelled', 'safepay', 'pending'), 'notCharged');
  assert.equal(paymentNote('cancelled', 'wallet', 'refunded'), 'refunded');
  assert.equal(paymentNote('pending', 'safepay', 'pending'), 'awaitingPayment');
  assert.equal(paymentNote('pending', 'cod', 'pending'), 'onDelivery');
});

// 12:40 in Pakistan is 07:40 UTC; 02:00 on the 7th in Pakistan is still the 6th in UTC.
const LUNCHTIME = new Date('2026-11-06T07:40:00Z');
const AFTER_MIDNIGHT = new Date('2026-11-06T21:00:00Z');

test('checkout works out "today" in Pakistan time', () => {
  assert.equal(pktDateString(LUNCHTIME), '2026-11-06');
  assert.equal(pktDateString(AFTER_MIDNIGHT), '2026-11-07');
});

test('a window shows as clock times; an old named window has its own words', () => {
  assert.equal(clock(9 * 60), '9 am');
  assert.equal(clock(12 * 60), '12 pm');
  assert.equal(clock(21 * 60 + 30), '9:30 pm');
  assert.equal(clock(24 * 60), '12 am');
  assert.equal(storedWindowHours('12:00-15:00'), '\u206612 pm – 3 pm\u2069');
  assert.equal(storedWindowHours('morning'), null);
});

test('a booked window opens at its start, Pakistan time; an old named window by its hours', () => {
  // 19:00 on 7 Nov in Pakistan is 14:00 UTC; morning (9:00) today, 6 Nov, is 04:00 UTC.
  assert.equal(new Date(windowStartsAt('2026-11-07', '19:00-22:00', LUNCHTIME)!).toISOString(), '2026-11-07T14:00:00.000Z');
  assert.equal(new Date(windowStartsAt(undefined, 'morning', LUNCHTIME)!).toISOString(), '2026-11-06T04:00:00.000Z');
  assert.equal(windowStartsAt('2026-11-07', undefined, LUNCHTIME), null);
});
