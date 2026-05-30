const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testEmailLookup() {
  const testEmails = [
    'test@example.com',
    'TEST@EXAMPLE.COM',
    '  test@example.com  ',
    'Test@Example.com',
    'abdulwahab01567@gmail.com',
    'abdulwahab0156@gmail.com',
  ];

  console.log('=== Testing Email Lookup ===\n');

  for (const email of testEmails) {
    const normalized = email.toLowerCase().trim();
    console.log(`Testing: "${email}"`);
    console.log(`  Normalized: "${normalized}"`);
    
    // Test findUnique
    const userUnique = await prisma.user.findUnique({
      where: { email: normalized },
    });
    console.log(`  findUnique result: ${userUnique ? 'FOUND' : 'NOT FOUND'}`);
    
    // Test findFirst
    const userFirst = await prisma.user.findFirst({
      where: { email: normalized },
    });
    console.log(`  findFirst result: ${userFirst ? 'FOUND' : 'NOT FOUND'}`);
    
    if (userUnique || userFirst) {
      console.log(`  User ID: ${(userUnique || userFirst).id}`);
      console.log(`  User Email: ${(userUnique || userFirst).email}`);
    }
    console.log('');
  }

  await prisma.$disconnect();
}

testEmailLookup().catch(console.error);

