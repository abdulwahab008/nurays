/**
 * Reset the password of a staff account (for when nobody can sign in).
 * Run from the backend folder: node scripts/reset-admin-password.js <email> '<new password>'
 *
 * The new password has at least 12 characters and is not a common one. The account's sessions are all
 * signed out, and the reset is written to the audit log. The password is never printed.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const SALT_ROUNDS = 10;
const MIN_STAFF_PASSWORD_LENGTH = 12;

/** The shared password rules (common passwords, the person's own details). Plain length check if they cannot be loaded. */
function passwordProblem(password, who) {
  try {
    require('ts-node/register/transpile-only');
    return require('../src/utils/password-rules').checkPassword(password, { minLength: MIN_STAFF_PASSWORD_LENGTH, ...who });
  } catch {
    return [...password].length < MIN_STAFF_PASSWORD_LENGTH ? 'TOO_SHORT' : null;
  }
}

const PROBLEMS = {
  TOO_SHORT: `The password must have at least ${MIN_STAFF_PASSWORD_LENGTH} characters.`,
  TOO_LONG: 'The password must have at most 200 characters.',
  COMMON: 'That password is too common. Choose something harder to guess.',
  PERSONAL: 'The password must not contain the name or email address.',
};

async function resetAdminPassword() {
  const [emailArg, newPassword] = process.argv.slice(2);
  if (!emailArg || !newPassword) {
    console.error("Usage: node scripts/reset-admin-password.js <email> '<new password>'");
    process.exit(1);
  }
  const email = emailArg.toLowerCase().trim();

  const user = await prisma.user.findFirst({
    where: { email, userType: 'admin' },
    include: { profile: { select: { fullName: true } } },
  });
  if (!user) {
    console.error(`No staff account with the email "${email}".`);
    process.exit(1);
  }

  const problem = passwordProblem(newPassword, { email, name: user.profile?.fullName });
  if (problem) {
    console.error(PROBLEMS[problem]);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  // A new password ends every session the account had: whoever was signed in must sign in again.
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, tokensValidAfter: new Date() } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: 'auth:PASSWORD_RESET', entityType: 'user', entityId: user.id, requestData: { via: 'reset-admin-password script' }, responseStatus: 200 },
  });

  console.log(`Password reset for ${email}. Their sessions were signed out.`);
  console.log('Sign in at: /admin/login');
}

resetAdminPassword()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
