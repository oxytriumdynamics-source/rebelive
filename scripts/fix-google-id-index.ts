/**
 * One-time fix: Convert users.google_id unique index to a sparse unique index
 * using Prisma's runCommandRaw so we don't need the bare mongodb driver.
 *
 * Run: node dist/scripts/fix-google-id-index.js
 *   OR via ts-node from a fresh context.
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

const INDEX_NAME = 'users_google_id_key';

async function main() {
  console.log('Fixing google_id index on users collection…');

  // Drop the existing (non-sparse) unique index
  try {
    await prisma.$runCommandRaw({ dropIndexes: 'users', index: INDEX_NAME });
    console.log(`✅  Dropped non-sparse index "${INDEX_NAME}"`);
  } catch (err: any) {
    if (err?.message?.includes('index not found')) {
      console.log(`ℹ️   Index "${INDEX_NAME}" did not exist — skipping drop.`);
    } else {
      throw err;
    }
  }

  // Re-create as sparse + unique
  await prisma.$runCommandRaw({
    createIndexes: 'users',
    indexes: [
      {
        key: { google_id: 1 },
        name: INDEX_NAME,
        unique: true,
        sparse: true,
      },
    ],
  });

  console.log(`✅  Recreated "${INDEX_NAME}" as a sparse unique index.`);
  console.log('Done! Local-user registration will now work for any number of users.');
}

main()
  .catch((err) => {
    console.error('❌  Script failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
