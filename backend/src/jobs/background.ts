import { checkAndCreateStockAlerts } from '../services/stock-alert.service';
import hubService from '../services/hub.service';
import { recomputeRankings } from '../services/ranking.service';
import { pruneRefreshTokens } from '../services/session.service';
import { runDailyPayouts } from '../services/weekly-payout.service';
import { refreshAllOwing } from '../services/kitchen-owing.service';
import { logOpsSnapshot } from '../services/ops-snapshot.service';
import { remindOverdueCash } from '../services/rider-deposit.service';
import { runNightlyBooksCheck } from '../services/books-check.service';
import { sweepStaleOrders, purgeExpiredSecrets } from '../services/order-maintenance.service';
import { purgeOldAuditLogs } from '../services/audit-retention.service';
import { expireAbandonedAttempts } from '../services/online-payment.service';
import { dispatchWaiting, reclaimIdleAssignments } from '../services/dispatch.service';
import riderService from '../services/rider.service';
import ledgerService from '../services/ledger.service';
import { scheduleJob } from './scheduler';
import { startWorkers } from './queue';
import './email.jobs';
import './notify.jobs';

/**
 * The background work: the timed jobs and the queue workers. It runs in the API process (PROCESS_ROLE=all, the
 * default) or in a worker process of its own (`dist/worker.js`, with the API on PROCESS_ROLE=api), so a payout run
 * or a pile of emails cannot slow checkout. Each timed run holds a Redis lease, so with several processes only one
 * runs a given job at a time (jobs/scheduler.ts).
 */
export function startBackgroundWork() {
  // Safety-net sweep for stock alerts an order-time check might have missed
  // (e.g. a threshold lowered after the fact); real-time alerting on order creation
  // is the primary path.
  scheduleJob('stock-alerts', 6 * 60 * 60 * 1000, () => checkAndCreateStockAlerts());
  // Hub batches past their expiry stop showing as available.
  scheduleJob('hub-expiry', 60 * 60 * 1000, () => hubService.expireStaleBatches());
  // Orders nobody is moving forward release their stock and the customer's money.
  // Open rider jobs are offered again; first, one given to a rider who never moved on it goes back to the pool.
  scheduleJob('dispatch-waiting', 60 * 1000, async () => {
    await reclaimIdleAssignments();
    await dispatchWaiting();
  });
  // An order accepted ahead of its delivery day gets its rider job when that day comes.
  scheduleJob('scheduled-deliveries', 60 * 1000, () => riderService.createDueDeliveries());
  scheduleJob('stale-orders', 2 * 60 * 1000, () => sweepStaleOrders());
  // Old one-time codes and used / expired reset tokens.
  scheduleJob('purge-expired-secrets', 6 * 60 * 60 * 1000, () => purgeExpiredSecrets());
  // Audit log rows older than two years (the retention period; the database refuses anything newer).
  scheduleJob('audit-retention', 24 * 60 * 60 * 1000, () => purgeOldAuditLogs());
  // Each working day's kitchen payouts and rider pay notices (from 06:00 Pakistan time; hourly, so a missed hour catches up). Off on test servers.
  if (process.env.WEEKLY_PAYOUTS_ENABLED !== 'false') scheduleJob('daily-payouts', 60 * 60 * 1000, () => runDailyPayouts());
  // Which kitchens owe Nuray and since when (their cash orders pause after two weeks), with a daily reminder.
  scheduleJob('kitchen-owing', 6 * 60 * 60 * 1000, () => refreshAllOwing());
  // Refresh tokens nobody can use any more (expired, or in a session that ended a day ago).
  scheduleJob('prune-refresh-tokens', 6 * 60 * 60 * 1000, () => pruneRefreshTokens());
  // Online checkout sessions nobody completed (a late payment confirmation still settles).
  scheduleJob('expire-payment-attempts', 15 * 60 * 1000, () => expireAbandonedAttempts());
  // Delivered, paid orders whose ledger posting failed after the delivery was saved.
  scheduleJob('ledger-catch-up', 15 * 60 * 1000, () => ledgerService.postMissedCompletions());
  scheduleJob('ops-snapshot', 5 * 60 * 1000, () => logOpsSnapshot());
  // Riders holding customer cash past the deposit deadline: a daily reminder, and the admins told.
  // The nightly books check: ledgers that don't balance, cash that doesn't match, payouts and deposits left waiting; the admins told.
  scheduleJob('books-check', 60 * 60 * 1000, () => runNightlyBooksCheck());
  scheduleJob('cash-overdue', 60 * 60 * 1000, () => remindOverdueCash());
  // Trending and rating scores the listings sort by (recent orders fade over days, so this
  // keeps them current even when nobody orders).
  scheduleJob('ranking-scores', 15 * 60 * 1000, () => recomputeRankings());

  // Queued jobs (emails, notifications). With Redis every process running this takes queued jobs.
  startWorkers();
}
