import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Pushing test admin accounts to MongoDB Atlas...');

  const passwordHash = await bcrypt.hash('AdminPassword123!', 10);

  const testAdmins = [
    {
      email: 'testadmin@rebelive.com',
      firstName: 'Test',
      lastName: 'Admin',
      role: 'SUPERADMIN' as const,
      phone: '+919876543210',
    },
    {
      email: 'admin@rebelive.com',
      firstName: 'Master',
      lastName: 'Admin',
      role: 'SUPERADMIN' as const,
      phone: '+919876543211',
    },
    {
      email: 'root@rebelive.com',
      firstName: 'Root',
      lastName: 'Operator',
      role: 'SUPERADMIN' as const,
      phone: '+919876543212',
    },
  ];

  for (const admin of testAdmins) {
    const existing = await prisma.user.findUnique({
      where: { email: admin.email },
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: 'SUPERADMIN',
          passwordHash,
          emailVerified: true,
          firstName: admin.firstName,
          lastName: admin.lastName,
          authProvider: 'local',
        },
      });
      console.log(`✅ Updated existing admin user: ${admin.email} (Role: SUPERADMIN)`);
    } else {
      await prisma.user.create({
        data: {
          email: admin.email,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: 'SUPERADMIN',
          passwordHash,
          emailVerified: true,
          authProvider: 'local',
          phone: admin.phone,
        },
      });
      console.log(`✅ Created test admin user: ${admin.email} (Role: SUPERADMIN)`);
    }
  }

  console.log('\n🎉 Test admins successfully configured in database!');
  console.log('Credentials:');
  console.log('  Email: testadmin@rebelive.com (or admin@rebelive.com / root@rebelive.com)');
  console.log('  Password: AdminPassword123!');
  console.log('  OTP verification: Can be bypassed with 1-click test login');
}

main()
  .catch((e) => {
    console.error('❌ Error pushing test admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
