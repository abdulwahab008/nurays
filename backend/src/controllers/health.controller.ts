import { Request, Response } from 'express';
import prisma from '../config/database';
import redis from '../config/redis';
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

export const healthCheck = async (_req: Request, res: Response) => {
  const [database, redisStatus] = await Promise.all([
    probe(prisma.$queryRaw`SELECT 1`),
    probe(redis.ping()),
  ]);

  // Only the database gates the status code: docker/CI healthchecks key off
  // HTTP success, and nothing in the app consumes redis yet — a redis outage
  // degrades the report without taking the service out of rotation.
  const databaseHealthy = database === 'healthy';
  const status = !databaseHealthy ? 'unhealthy' : redisStatus === 'healthy' ? 'ok' : 'degraded';

  res.status(databaseHealthy ? 200 : 503).json({
    success: databaseHealthy,
    data: {
      status,
      timestamp: new Date().toISOString(),
      services: {
        database,
        redis: redisStatus,
        payment_gateways: getGatewayStatuses(),
      },
      version: process.env.npm_package_version || '1.0.0',
    },
  });
};
