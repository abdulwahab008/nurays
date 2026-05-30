/**
 * Reset password for the admin user (admin@frozennuray.com).
 * Run from backend folder: node scripts/reset-admin-password.js "YourNewPassword"
 * If no password is provided, uses temporary: Admin123!
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@frozennuray.com';
const DEFAULT_PASSWORD = 'Admin123!';
const SALT_ROUNDS = 10;

async function resetAdminPassword() {
  const newPassword = process.argv[2] || DEFAULT_PASSWORD;

  if (newPassword.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: ADMIN_EMAIL, userType: 'admin' },
  });

  if (!user) {
    console.error(`Admin user with email "${ADMIN_EMAIL}" not found.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  console.log('Admin password reset successfully.\n');
  console.log('Login at: http://localhost:3000/admin/login');
  console.log('Email:', ADMIN_EMAIL);
  console.log('Password:', process.argv[2] ? '(the password you provided)' : DEFAULT_PASSWORD);
  if (!process.argv[2]) {
    console.log('\n(Change this password after logging in.)');
  }
}

resetAdminPassword()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
