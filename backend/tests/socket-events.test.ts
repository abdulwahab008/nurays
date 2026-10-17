import crypto from 'crypto';
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
import socketManager, { withinEventLimit } from '../src/config/socket';
import { generateToken } from '../src/utils/jwt';
import { logger } from '../src/utils/logger';

const orderId = '99999999-8888-7777-6666-555555555555';
const room = `order:${orderId}`;

const findUser = prisma.user.findUnique as unknown as jest.Mock;
const countOrders = prisma.order.count as unknown as jest.Mock;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let server: http.Server;
let url: string;
let userId: string;
const clients: ClientSocket[] = [];

beforeAll(async () => {
  delete process.env.REDIS_URL;
  server = http.createServer();
  socketManager.initialize(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await socketManager.close();
});
beforeEach(() => {
  userId = crypto.randomUUID(); // events are counted per user: every test is its own
  findUser.mockResolvedValue({ id: userId, status: 'active', userType: 'customer', tokensValidAfter: null });
  countOrders.mockResolvedValue(1);
});
afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await waitFor(() => socketManager.getIO().sockets.sockets.size === 0); // the server has seen them all go: the next test finds the rooms empty
  delete process.env.SOCKET_EVENTS_PER_MINUTE;
  jest.restoreAllMocks();
});

async function waitFor(condition: () => boolean, ms = 3_000) {
  for (let waited = 0; !condition() && waited < ms; waited += 10) await sleep(10);
  expect(condition()).toBe(true);
}

async function connected(as = userId): Promise<ClientSocket> {
  const token = generateToken({ userId: as, userType: 'customer', phone: '+923001234567' });
  const client = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false });
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  return client;
}

const checkedOrders = () => countOrders.mock.calls.map(([query]) => query.where.id as string);
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

describe('a user who sends events faster than any page does', () => {
  it('has the events past the limit dropped before they reach the database, and says so once', async () => {
    process.env.SOCKET_EVENTS_PER_MINUTE = '25';
    const warned = jest.spyOn(logger, 'warn');
    const client = await connected();
    for (let i = 0; i < 2_000; i++) client.emit('join:order', `flood-${i}`);
    await waitFor(() => countOrders.mock.calls.length >= 25);
    await sleep(300); // long enough for the rest to have arrived
    expect(checkedOrders()).toEqual(Array.from({ length: 25 }, (_, i) => `flood-${i}`));
    expect(client.connected).toBe(true);
    expect(warned.mock.calls.filter(([, message]) => message === 'Socket events dropped: too many in a minute')).toHaveLength(1);
  });

  it('shares the limit between all of their connections', async () => {
    process.env.SOCKET_EVENTS_PER_MINUTE = '30';
    const flooders = await Promise.all([connected(), connected(), connected()]);
    for (const [n, client] of flooders.entries()) for (let i = 0; i < 100; i++) client.emit('join:order', `c${n}-${i}`);
    await waitFor(() => countOrders.mock.calls.length >= 30);
    await sleep(300);
    expect(countOrders).toHaveBeenCalledTimes(30);
  });

  it('keeps a flood from one user from using up the events of another', async () => {
    process.env.SOCKET_EVENTS_PER_MINUTE = '25';
    const flooder = await connected();
    const bystander = await connected(crypto.randomUUID());
    for (let i = 0; i < 500; i++) flooder.emit('join:order', `flood-${i}`);
    bystander.emit('join:order', orderId);
    await waitFor(() => checkedOrders().includes(orderId));
    await waitFor(() => inRoom() === 1);
  });

  it('is let through at 120 events a minute unless told otherwise', async () => {
    const client = await connected();
    for (let i = 0; i < 150; i++) client.emit('join:order', `busy-${i}`);
    await waitFor(() => countOrders.mock.calls.length >= 120);
    await sleep(300);
    expect(countOrders).toHaveBeenCalledTimes(120);
  });
});

describe('the count of events per user', () => {
  it('starts afresh each minute and keeps users apart', () => {
    process.env.SOCKET_EVENTS_PER_MINUTE = '3';
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const [busy, quiet] = [crypto.randomUUID(), crypto.randomUUID()];
    expect([1, 2, 3, 4, 5].map(() => withinEventLimit(busy))).toEqual([true, true, true, false, false]);
    expect(withinEventLimit(quiet)).toBe(true);
    now.mockReturnValue(1_000_000 + 59_000);
    expect(withinEventLimit(busy)).toBe(false);
    now.mockReturnValue(1_000_000 + 61_000);
    expect(withinEventLimit(busy)).toBe(true);
  });

  it('ignores a limit that is not a positive number', () => {
    for (const bad of ['0', '-5', 'many', '']) {
      process.env.SOCKET_EVENTS_PER_MINUTE = bad;
      const id = crypto.randomUUID();
      expect(Array.from({ length: 121 }, () => withinEventLimit(id)).filter(Boolean)).toHaveLength(120);
    }
  });
});
