import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitingPayment, orderProgress, paymentNote } from '../../components/orders/order-progress.ts';
import { openSlotsToday, pktDateString, slotDays } from '../../app/checkout/delivery-slots.ts';

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

test('only an unpaid online or transfer order waits for payment', () => {
  assert.equal(awaitingPayment('pending', 'safepay', 'pending'), true);
  assert.equal(awaitingPayment('pending', 'jazzcash', 'payment_submitted'), true);
  assert.equal(awaitingPayment('pending', 'cod', 'pending'), false);
  assert.equal(awaitingPayment('confirmed', 'safepay', 'paid'), false);
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
const LATE_NIGHT = new Date('2026-11-06T17:00:00Z');

test('checkout works out "today" in Pakistan time', () => {
  assert.equal(pktDateString(LUNCHTIME), '2026-11-06');
  assert.equal(pktDateString(AFTER_MIDNIGHT), '2026-11-07');
});

test('windows that have closed today are not offered', () => {
  assert.deepEqual(openSlotsToday(LUNCHTIME), ['afternoon', 'evening']);
  assert.deepEqual(openSlotsToday(AFTER_MIDNIGHT), ['morning', 'afternoon', 'evening']);
});

test('after the last window, the days start tomorrow; the kitchen limits bound them', () => {
  const late = slotDays(LATE_NIGHT, 0, 6);
  assert.equal(late[0].offset, 1);
  assert.equal(late.at(-1)?.offset, 6);
  const preorder = slotDays(LUNCHTIME, 1, 3);
  assert.deepEqual(preorder.map((d) => d.date), ['2026-11-07', '2026-11-08', '2026-11-09']);
});
