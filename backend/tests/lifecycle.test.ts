import http from 'http';
import type { AddressInfo } from 'net';
import { closeHttpServer } from '../src/utils/lifecycle';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A server that answers after `ms`, and keeps idle keep-alive connections for as long as the app does (65 s; 30 s is already longer than any test). */
async function listen(ms: number) {
  const server = http.createServer((_req, res) => {
    setTimeout(() => res.end('done'), ms);
  });
  server.keepAliveTimeout = 30_000;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

/** Send a request over `agent`; resolves with the response body once it has arrived. */
const get = (port: number, agent: http.Agent) =>
  new Promise<string>((resolve, reject) => {
    http
      .get({ port, host: '127.0.0.1', agent }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(body));
      })
      .on('error', reject);
  });

/** How long closing took, or 'still open' if it had not finished by `limitMs`. */
async function closing(server: http.Server, limitMs: number): Promise<number | 'still open'> {
  const started = Date.now();
  return Promise.race([closeHttpServer(server, 20).then(() => Date.now() - started), sleep(limitMs).then(() => 'still open' as const)]);
}

describe('closing the HTTP server for a shutdown', () => {
  it('finishes the request that is in flight, then closes at once instead of waiting out its keep-alive connection', async () => {
    const { server, port } = await listen(400);
    const agent = new http.Agent({ keepAlive: true }); // like a browser or a load balancer: the connection outlives the response
    try {
      const response = get(port, agent);
      await sleep(100); // the request is being served
      const closed = closing(server, 3_000);
      await expect(response).resolves.toBe('done');
      const took = await closed;
      expect(took).not.toBe('still open');
      expect(took).toBeLessThan(2_000);
    } finally {
      agent.destroy();
      server.closeAllConnections();
    }
  });

  it('closes right away when nothing is open', async () => {
    const { server } = await listen(0);
    expect(await closing(server, 1_000)).toBeLessThan(500);
  });

  it('drops a connection that was idle when the shutdown began, and one that goes idle later', async () => {
    const { server, port } = await listen(300);
    const agent = new http.Agent({ keepAlive: true, maxSockets: 2 });
    try {
      await Promise.all([get(port, agent), get(port, agent)]); // two connections, both idle afterwards
      const busy = get(port, agent); // takes one of them back
      await sleep(100);
      const closed = closing(server, 3_000);
      await expect(busy).resolves.toBe('done');
      expect(await closed).not.toBe('still open');
    } finally {
      agent.destroy();
      server.closeAllConnections();
    }
  });
});
