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

test('refused actions read as attempts, and an id with no area says so', () => {
  assert.equal(describeAction('admin:POST /orders/:id/refund', { refused: true }), 'Tried to refund an order');
  assert.equal(describeAction('admin:POST /promotions', { refused: true }), 'Tried to create a promo code');
  assert.equal(describeAction('admin:PATCH /riders/:id/cash-limit', { refused: true }), 'Tried to change the cash limit of a rider');
  assert.equal(describeAction('admin:POST /api/v1/admin/eee04872-026f-47ef-80d0-3567c3fbda4a/cancel'), 'Tried to cancel an unknown record');
  assert.equal(describeAction('admin:POST /api/v1/admin/orders/eee04872-026f-47ef-80d0-3567c3fbda4a/cancel', { refused: true }), 'Tried to cancel an order');
  assert.equal(describeAction('admin:PATCH /sellers/:id/delivery'), 'Updated a kitchen (delivery)');
});

test('records link to their admin page when there is one', () => {
  assert.equal(recordHref('orders', 'abc'), '/admin/orders/abc');
  assert.equal(recordHref('promotions', 'abc'), null);
  assert.equal(recordHref('orders', null), null);
});
