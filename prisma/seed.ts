/**
 * prisma/seed.ts
 * Seeds the PersonalityType collection with APEX, CAPELLA, and AVIVA.
 * Run with: npx tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const personalityTypes = [
  {
    name: 'APEX',
    slug: 'apex',
    cardImage: '/brand/APEX.png',
    colorHex: '#0a0a0a',
    description:
      'You are Built to climb. Driven to go further. The peak isn\'t the end. It\'s proof you can go higher.',
    tagline: 'Built to climb. Driven to go further.',
    idealProductIds: [],
    traits: ['Ambitious', 'Relentless', 'Focused', 'Bold', 'Summit-Seeker'],
  },
  {
    name: 'CAPELLA',
    slug: 'capella',
    cardImage: '/brand/Capella.png',
    colorHex: '#c8922a',
    description:
      "Some paths aren't meant to be understood all at once. Keep moving. One day, it will all make sense.",
    tagline: "Some paths aren't meant to be understood all at once.",
    idealProductIds: [],
    traits: ['Intuitive', 'Navigating', 'Curious', 'Steady', 'Signal-Reader'],
  },
  {
    name: 'AVIVA',
    slug: 'aviva',
    cardImage: '/brand/Aviva.png',
    colorHex: '#e8628a',
    description:
      'Every new chapter begins with a decision. Take the leap. The rest comes after.',
    tagline: 'Every new chapter begins with a decision.',
    idealProductIds: [],
    traits: ['Energetic', 'Catalyst', 'Fearless', 'Vibrant', 'Live-Wire'],
  },
];

async function main() {
  console.log('🌱 Seeding PersonalityTypes...');

  for (const pt of personalityTypes) {
    const result = await prisma.personalityType.upsert({
      where: { slug: pt.slug },
      update: {
        name: pt.name,
        cardImage: pt.cardImage,
        colorHex: pt.colorHex,
        description: pt.description,
        tagline: pt.tagline,
        traits: pt.traits,
      },
      create: pt,
    });
    console.log(`  ✓ ${result.name} (id: ${result.id}, slug: ${result.slug})`);
  }

  console.log('✅ Seeding complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
