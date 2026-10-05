// Load env BEFORE any other import — modules like utils/jwt validate env at
// import time and need it populated.
import 'dotenv/config';
import './config/check-env';
// Error tracking starts before everything else so startup errors are reported too.
import { initSentry, reportError, flushSentry } from './config/sentry';
import { logger, routeConsoleToLogger } from './utils/logger';
initSentry();
routeConsoleToLogger();

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import socketManager from './config/socket';
import { fileRoutes } from './storage/serve';
import { checkAndCreateStockAlerts } from './services/stock-alert.service';
import hubService from './services/hub.service';
import { recomputeRankings } from './services/ranking.service';
import { scheduleJob, stopScheduler } from './jobs/scheduler';
import { startWorkers, stopWorkers } from './jobs/queue';
import './jobs/email.jobs';
import prisma from './config/database';
import { closeRedis } from './config/redis';
import { markShuttingDown, isShuttingDown } from './utils/lifecycle';
import { apiLimiter } from './middleware/rateLimiter';
import { requestId, httpLogger } from './middleware/requestContext';
import { isProduction } from './config/env';
import { sweepStaleOrders, purgeExpiredSecrets } from './services/order-maintenance.service';
import { expireAbandonedAttempts } from './services/online-payment.service';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import healthRoutes from './routes/health.routes';
import statsRoutes from './routes/stats.routes';
import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import productVariantRoutes from './routes/product-variant.routes';
import stockAlertRoutes from './routes/stock-alert.routes';
import profitLossRoutes from './routes/profit-loss.routes';
import categoryRoutes from './routes/category.routes';
import categoryRequestRoutes from './routes/category-request.routes';
import orderRoutes from './routes/order.routes';
import cartRoutes from './routes/cart.routes';
import sellerOrderRoutes from './routes/seller-order.routes';
import adminOrderRoutes from './routes/admin-order.routes';
import realtimeOrderRoutes from './routes/realtime-order.routes';
import paymentRoutes from './routes/payment.routes';
import userProfileRoutes from './routes/user-profile.routes';
import sellerRoutes from './routes/seller.routes';
import adminRoutes from './routes/admin.routes';
import reviewRoutes from './routes/review.routes';
import promotionRoutes from './routes/promotion.routes';
import notificationRoutes from './routes/notification.routes';
import hubRoutes from './routes/hub.routes';
import riderRoutes from './routes/rider.routes';
import supportRoutes from './routes/support.routes';
import uploadRoutes from './routes/upload.routes';
import communityRoutes from './routes/community.routes';
import favoriteRoutes from './routes/favorite.routes';
import { dispatchWaiting } from './services/dispatch.service';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;
const API_VERSION = process.env.API_VERSION || 'v1';

// Trust exactly one hop (the reverse proxy/load balancer in front of this
// service in any real deployment) so req.ip and express-rate-limit's
// X-Forwarded-For handling are accurate instead of throwing
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set('trust proxy', 1);

// Initialize Socket.io
socketManager.initialize(httpServer);

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow images to be loaded from other origins
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
}));
// Request id on every log line and error response, then one log line per request.
app.use(requestId);
app.use(httpLogger);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Uploaded files: public media, signed private files, legacy /uploads (see storage/serve.ts).
app.use(fileRoutes());

// Routes. Health checks stay outside the flood limit (load balancers poll them).
app.use(`/api/${API_VERSION}/health`, healthRoutes);
app.use('/api', apiLimiter);
app.use(`/api/${API_VERSION}/stats`, statsRoutes);
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/upload`, uploadRoutes);
app.use(`/api/${API_VERSION}/products`, productRoutes);
app.use(`/api/${API_VERSION}/product-variants`, productVariantRoutes);
app.use(`/api/${API_VERSION}/stock-alerts`, stockAlertRoutes);
app.use(`/api/${API_VERSION}/profit-loss`, profitLossRoutes);
app.use(`/api/${API_VERSION}/categories`, categoryRoutes);
app.use(`/api/${API_VERSION}/category-requests`, categoryRequestRoutes);
app.use(`/api/${API_VERSION}/orders`, orderRoutes);
app.use(`/api/${API_VERSION}/cart`, cartRoutes);
app.use(`/api/${API_VERSION}/seller`, sellerOrderRoutes);
app.use(`/api/${API_VERSION}/admin`, adminOrderRoutes);
app.use(`/api/${API_VERSION}/realtime`, realtimeOrderRoutes);
app.use(`/api/${API_VERSION}/payments`, paymentRoutes);
app.use(`/api/${API_VERSION}/users`, userProfileRoutes);
app.use(`/api/${API_VERSION}/sellers`, sellerRoutes);
app.use(`/api/${API_VERSION}/admin`, adminRoutes);
app.use(`/api/${API_VERSION}/reviews`, reviewRoutes);
app.use(`/api/${API_VERSION}/promotions`, promotionRoutes);
app.use(`/api/${API_VERSION}/notifications`, notificationRoutes);
app.use(`/api/${API_VERSION}/hubs`, hubRoutes);
app.use(`/api/${API_VERSION}/riders`, riderRoutes);
app.use(`/api/${API_VERSION}/support`, supportRoutes);
app.use(`/api/${API_VERSION}/communities`, communityRoutes);
app.use(`/api/${API_VERSION}/favorites`, favoriteRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Nuray API',
    version: API_VERSION,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api/${API_VERSION}`);
  console.log(`🔌 WebSocket server initialized`);

  // Background jobs. Each run holds a Postgres advisory lock, so with several app
  // instances only one runs a given job at a time (jobs/scheduler.ts).
  // Safety-net sweep for stock alerts an order-time check might have missed
  // (e.g. a threshold lowered after the fact); real-time alerting on order creation
  // is the primary path.
  scheduleJob('stock-alerts', 6 * 60 * 60 * 1000, () => checkAndCreateStockAlerts());
  // Hub batches past their expiry stop showing as available.
  scheduleJob('hub-expiry', 60 * 60 * 1000, () => hubService.expireStaleBatches());
  // Orders nobody is moving forward release their stock and the customer's money.
  scheduleJob('dispatch-waiting', 60 * 1000, () => dispatchWaiting());
  scheduleJob('stale-orders', 2 * 60 * 1000, () => sweepStaleOrders());
  // Old one-time codes and used / expired reset tokens.
  scheduleJob('purge-expired-secrets', 6 * 60 * 60 * 1000, () => purgeExpiredSecrets());
  // Online checkout sessions nobody completed (a late payment confirmation still settles).
  scheduleJob('expire-payment-attempts', 15 * 60 * 1000, () => expireAbandonedAttempts());
  // Trending and rating scores the listings sort by (recent orders fade over days, so this
  // keeps them current even when nobody orders).
  scheduleJob('ranking-scores', 15 * 60 * 1000, () => recomputeRankings());

  // Background jobs (emails, notifications). With Redis every instance takes queued jobs.
  startWorkers();
});

/**
 * Graceful shutdown (deploys, scaling down): report not-ready so the load balancer stops
 * sending traffic, finish in-flight requests and running jobs, then close connections.
 * Forced exit if that takes too long.
 */
const SHUTDOWN_GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS) || 25_000;
// How long readiness reports 503 before the listener closes, so a load balancer stops
// routing here first (its health-check interval or so).
const SHUTDOWN_DRAIN_MS = Number(process.env.SHUTDOWN_DRAIN_MS ?? (isProduction() ? 5_000 : 0));

async function shutdown(signal: string, exitCode = 0) {
  if (isShuttingDown()) return;
  markShuttingDown();
  console.log(`${signal} received: shutting down`);
  const forced = setTimeout(() => {
    console.error('Shutdown took too long; exiting.');
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  forced.unref();

  stopScheduler();
  if (SHUTDOWN_DRAIN_MS > 0) await new Promise((resolve) => setTimeout(resolve, SHUTDOWN_DRAIN_MS));
  // Stop accepting connections; in-flight requests finish. Live sockets never end on their
  // own, so they are closed (clients reconnect to another instance).
  const httpClosed = new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await socketManager.close().catch((err) => console.error('Closing sockets failed:', err));
  await httpClosed;
  await stopWorkers().catch((err) => console.error('Stopping job workers failed:', err));
  await Promise.allSettled([prisma.$disconnect(), closeRedis(), flushSentry()]);
  console.log('Shutdown complete');
  process.exit(exitCode);
}

// A forgotten .catch() on a background promise must not take the server down: log and report it.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  reportError(reason, { kind: 'unhandledRejection' });
});
// After an uncaught exception the process state is unknown: report it, then shut down cleanly.
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  reportError(err, { kind: 'uncaughtException' });
  void shutdown('uncaughtException', 1);
});

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export default app;

