import { Request, Response } from 'express';
import prisma from '../config/database';
import { getRedis } from '../config/redis';
import { isShuttingDown } from '../utils/lifecycle';
import { getGatewayStatuses } from '../gateways';
import { optionalAuthenticate } from '../middleware/auth.middleware';
import { verifyToken } from '../utils/jwt';
import { getQueueCounts } from '../jobs/queue';

const CHECK_TIMEOUT_MS = 3000;
const ADMIN_CHECK_TIMEOUT_MS = 500;
// These endpoints are public and outside the rate limiter: however often they are hit, each
// instance probes the database and Redis at most about once a second.
const PROBE_CACHE_MS = 1000;

type ServiceStatus = 'healthy' | 'unhealthy' | 'not_configured';

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

function cachedProbe(run: () => Promise<ServiceStatus>): () => Promise<ServiceStatus> {
  let entry: { result: Promise<ServiceStatus>; settledAt: number | null } | null = null;
  return () => {
    if (entry && (entry.settledAt === null || Date.now() - entry.settledAt < PROBE_CACHE_MS)) return entry.result;
    const next = { result: run(), settledAt: null as number | null };
    void next.result.then(() => {
      next.settledAt = Date.now();
    });
    entry = next;
    return next.result;
  };
}

const databaseStatus = cachedProbe(() => probe(prisma.$queryRaw`SELECT 1`));
const redisStatus = cachedProbe(() => {
  const redis = getRedis();
  return redis ? probe(redis.ping()) : Promise.resolve('not_configured');
});

// The route is public and not rate limited, so only a validly signed token that claims admin may cost a database lookup; the
// lookup still decides (the claim can be stale), and one that is slow to answer gets the public view.
async function isAdmin(req: Request, res: Response): Promise<boolean> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return false;
  try {
    if (verifyToken(header.substring(7)).userType !== 'admin') return false;
  } catch {
    return false;
  }
  let timer: NodeJS.Timeout | undefined;
  const checked = new Promise<boolean>((resolve) => {
    void optionalAuthenticate(req, res, () => resolve(req.user?.userType === 'admin'));
  });
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ADMIN_CHECK_TIMEOUT_MS);
    timer.unref?.();
  });
  return Promise.race([checked, timedOut]).finally(() => clearTimeout(timer));
}

/**
 * Status of the database and Redis. Only the database gates the status code: a Redis outage affects every
 * instance alike (limits fail open, live updates stay local, jobs wait), so taking them all
 * out of rotation would only turn a degraded service into no service. An admin's token adds the
 * payment gateway configuration and the job queue counts, which the public must not see.
 */
export const healthCheck = async (req: Request, res: Response) => {
  const [database, redis, admin] = await Promise.all([databaseStatus(), redisStatus(), isAdmin(req, res)]);
  const databaseHealthy = database === 'healthy';
  const status = !databaseHealthy ? 'unhealthy' : redis === 'unhealthy' ? 'degraded' : 'ok';
  const details = admin
    ? { payment_gateways: getGatewayStatuses(), jobs: await getQueueCounts() }
    : {};

  res.status(databaseHealthy ? 200 : 503).json({
    success: databaseHealthy,
    data: {
      status,
      timestamp: new Date().toISOString(),
      services: { database, redis, ...details },
      ...(admin ? { version: process.env.npm_package_version || '1.0.0' } : {}),
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
  const database = await databaseStatus();
  res.status(database === 'healthy' ? 200 : 503).json({ success: database === 'healthy', data: { status: database === 'healthy' ? 'ready' : 'unavailable', database } });
};
