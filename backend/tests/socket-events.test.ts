import http from 'http';
import type { AddressInfo } from 'net';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

jest.mock('../src/config/database', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    order: { count: jest.fn() },
    rider: { findUnique: jest.fn() },
  },
}));

import prisma from '../src/config/database';
import socketManager from '../src/config/socket';
import { generateToken } from '../src/utils/jwt';
import { logger } from '../src/utils/logger';

const userId = '11111111-2222-3333-4444-555555555555';
const orderId = '99999999-8888-7777-6666-555555555555';
const room = `order:${orderId}`;

const findUser = prisma.user.findUnique as unknown as jest.Mock;
const countOrders = prisma.order.count as unknown as jest.Mock;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let server: http.Server;
let url: string;
const clients: ClientSocket[] = [];

beforeAll(async () => {
  delete process.env.REDIS_URL;
  server = http.createServer();
  socketManager.initialize(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await socketManager.close();
});
beforeEach(() => {
  findUser.mockResolvedValue({ id: userId, status: 'active', userType: 'customer', tokensValidAfter: null });
  countOrders.mockResolvedValue(1);
});
afterEach(() => {
  for (const client of clients.splice(0)) client.close();
  jest.restoreAllMocks();
});

async function waitFor(condition: () => boolean, ms = 3_000) {
  for (let waited = 0; !condition() && waited < ms; waited += 10) await sleep(10);
  expect(condition()).toBe(true);
}

async function connected(): Promise<ClientSocket> {
  const token = generateToken({ userId, userType: 'customer', phone: '+923001234567' });
  const client = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  return client;
}

const checkedOrders = () => countOrders.mock.calls.map(([query]) => query.where.id);
const inRoom = () => socketManager.getIO().sockets.adapter.rooms.get(room)?.size ?? 0;

/** A connection's events are handled in order: once the server has acted on this valid one, it has dealt with everything sent before it. */
async function sentinel(client: ClientSocket) {
  client.emit('join:order', orderId);
  await waitFor(() => checkedOrders().includes(orderId));
  await waitFor(() => inRoom() === 1);
}

const wrongKinds: Array<[string, unknown]> = [
  ['an object whose toString is not a function', { toString: 1 }],
  ['an object with neither valueOf nor toString to call', { valueOf: 'x', toString: null }],
  ['a number', 42],
  ['a boolean', true],
  ['null', null],
  ['an array of the id', [orderId]],
  ['an object', { id: orderId }],
  ['an empty string', ''],
  ['a string longer than any order id', 'x'.repeat(65)],
  ['a string of 900 KB', 'x'.repeat(900_000)],
];

describe('events a client sends with the wrong kind of argument', () => {
  it.each(wrongKinds)('leave:order with %s leaves the room alone and the connection up', async (_label, payload) => {
    const client = await connected();
    await sentinel(client);
    client.emit('leave:order', payload);
    client.emit('leave:order'); // no argument at all
    client.emit('join:order', 'another-order'); // still served afterwards
    await waitFor(() => checkedOrders().includes('another-order'));
    expect(client.connected).toBe(true);
    expect(inRoom()).toBe(1);
  });

  it.each(wrongKinds)('join:order with %s asks the database nothing and joins nothing', async (_label, payload) => {
    const client = await connected();
    client.emit('join:order', payload);
    client.emit('join:order');
    await sentinel(client);
    expect(checkedOrders()).toEqual([orderId]);
    expect(client.connected).toBe(true);
  });

  it('still lets a client leave a room with a proper order id', async () => {
    const client = await connected();
    await sentinel(client);
    client.emit('leave:order', orderId);
    await waitFor(() => inRoom() === 0);
  });

  it('survives an "error" event whose payload is nested deep enough to overflow the logger', async () => {
    const client = await connected();
    const nested = '{"message":"x","errors":['.repeat(20_000) + '{"message":"leaf"}' + ']}'.repeat(20_000);
    const logged = jest.spyOn(logger, 'error');
    client.io.engine.send(`2["error",${nested}]`); // a raw packet: the client library would overflow encoding it
    client.emit('error', { toString: 1 });
    await sentinel(client);
    expect(client.connected).toBe(true);
    // what a client sent is described, never handed to the logger
    expect(logged).toHaveBeenCalledWith({ clientSent: 'object', userId }, 'Socket error');
  });

  it('logs an exception raised inside a handler instead of letting it shut the server down', async () => {
    const client = await connected();
    const logged = jest.spyOn(logger, 'error');
    const boom = new Error('boom');
    jest.spyOn(logger, 'debug').mockImplementation(() => {
      throw boom;
    });
    try {
      client.emit('leave:order', orderId);
      await waitFor(() => logged.mock.calls.length > 0);
    } finally {
      jest.mocked(logger.debug).mockRestore();
    }
    expect(logged).toHaveBeenCalledWith({ err: boom, userId }, 'leave:order failed');
    expect(client.connected).toBe(true);
  });
});
