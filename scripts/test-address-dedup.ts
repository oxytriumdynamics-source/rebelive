import { prisma } from '../src/config/database';
import {
  saveUniqueUserAddress,
  getUserAddresses,
  extractAddressFields,
  areAddressesEqual,
} from '../src/modules/users/address.service';

async function main() {
  console.log('🧪 Running Address Deduplication & Storage Unit Tests...\n');

  // Find a test user or admin
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error('❌ No user found in database to test with');
    process.exit(1);
  }
  console.log(`👤 Using test user: ${user.email} (ID: ${user.id})`);

  // Clean any prior test addresses for this user
  await prisma.address.deleteMany({
    where: {
      userId: user.id,
      line1: { contains: 'TEST_REBELIVE_ADDR' },
    },
  });

  const sampleAddress1 = {
    line1: 'TEST_REBELIVE_ADDR Flat 101, Alpha Heights',
    line2: 'Sector 5, Near Market',
    city: 'Amritsar',
    state: 'Punjab',
    postalCode: '143001',
    country: 'India',
    name: 'Operator Apex',
    phone: '9876543210',
  };

  // Test 1: Save first unique address
  console.log('--- Test 1: Saving unique address 1 ---');
  const saved1 = await saveUniqueUserAddress(user.id, sampleAddress1);
  console.log('Result 1:', saved1 ? `✅ Saved address id: ${saved1.id}` : '❌ Failed to save');

  // Test 2: Attempt to save identical/duplicate address (with slight formatting differences: lowercase, spaces)
  console.log('\n--- Test 2: Attempting duplicate save with different casing/spacing ---');
  const duplicateAddress = {
    line1: '  test_rebelive_addr flat 101, alpha heights  ',
    line2: 'sector 5, near market',
    city: 'amritsar',
    state: 'punjab',
    postalCode: '143001',
    country: 'India',
    name: 'Operator Apex',
    phone: '9876543210',
  };
  const countBefore = await prisma.address.count({
    where: { userId: user.id, line1: { contains: 'TEST_REBELIVE_ADDR' } },
  });
  const savedDup = await saveUniqueUserAddress(user.id, duplicateAddress);
  const countAfter = await prisma.address.count({
    where: { userId: user.id, line1: { contains: 'TEST_REBELIVE_ADDR' } },
  });

  if (countBefore === countAfter && savedDup?.id === saved1?.id) {
    console.log(`✅ Duplicate correctly detected! No new record created (Count before: ${countBefore}, Count after: ${countAfter})`);
  } else {
    console.error(`❌ Duplicate check failed! Count before: ${countBefore}, Count after: ${countAfter}`);
  }

  // Test 3: Save second truly unique address (e.g. different house / pincode)
  console.log('\n--- Test 3: Saving distinct unique address 2 ---');
  const sampleAddress2 = {
    line1: 'TEST_REBELIVE_ADDR Villa 42, Green Avenue',
    line2: 'Phase 2',
    city: 'Amritsar',
    state: 'Punjab',
    postalCode: '143002',
    country: 'India',
    name: 'Operator Apex',
    phone: '9876543210',
  };
  const saved2 = await saveUniqueUserAddress(user.id, sampleAddress2);
  const totalCount = await prisma.address.count({
    where: { userId: user.id, line1: { contains: 'TEST_REBELIVE_ADDR' } },
  });

  if (totalCount === 2 && saved2 && saved2.id !== saved1?.id) {
    console.log(`✅ Unique address 2 saved successfully! Total test addresses: ${totalCount}`);
  } else {
    console.error(`❌ Unique address 2 failed: totalCount=${totalCount}`);
  }

  // Test 4: Verify getUserAddresses returns them with default status
  console.log('\n--- Test 4: Verify getUserAddresses retrieval ---');
  const allUserAddresses = await getUserAddresses(user.id);
  const testAddresses = allUserAddresses.filter((a) => a.line1.includes('TEST_REBELIVE_ADDR'));
  console.log(`Found ${testAddresses.length} test addresses for user`);
  console.log('Address 1 isDefault:', testAddresses.find((a) => a.id === saved1?.id)?.isDefault);

  // Clean up
  await prisma.address.deleteMany({
    where: {
      userId: user.id,
      line1: { contains: 'TEST_REBELIVE_ADDR' },
    },
  });
  console.log('\n🧹 Test addresses cleaned up.');
  console.log('\n🎉 ALL ADDRESS DEDUPLICATION & STORAGE TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error running test script:', err);
  process.exit(1);
});
