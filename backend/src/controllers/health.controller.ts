import { Request, Response } from 'express';
import prisma from '../config/database';
import { getRedis } from '../config/redis';
import { isShuttingDown } from '../utils/lifecycle';
import { getGatewayStatuses } from '../gateways';

const CHECK_TIMEOUT_MS = 3000;

type ServiceStatus = 'healthy' | 'unhealthy';

// A probe can hang instead of rejecting (e.g. ioredis queues commands while
// the server is unreachable), which must not hang the health endpoint.
const withTimeout = <T>(promise: Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('health probe timed out')), CHECK_TIMEOUT_MS);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const probe = async (check: Promise<unknown>): Promise<ServiceStatus> => {
  try {
    await withTimeout(check);
    return 'healthy';
  } catch {
    return 'unhealthy';
  }
};

async function report() {
  const redis = getRedis();
  const [database, redisStatus] = await Promise.all([
    probe(prisma.$queryRaw`SELECT 1`),
    redis ? probe(redis.ping()) : Promise.resolve('not_configured' as const),
  ]);
  return { database, redis: redisStatus };
}

/**
 * Full status. Only the database gates the status code: a Redis outage affects every
 * instance alike (limits fail open, live updates stay local, jobs wait), so taking them all
 * out of rotation would only turn a degraded service into no service.
 */
export const healthCheck = async (_req: Request, res: Response) => {
  const services = await report();
  const databaseHealthy = services.database === 'healthy';
  const status = !databaseHealthy ? 'unhealthy' : services.redis === 'unhealthy' ? 'degraded' : 'ok';

  res.status(databaseHealthy ? 200 : 503).json({
    success: databaseHealthy,
    data: {
      status,
      timestamp: new Date().toISOString(),
      services: {
        ...services,
        payment_gateways: getGatewayStatuses(),
      },
      version: process.env.npm_package_version || '1.0.0',
    },
  });
};

/** Liveness: the process is up and serving. Restart it only if this fails. */
export const liveness = (_req: Request, res: Response) => {
  res.status(200).json({ success: true, data: { status: 'alive' } });
};

/** Readiness: send traffic here? No while shutting down or without the database. */
export const readiness = async (_req: Request, res: Response) => {
  if (isShuttingDown()) {
    res.status(503).json({ success: false, data: { status: 'shutting_down' } });
    return;
  }
  const database = await probe(prisma.$queryRaw`SELECT 1`);
  res.status(database === 'healthy' ? 200 : 503).json({ success: database === 'healthy', data: { status: database === 'healthy' ? 'ready' : 'unavailable', database } });
};
