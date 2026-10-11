import net from 'net';

type RedisModule = typeof import('../src/config/redis');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const INFO = 'loading:0\r\nrole:master\r\n';

/** Splits what a client sent into commands: RESP arrays of bulk strings. Returns the bytes of an unfinished one. */
function parseCommands(input: string): { commands: string[][]; rest: string } {
  const commands: string[][] = [];
  let at = 0;
  while (input[at] === '*') {
    const head = input.indexOf('\r\n', at);
    if (head < 0) break;
    const args: string[] = [];
    let cursor = head + 2;
    let complete = true;
    for (let i = 0, count = Number(input.slice(at + 1, head)); i < count && complete; i++) {
      const lengthEnd = input.indexOf('\r\n', cursor);
      const length = Number(input.slice(cursor + 1, lengthEnd));
      if (lengthEnd < 0 || input.length < lengthEnd + 2 + length + 2) {
        complete = false;
        break;
      }
      args.push(input.slice(lengthEnd + 2, lengthEnd + 2 + length));
      cursor = lengthEnd + 2 + length + 2;
    }
    if (!complete) break;
    commands.push(args);
    at = cursor;
  }
  return { commands, rest: input.slice(at) };
}

/** Answers like a Redis (just enough of the protocol for ioredis) until frozen; then it stays connected and says nothing, like a stopped process. */
async function listenAsRedis() {
  const sockets = new Set<net.Socket>();
  let frozen = false;
  const server = net.createServer((socket) => {
    sockets.add(socket);
    let pending = '';
    socket.on('data', (chunk) => {
      const { commands, rest } = parseCommands(pending + chunk.toString('latin1'));
      pending = rest;
      if (frozen) return;
      for (const [name] of commands) {
        if (name.toUpperCase() === 'INFO') socket.write(`$${INFO.length}\r\n${INFO}\r\n`);
        else if (name.toUpperCase() === 'PING') socket.write('+PONG\r\n');
        else socket.write('+OK\r\n');
      }
    });
    socket.on('error', () => undefined);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    url: `redis://127.0.0.1:${port}`,
    freeze: () => { frozen = true; },
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

const originalEnv = { ...process.env };
let redis: Awaited<ReturnType<typeof listenAsRedis>>;
let config: RedisModule;
let opened: Array<{ disconnect: () => void }> = [];

beforeEach(async () => {
  redis = await listenAsRedis();
  process.env.REDIS_URL = redis.url;
  delete process.env.REDIS_COMMAND_TIMEOUT_MS;
  jest.resetModules(); // each test gets a module that has not opened its shared connection yet
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  config = require('../src/config/redis');
});
afterEach(async () => {
  for (const client of opened.splice(0)) client.disconnect(); // not quit(): a Redis that has gone silent never answers it
  await redis.close();
  process.env = { ...originalEnv };
});

const connected = async () => {
  const client = config.getRedis()!;
  opened.push(client);
  for (let waited = 0; client.status !== 'ready' && waited < 3_000; waited += 20) await sleep(20);
  expect(client.status).toBe('ready');
  return client;
};

describe('the shared Redis connection', () => {
  it('fails a command a connected Redis does not answer, instead of holding its caller for as long as the silence lasts', async () => {
    process.env.REDIS_COMMAND_TIMEOUT_MS = '200';
    const client = await connected();
    await expect(client.ping()).resolves.toBe('PONG');

    redis.freeze();
    const started = Date.now();
    const outcome = await Promise.race([client.ping().then(() => 'answered', (err: Error) => err.message), sleep(2_000).then(() => 'still waiting')]);
    expect(outcome).toBe('Command timed out');
    expect(Date.now() - started).toBeLessThan(1_500);
  });

  it('waits two seconds for a reply unless told otherwise', async () => {
    expect((await connected()).options.commandTimeout).toBe(2_000);
  });

  it('takes the wait from REDIS_COMMAND_TIMEOUT_MS', async () => {
    process.env.REDIS_COMMAND_TIMEOUT_MS = '750';
    expect((await connected()).options.commandTimeout).toBe(750);
  });

  it('does not cut the queue connections short: a worker blocks on Redis for seconds on purpose', () => {
    process.env.REDIS_COMMAND_TIMEOUT_MS = '200';
    const queue = config.newRedisConnection('queue', { maxRetriesPerRequest: null });
    opened.push(queue);
    expect(queue.options.commandTimeout).toBeUndefined();
  });
});
