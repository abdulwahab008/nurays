import prisma from '../config/database';
import { logger } from '../utils/logger';

/**
 * The audit log is kept for two years (SEC-R7). Once a day, rows older than that are deleted. The database's
 * append-only trigger allows it only inside a transaction that turns on `nuray.audit_purge`, and only for rows older
 * than two years (migration 20261026130000_audit_log_retention), so this is the one way anything leaves the log.
 */
export async function purgeOldAuditLogs(): Promise<number> {
  const deleted = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('nuray.audit_purge', 'on', true)`;
    return tx.$executeRaw`DELETE FROM "audit_logs" WHERE "created_at" < now() - interval '2 years'`;
  });
  if (deleted > 0) logger.info({ deleted }, 'Audit log rows older than two years deleted');
  return deleted;
}
