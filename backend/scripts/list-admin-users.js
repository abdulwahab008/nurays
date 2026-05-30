/**
 * List all admin users in the database (email/phone only - passwords cannot be retrieved).
 * Run from backend folder: node scripts/list-admin-users.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listAdminUsers() {
  const admins = await prisma.user.findMany({
    where: { userType: 'admin' },
    select: {
      id: true,
      email: true,
      phone: true,
      userType: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (admins.length === 0) {
    console.log('No admin users found in the database.');
    console.log('Create one via: POST /api/v1/auth/register with user_type: "admin"');
    return;
  }

  console.log('=== Admin users ===\n');
  admins.forEach((user, i) => {
    console.log(`${i + 1}. Email: ${user.email || '(none)'}`);
    console.log(`   Phone: ${user.phone}`);
    console.log(`   Status: ${user.status}`);
    console.log(`   Created: ${user.createdAt}`);
    console.log('');
  });
  console.log('Passwords are hashed and cannot be retrieved. Reset password via DB or register a new admin.');
}

listAdminUsers()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
