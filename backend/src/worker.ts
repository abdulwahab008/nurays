// Load env BEFORE any other import, as in index.ts.
import 'dotenv/config';
import './config/check-env';
import { initSentry, reportError, flushSentry } from './config/sentry';
import { logger, routeConsoleToLogger } from './utils/logger';
initSentry();
routeConsoleToLogger();

import socketManager from './config/socket';
import prisma from './config/database';
import { redisUrl, closeRedis } from './config/redis';
import { startBackgroundWork } from './jobs/background';
import { stopScheduler } from './jobs/scheduler';
import { stopWorkers } from './jobs/queue';

/**
 * The worker process: the timed jobs and the queue workers, with no HTTP server, so they never compete with
 * customers' requests. Run the API next to it with PROCESS_ROLE=api. Several workers are safe: each timed run takes
 * a Redis lease and each queued job is taken once.
 */
if (!redisUrl()) {
  logger.fatal('The worker needs REDIS_URL: it takes jobs from the Redis queue and sends live updates through it.');
  process.exit(1);
}

socketManager.initializeEmitter();
startBackgroundWork();
logger.info({ env: process.env.NODE_ENV || 'development' }, 'Worker running (timed jobs and queue)');

const SHUTDOWN_GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS) || 25_000;
let stopping = false;

async function shutdown(signal: string, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Worker shutting down');
  setTimeout(() => {
    logger.error('Worker shutdown took too long; exiting');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS).unref();
  stopScheduler();
  // Running jobs finish; a job cut off by the forced exit is retried by the queue.
  await stopWorkers().catch((err) => logger.error({ err }, 'Stopping job workers failed'));
  await socketManager.close().catch(() => undefined);
  await Promise.allSettled([prisma.$disconnect(), closeRedis(), flushSentry()]);
  logger.info('Worker shutdown complete');
  process.exit(exitCode);
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  reportError(reason, { kind: 'unhandledRejection' });
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  reportError(err, { kind: 'uncaughtException' });
  void shutdown('uncaughtException', 1);
});
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
