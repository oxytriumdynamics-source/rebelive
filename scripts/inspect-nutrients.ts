import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const prods = await prisma.product.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      nutritionInfo: true,
      nutrition: true,
    },
  });
  console.log(JSON.stringify(prods, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
