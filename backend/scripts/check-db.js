const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDatabase() {
  console.log('=== Checking Users in Database ===\n');
  
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      phone: true,
      userType: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  });

  console.log(`Total users found: ${users.length}\n`);
  users.forEach((user, index) => {
    console.log(`${index + 1}. ID: ${user.id}`);
    console.log(`   Email: ${user.email || '(null)'}`);
    console.log(`   Phone: ${user.phone}`);
    console.log(`   Type: ${user.userType}`);
    console.log(`   Created: ${user.createdAt}`);
    console.log('');
  });

  // Check for duplicate emails
  console.log('\n=== Checking for Duplicate Emails ===\n');
  const emailGroups = await prisma.user.groupBy({
    by: ['email'],
    _count: {
      email: true,
    },
    having: {
      email: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  if (emailGroups.length > 0) {
    console.log('⚠️  Found duplicate emails:');
    emailGroups.forEach(group => {
      console.log(`   Email: ${group.email}, Count: ${group._count.email}`);
    });
  } else {
    console.log('✅ No duplicate emails found');
  }

  // Check for null emails
  console.log('\n=== Checking for NULL Emails ===\n');
  const nullEmailUsers = await prisma.user.findMany({
    where: {
      email: null,
    },
    select: {
      id: true,
      phone: true,
      userType: true,
    },
  });

  console.log(`Users with NULL email: ${nullEmailUsers.length}`);
  if (nullEmailUsers.length > 0) {
    nullEmailUsers.forEach(user => {
      console.log(`   ID: ${user.id}, Phone: ${user.phone}, Type: ${user.userType}`);
    });
  }

  await prisma.$disconnect();
}

checkDatabase().catch(console.error);

