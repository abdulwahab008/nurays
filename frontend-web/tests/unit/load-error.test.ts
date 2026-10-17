import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLoadFailure, isHtmlPage, serverMessageOf } from '../../lib/load-error.ts';

const requestError = (status?: number, message?: unknown) => ({
  isAxiosError: true,
  response: status === undefined ? undefined : { status, data: message === undefined ? undefined : { error: { message } } },
});

// A page that cannot load must say why in words a person can act on, instead of showing an empty list.
test('no answer at all (no network, connection refused, timeout) is "offline"', () => {
  assert.equal(classifyLoadFailure(requestError()), 'offline');
  assert.equal(classifyLoadFailure({ isAxiosError: true, code: 'ECONNABORTED' }), 'offline');
});

test('429 is "busy", so the page says to wait instead of to check the connection', () => {
  assert.equal(classifyLoadFailure(requestError(429)), 'busy');
});

test('5xx is "server", and so is a gateway page that is not the API', () => {
  assert.equal(classifyLoadFailure(requestError(500)), 'server');
  assert.equal(classifyLoadFailure(requestError(502)), 'server');
  assert.equal(classifyLoadFailure(requestError(503)), 'server');
});

test('another 4xx is "refused", and the server\'s own sentence is the thing to show', () => {
  assert.equal(classifyLoadFailure(requestError(404, 'Order not found')), 'refused');
  assert.equal(classifyLoadFailure(requestError(403)), 'refused');
  assert.equal(serverMessageOf(requestError(404, 'Order not found')), 'Order not found');
});

test('a message that is missing, blank or not text is not a message', () => {
  assert.equal(serverMessageOf(requestError(404)), null);
  assert.equal(serverMessageOf(requestError(404, '   ')), null);
  assert.equal(serverMessageOf(requestError(404, { nested: true })), null);
  assert.equal(serverMessageOf(new Error('x')), null);
  assert.equal(serverMessageOf(null), null);
});

test('anything that is not a request error is "unknown" (a bug in the page, not the network)', () => {
  assert.equal(classifyLoadFailure(new TypeError("Cannot read properties of undefined (reading 'items')")), 'unknown');
  assert.equal(classifyLoadFailure(null), 'unknown');
  assert.equal(classifyLoadFailure('boom'), 'unknown');
});

test('an answer axios itself calls bad (a 5xx, or the page that is not JSON) is "server", whatever its status says', () => {
  assert.equal(classifyLoadFailure({ isAxiosError: true, code: 'ERR_BAD_RESPONSE', response: { status: 200 } }), 'server');
});

test('a web page where JSON was expected is recognised, so it is not read as "no data"', () => {
  assert.equal(isHtmlPage('<!DOCTYPE html><html><body>Sign in to the Wi-Fi</body></html>'), true);
  assert.equal(isHtmlPage('\n  <html lang="en"><head></head></html>'), true);
  assert.equal(isHtmlPage('<body>Bad gateway</body>'), true);
});

test('JSON, text and everything else are not web pages', () => {
  assert.equal(isHtmlPage({ success: true, data: [] }), false);
  assert.equal(isHtmlPage(''), false);
  assert.equal(isHtmlPage('id,name\n1,Ayesha'), false);
  assert.equal(isHtmlPage('{"success":true}'), false);
  assert.equal(isHtmlPage(null), false);
  assert.equal(isHtmlPage('a < b and <b> is bold'), false);
});
