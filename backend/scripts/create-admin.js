/**
 * Script to create the SUPER ADMIN (the one account that can add every other staff member).
 * Usage: node scripts/create-admin.js <email> <password> <fullName> [--role=admin|support]
 * Example: node scripts/create-admin.js owner@nuray.pk 'a-long-password' "Owner"
 *
 * There is exactly one super admin. If none exists yet, this creates it. If one exists, add
 * staff from the app (/admin/staff, signed in as the super admin); --role=admin|support here
 * is only a recovery route for when nobody can sign in.
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

  const [email, password, fullName] = args.filter((a) => !a.startsWith('--'));
  const roleArg = (args.find((a) => a.startsWith('--role=')) || '').slice(7);
  if (roleArg && !['admin', 'support'].includes(roleArg)) {
    console.error('--role must be admin or support');
    process.exit(1);
  }
  const normalizedEmail = email.toLowerCase().trim();

  try {
    const superExists = (await prisma.user.count({ where: { staffRole: 'super_admin' } })) > 0;
    if (superExists && !roleArg) {
      console.error('A super admin already exists. Add staff from /admin/staff (signed in as the super admin),');
      console.error('or pass --role=admin or --role=support to create one from here.');
      process.exit(1);
    }
    const staffRole = superExists ? roleArg : 'super_admin';

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
          data: { userType: 'admin', staffRole },
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
        staffRole,
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

    console.log(`✅ ${staffRole === 'super_admin' ? 'Super admin' : 'Staff member (' + staffRole + ')'} created successfully!`);
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

