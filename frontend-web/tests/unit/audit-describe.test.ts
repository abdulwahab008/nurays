import test from 'node:test';
import assert from 'node:assert/strict';
import { describeAction, recordHref } from '../../app/admin/audit-log/describe.ts';

test('audit actions read as plain sentences', () => {
  assert.equal(describeAction('auth:LOGIN'), 'Signed in');
  assert.equal(describeAction('admin:POST /sellers/:id/reject'), 'Rejected a kitchen');
  assert.equal(describeAction('admin:POST /orders/:id/refund'), 'Refunded an order');
  assert.equal(describeAction('admin:POST /promotions'), 'Created a promo code');
  assert.equal(describeAction('admin:DELETE /promotions/:id'), 'Deleted a promo code');
  assert.equal(describeAction('admin:POST /support/tickets/:id/reply'), 'Replied to a support ticket');
  assert.equal(describeAction('admin:DENIED PATCH /api/v1/admin/settings'), 'Refused: change the settings');
  assert.equal(describeAction('admin:DENIED GET /api/v1/admin/pending-sellers'), 'Refused: open pending sellers');
  assert.equal(describeAction('something odd'), 'something odd');
});

test('records link to their admin page when there is one', () => {
  assert.equal(recordHref('orders', 'abc'), '/admin/orders/abc');
  assert.equal(recordHref('promotions', 'abc'), null);
  assert.equal(recordHref('orders', null), null);
});
