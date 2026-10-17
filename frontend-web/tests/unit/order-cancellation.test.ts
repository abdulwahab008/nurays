import test from 'node:test';
import assert from 'node:assert/strict';
import { cancellationNotice, customerCancellationReason } from '../../lib/order-cancellation.ts';

// A cancelled order says who cancelled it and, when the reason was written for the customer, why.
test('a kitchen\'s rejection gives its reason without the internal prefix', () => {
  assert.deepEqual(cancellationNotice('seller', 'Rejected by kitchen: Too busy / High kitchen load'), { who: 'kitchen', reason: 'Too busy / High kitchen load' });
});

test('an automatic cancellation gives what the system wrote', () => {
  assert.deepEqual(cancellationNotice('system', 'The kitchen did not accept the order within 30 minutes'), { who: 'system', reason: 'The kitchen did not accept the order within 30 minutes' });
});

test('a support person\'s note and the customer\'s own words are not repeated', () => {
  assert.deepEqual(cancellationNotice('admin', 'Suspected fraud, see ticket 4411'), { who: 'support', reason: null });
  assert.deepEqual(cancellationNotice('customer', 'Ordered by mistake'), { who: 'you', reason: null });
  assert.equal(customerCancellationReason('admin', 'Suspected fraud'), null);
});

test('an order whose record does not say who cancelled it has no notice', () => {
  assert.equal(cancellationNotice(null, 'x'), null);
  assert.equal(cancellationNotice(undefined, undefined), null);
  assert.equal(cancellationNotice('mystery', 'x'), null);
});

test('a kitchen that gave no usable reason still says it was the kitchen', () => {
  assert.deepEqual(cancellationNotice('seller', 'Rejected by kitchen:   '), { who: 'kitchen', reason: null });
  assert.deepEqual(cancellationNotice('seller', null), { who: 'kitchen', reason: null });
});
