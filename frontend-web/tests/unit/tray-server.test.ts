import test from 'node:test';
import assert from 'node:assert/strict';
import { serverLineFor, writeTrayLine } from '../../lib/tray-server.ts';

type ServerLines = Parameters<typeof serverLineFor>[0];

const serverLine = (id: string, productId: string, variantId?: string) =>
  ({
    id,
    product: { id: productId, name: productId, price: 100 },
    variant: variantId ? { id: variantId, name: variantId, price: 100 } : null,
    seller: { id: 'k1', businessName: 'Kitchen' },
    quantity: 1,
    stockType: 'direct',
    subtotal: 100,
  }) as ServerLines[number];

const fakeApi = (items: ServerLines) => {
  const calls: string[] = [];
  return {
    calls,
    api: {
      getCart: async () => ({ data: { items } }),
      updateCartItem: async (id: string, quantity: number) => {
        calls.push(`update ${id} ${quantity}`);
      },
      removeCartItem: async (id: string) => {
        calls.push(`remove ${id}`);
      },
    },
  };
};

// The home tray drawer changed only the browser's copy for a signed-in customer; checkout orders the account's tray.
test("a line with the server's own id is found by it", () => {
  const server = [serverLine('s1', 'p1'), serverLine('s2', 'p2')];
  assert.equal(serverLineFor(server, { id: 's2', productId: 'p2' })?.id, 's2');
});

test('a line added on the home page (an id made up in the browser) is found by its dish', () => {
  const server = [serverLine('s1', 'p1'), serverLine('s2', 'p2')];
  assert.equal(serverLineFor(server, { id: 'p2-1731800000000', productId: 'p2' })?.id, 's2');
  assert.equal(serverLineFor(server, { id: 'p9-1731800000000', productId: 'p9' }), undefined);
});

test('two sizes of one dish are told apart by their variant', () => {
  const server = [serverLine('s1', 'p1', 'small'), serverLine('s2', 'p1', 'large')];
  assert.equal(serverLineFor(server, { id: 'local', productId: 'p1', variantId: 'large' })?.id, 's2');
  assert.equal(serverLineFor(server, { id: 'local', productId: 'p1' }), undefined);
});

test("a new quantity is written to the account's line", async () => {
  const { api, calls } = fakeApi([serverLine('s1', 'p1')]);
  await writeTrayLine(api, { id: 'p1-1731800000000', productId: 'p1' }, 3);
  assert.deepEqual(calls, ['update s1 3']);
});

test("removing a line removes the account's line", async () => {
  const { api, calls } = fakeApi([serverLine('s1', 'p1'), serverLine('s2', 'p2')]);
  await writeTrayLine(api, { id: 'p2-1731800000000', productId: 'p2' }, 0);
  assert.deepEqual(calls, ['remove s2']);
});

test('removing a line the account no longer holds needs no write', async () => {
  const { api, calls } = fakeApi([]);
  await writeTrayLine(api, { id: 'local', productId: 'p1' }, 0);
  assert.deepEqual(calls, []);
});

test('a quantity for a line the account no longer holds is refused, so the screen is put back', async () => {
  const { api, calls } = fakeApi([]);
  await assert.rejects(writeTrayLine(api, { id: 'local', productId: 'p1' }, 2));
  assert.deepEqual(calls, []);
});

test('a write the server refuses is passed on', async () => {
  const { api } = fakeApi([serverLine('s1', 'p1')]);
  api.updateCartItem = async () => {
    throw new Error('INSUFFICIENT_STOCK');
  };
  await assert.rejects(writeTrayLine(api, { id: 's1', productId: 'p1' }, 99), /INSUFFICIENT_STOCK/);
});
