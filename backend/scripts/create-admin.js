/**
 * Script to create an admin user
 * Usage: node scripts/create-admin.js <email> <password> <fullName>
 * Example: node scripts/create-admin.js admin@frozennuray.com password123 "Admin User"
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: node scripts/create-admin.js <email> <password> <fullName>');
    console.error('Example: node scripts/create-admin.js admin@frozennuray.com password123 "Admin User"');
    process.exit(1);
  }

  const [email, password, fullName] = args;
  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Check if admin already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      console.log(`User with email ${normalizedEmail} already exists.`);
      
      // Update to admin if not already
      if (existingUser.userType !== 'admin') {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { userType: 'admin' },
        });
        console.log(`✅ Updated user to admin: ${normalizedEmail}`);
      } else {
        console.log(`✅ User is already an admin: ${normalizedEmail}`);
      }
      
      // Update password
      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { passwordHash: hashedPassword },
      });
      console.log(`✅ Password updated for: ${normalizedEmail}`);
      
      await prisma.$disconnect();
      return;
    }

    // Generate temporary phone number
    const emailHash = Buffer.from(normalizedEmail).toString('base64').slice(0, 8);
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.random().toString(36).substring(2, 6);
    const formattedPhone = `+999${emailHash}${timestamp}${random}`;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash: hashedPassword,
        phone: formattedPhone,
        userType: 'admin',
        emailVerified: true,
        phoneVerified: false,
        status: 'active',
        profile: {
          create: {
            fullName: fullName.trim(),
          },
        },
      },
      include: {
        profile: true,
      },
    });

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email:', admin.email);
    console.log('👤 Name:', admin.profile?.fullName);
    console.log('🔑 Password:', password);
    console.log('📱 Phone:', admin.phone);
    console.log('');
    console.log('You can now login at: http://localhost:3000/admin/login');

  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();

