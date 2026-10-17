import type { Server } from 'http';

/** Process lifecycle flags shared by the server, health checks and background work. */
let shuttingDown = false;

export function markShuttingDown() {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}

/**
 * Stop accepting connections and resolve once the open ones have ended. server.close() only drops
 * the keep-alive connections that are idle at that moment: one that was serving a request stays
 * open after the response, for up to keepAliveTimeout (65 s here, longer than the shutdown grace
 * period), so connections are swept as they go idle until the server has closed.
 */
export function closeHttpServer(server: Server, sweepMs = 250): Promise<void> {
  return new Promise<void>((resolve) => {
    const sweep = setInterval(() => server.closeIdleConnections(), sweepMs);
    sweep.unref();
    server.close(() => {
      clearInterval(sweep);
      resolve();
    });
  });
}
