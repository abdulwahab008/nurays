import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPublicRead } from '../../lib/server/public-read.ts';

// A dish page reads the dish on the server for its title and link preview. "Not found" must mean the dish is not there, never
// "the API's address is a little wrong".
test('a dish that exists is read', () => {
  assert.deepEqual(classifyPublicRead(200, { success: true, data: { id: 'd1' } }), { kind: 'ok', data: { id: 'd1' } });
});

test('a 404 with the API\'s own reason (the dish or the kitchen is not there) is missing', () => {
  assert.deepEqual(classifyPublicRead(404, { success: false, error: { code: 'PRODUCT_NOT_FOUND', message: 'Product not found' } }), { kind: 'missing' });
  assert.deepEqual(classifyPublicRead(404, { success: false, error: { code: 'SELLER_NOT_FOUND' } }), { kind: 'missing' });
});

test('a 404 for an address the API has no route for says nothing about the dish', () => {
  assert.deepEqual(classifyPublicRead(404, { success: false, error: { code: 'NOT_FOUND', message: 'Route GET /products/x not found' } }), { kind: 'unavailable' });
});

test('a 404 from anything else (a proxy, a web server, the wrong host) says nothing about the dish either', () => {
  assert.deepEqual(classifyPublicRead(404, null), { kind: 'unavailable' });
  assert.deepEqual(classifyPublicRead(404, '<html>Not Found</html>'), { kind: 'unavailable' });
  assert.deepEqual(classifyPublicRead(404, { error: 'nope' }), { kind: 'unavailable' });
  assert.deepEqual(classifyPublicRead(404, { success: true, data: {} }), { kind: 'unavailable' });
});

test('a failure or an answer without data is unavailable, not missing', () => {
  for (const status of [400, 401, 403, 429, 500, 502, 503]) assert.deepEqual(classifyPublicRead(status, { success: false, error: { code: 'PRODUCT_NOT_FOUND' } }), { kind: 'unavailable' }, String(status));
  assert.deepEqual(classifyPublicRead(200, { success: true }), { kind: 'unavailable' });
  assert.deepEqual(classifyPublicRead(200, { success: false, data: { id: 'x' } }), { kind: 'unavailable' });
  assert.deepEqual(classifyPublicRead(200, null), { kind: 'unavailable' });
});
