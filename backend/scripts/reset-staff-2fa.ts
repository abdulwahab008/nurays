/**
 * Reset a staff member's two-step sign-in from the server, for when no one in the app can (SEC-3): the only super
 * admin lost both the phone and the backup codes. Run where the API runs, with its DATABASE_URL:
 *
 *   npm run staff:reset-2fa -- admin@nuray.pk
 *
 * Their sessions end, and they set the authenticator app up again at their next sign-in. The reset is audited.
 */
import prisma from '../src/config/database';
import '../src/middleware/auth.middleware'; // brings in the Request.user type the audit module uses
import { recordAudit } from '../src/middleware/audit';
import { endAllSessions } from '../src/services/session.service';

async function main() {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run staff:reset-2fa -- <staff e-mail>');
  const user = await prisma.user.findFirst({ where: { email, userType: 'admin' }, select: { id: true, staffRole: true } });
  if (!user) throw new Error(`No staff account with the e-mail ${email}`);
  const { count } = await prisma.staffTwoFactor.deleteMany({ where: { userId: user.id } });
  await endAllSessions(user.id);
  await recordAudit({ action: 'staff:2FA_RESET', entityType: 'user', entityId: user.id, data: { by: 'server script', hadTwoFactor: count > 0 }, responseStatus: 200 });
  console.log(count > 0 ? `Two-step sign-in reset for ${email} (${user.staffRole}). They set it up again at their next sign-in.` : `${email} had no two-step sign-in; their sessions were ended.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
