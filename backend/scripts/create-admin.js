/**
 * Script to create the SUPER ADMIN (the one account that can add every other staff member).
 * Usage: node scripts/create-admin.js <email> <password> <fullName> [--role=admin|support]
 * Example: node scripts/create-admin.js owner@nuray.pk '<twelve or more characters>' "Owner"
 *
 * A staff password has at least 12 characters and must not be a common one. For an email that already
 * has an account, the account becomes staff and its password is replaced (every session it had ends).
 * The password is never printed.
 *
 * There is exactly one super admin. If none exists yet, this creates it. If one exists, add
 * staff from the app (/admin/staff, signed in as the super admin); --role=admin|support here
 * is only a recovery route for when nobody can sign in.
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

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

async function createAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: node scripts/create-admin.js <email> <password> <fullName>');
    console.error('Example: node scripts/create-admin.js owner@nuray.pk \'<twelve or more characters>\' "Owner"');
    process.exit(1);
  }

  const [email, password, fullName] = args.filter((a) => !a.startsWith('--'));
  const roleArg = (args.find((a) => a.startsWith('--role=')) || '').slice(7);
  if (roleArg && !['admin', 'support'].includes(roleArg)) {
    console.error('--role must be admin or support');
    process.exit(1);
  }
  const normalizedEmail = email.toLowerCase().trim();
  const problem = passwordProblem(password, { email: normalizedEmail, name: fullName });
  if (problem) {
    console.error(PROBLEMS[problem]);
    process.exit(1);
  }

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
      
      // Update password, and end every session the account had
      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { passwordHash: hashedPassword, tokensValidAfter: new Date() },
      });
      await prisma.auditLog.create({
        data: { userId: existingUser.id, action: 'auth:PASSWORD_RESET', entityType: 'user', entityId: existingUser.id, requestData: { via: 'create-admin script' }, responseStatus: 200 },
      });
      console.log(`✅ Password updated for: ${normalizedEmail} (their sessions were signed out)`);
      
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

