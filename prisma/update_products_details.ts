import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMMON_ADDITIONAL_INFO = {
  recommendedUsage: 'Consume not more than 500 ml per day.',
  directionsForUse: 'Best served chilled.',
  storage: 'Store in a cool and dry place. Avoid direct sunlight.',
  disclaimer:
    'Contains caffeine. Not recommended for children, pregnant or lactating women, or persons sensitive to caffeine. Not suitable for persons below 18 years of age. No medicinal or disease claims.',
  bestBefore: '12 months from the date of manufacture',
  countryOfOrigin: 'INDIA',
  manufacturedBy: {
    name: 'Patel Beverages Pvt. Ltd.',
    address: '505/2-3-4, G.I.D.C Estate, Makarpura, Vadodara, Gujarat - 3900010',
    fssaiLicNo: '10013021000941',
  },
  marketedBy: {
    name: 'OXYTRIUM DYNAMICS PRIVATE LIMITED',
    address:
      '2nd Floor, House No. 81, Ward No. 12, Manikpur, Keshopur, Rajpur, Buxar, Bihar, India, 802113',
    fssaiLicNo: '10013021000941',
  },
};

const COMMON_INGREDIENTS =
  'Carbonated Water, Fructo-oligosaccharides (FOS), Acidity Regulator (INS 345), Acidity Regulator (INS 332(ii)), Acidity Regulator (INS 330), Nature Identical Flavouring Substances, Ashwagandha (KSM-66®), Bacillus clausii, Monk Fruit Extract, L-Theanine, Natural Caffeine Extract, Preservative (INS 211), Vitamin Premix (B6, B9, B12).';

const PRODUCTS_METADATA: Record<string, {
  netQuantity: string;
  isVegetarian: boolean;
  ingredients: string;
  nutritionInfo: any;
  additionalInfo: any;
}> = {
  apex: {
    netQuantity: '250 ml',
    isVegetarian: true,
    ingredients: COMMON_INGREDIENTS,
    nutritionInfo: {
      productName: 'APEX',
      servingSize: '250 ml',
      servingsPerContainer: '1 serving per container (250 ml)',
      nutrients: [
        { nutrient: 'Energy (kCal)', per100ml: '9.33', perServe: '23.325', rda: '1.17%' },
        { nutrient: 'Total Fat (g)', per100ml: '0', perServe: '0', rda: '0' },
        { nutrient: 'Carbohydrates (g)', per100ml: '2.33', perServe: '5.825', rda: '10.79%' },
        { nutrient: 'Total Sugars (g)', per100ml: '1.9', perServe: '4.75', rda: '0' },
        { nutrient: 'Added Sugars (g)', per100ml: '0', perServe: '0', rda: '0' },
        { nutrient: 'Dietary Fiber (g)', per100ml: '1.48', perServe: '3.7', rda: '12.33%' },
        { nutrient: 'Protein (g)', per100ml: '0', perServe: '0', rda: '0' },
        { nutrient: 'Sodium (mg)', per100ml: '2.97', perServe: '7.425', rda: '0.37%' },
        { nutrient: 'Potassium (mg)', per100ml: '55.98', perServe: '139.95', rda: '4.00%' },
        { nutrient: 'Magnesium (mg)', per100ml: '49.77', perServe: '124.425', rda: '32.32%' },
        { nutrient: 'Caffeine (mg)', per100ml: '18', perServe: '45', rda: '15.00%' },
        { nutrient: 'Vitamin B6 (mg)', per100ml: '0.39', perServe: '0.975', rda: '40.63%' },
        { nutrient: 'Vitamin B9 (mcg)', per100ml: '36.39', perServe: '90.975', rda: '30.33%' },
        { nutrient: 'Vitamin B12 (mcg)', per100ml: '0.21', perServe: '0.525', rda: '21.00%' },
      ],
      notes: ['* Approximate Value', '** Based on 2000 kCal Diet'],
    },
    additionalInfo: COMMON_ADDITIONAL_INFO,
  },
  capella: {
    netQuantity: '250 ml',
    isVegetarian: true,
    ingredients: COMMON_INGREDIENTS,
    nutritionInfo: {
      productName: 'CAPELLA',
      servingSize: '250 ml',
      servingsPerContainer: '1 serving per container (250 ml)',
      nutrients: [
        { nutrient: 'Energy (kCal)', per100ml: '10.78', perServe: '26.950', rda: '1.35%' },
        { nutrient: 'Total Fat (g)', per100ml: '0', perServe: '0', rda: '0' },
        { nutrient: 'Carbohydrates (g)', per100ml: '2.69', perServe: '6.725', rda: '12.45%' },
        { nutrient: 'Total Sugars (g)', per100ml: '1.8', perServe: '4.500', rda: '0' },
        { nutrient: 'Added Sugars (g)', per100ml: '0', perServe: '0', rda: '0' },
        { nutrient: 'Dietary Fiber (g)', per100ml: '1.56', perServe: '3.900', rda: '13.00%' },
        { nutrient: 'Protein (g)', per100ml: '0', perServe: '0', rda: '0' },
        { nutrient: 'Sodium (mg)', per100ml: '3.11', perServe: '7.775', rda: '0.39%' },
        { nutrient: 'Potassium (mg)', per100ml: '60.86', perServe: '152.150', rda: '4.35%' },
        { nutrient: 'Magnesium (mg)', per100ml: '53.33', perServe: '133.325', rda: '34.63%' },
        { nutrient: 'Caffeine (mg)', per100ml: '19', perServe: '47.500', rda: '15.83%' },
        { nutrient: 'Vitamin B6 (mg)', per100ml: '0.33', perServe: '0.825', rda: '34.38%' },
        { nutrient: 'Vitamin B9 (mcg)', per100ml: '45.79', perServe: '114.475', rda: '38.16%' },
        { nutrient: 'Vitamin B12 (mcg)', per100ml: '0.13', perServe: '0.325', rda: '13.00%' },
      ],
      notes: ['* Approximate Value', '** Based on 2000 kCal Diet'],
    },
    additionalInfo: COMMON_ADDITIONAL_INFO,
  },
  aviva: {
    netQuantity: '250 ml',
    isVegetarian: true,
    ingredients: COMMON_INGREDIENTS,
    nutritionInfo: {
      productName: 'AVIVA',
      servingSize: '250 ml',
      servingsPerContainer: '1 serving per container (250 ml)',
      nutrients: [
        { nutrient: 'Energy (kCal)', per100ml: '9.63', perServe: '24.075', rda: '1.20%' },
        { nutrient: 'Total Fat (g)', per100ml: '0', perServe: '0', rda: '0' },
        { nutrient: 'Carbohydrates (g)', per100ml: '2.4', perServe: '6.000', rda: '11.10%' },
        { nutrient: 'Total Sugars (g)', per100ml: '1.79', perServe: '4.475', rda: '0' },
        { nutrient: 'Added Sugars (g)', per100ml: '0', perServe: '0', rda: '0' },
        { nutrient: 'Dietary Fiber (g)', per100ml: '1.52', perServe: '3.800', rda: '12.70%' },
        { nutrient: 'Protein (g)', per100ml: '0', perServe: '0', rda: '0' },
        { nutrient: 'Sodium (mg)', per100ml: '3.04', perServe: '7.600', rda: '0.40%' },
        { nutrient: 'Potassium (mg)', per100ml: '55.1', perServe: '137.750', rda: '3.90%' },
        { nutrient: 'Magnesium (mg)', per100ml: '48.92', perServe: '122.300', rda: '31.80%' },
        { nutrient: 'Caffeine (mg)', per100ml: '17', perServe: '42.500', rda: '14.20%' },
        { nutrient: 'Vitamin B6 (mg)', per100ml: '0.43', perServe: '1.075', rda: '44.80%' },
        { nutrient: 'Vitamin B9 (mcg)', per100ml: '33.25', perServe: '83.125', rda: '27.70%' },
        { nutrient: 'Vitamin B12 (mcg)', per100ml: '0.23', perServe: '0.575', rda: '23.00%' },
      ],
      notes: ['* Approximate Value', '** Based on 2000 kCal Diet'],
    },
    additionalInfo: COMMON_ADDITIONAL_INFO,
  },
  variety: {
    netQuantity: '250 ml (Each Can)',
    isVegetarian: true,
    ingredients: COMMON_INGREDIENTS,
    nutritionInfo: {
      productName: 'THE REBEL TRIO',
      servingSize: '250 ml (Each Can)',
      servingsPerContainer: '3 unique signature flavours per crate',
      nutrients: [
        { nutrient: 'Energy (kCal)', per100ml: '9.33 - 10.78', perServe: '23.3 - 26.9', rda: '1.17% - 1.35%' },
        { nutrient: 'Total Fat (g)', per100ml: '0', perServe: '0', rda: '0' },
        { nutrient: 'Carbohydrates (g)', per100ml: '2.33 - 2.69', perServe: '5.8 - 6.7', rda: '10.8% - 12.5%' },
        { nutrient: 'Total Sugars (g)', per100ml: '1.79 - 1.90', perServe: '4.5 - 4.75', rda: '0' },
        { nutrient: 'Added Sugars (g)', per100ml: '0', perServe: '0', rda: '0' },
        { nutrient: 'Dietary Fiber (g)', per100ml: '1.48 - 1.56', perServe: '3.7 - 3.9', rda: '12.3% - 13.0%' },
        { nutrient: 'Protein (g)', per100ml: '0', perServe: '0', rda: '0' },
        { nutrient: 'Sodium (mg)', per100ml: '2.97 - 3.11', perServe: '7.4 - 7.8', rda: '0.37% - 0.40%' },
        { nutrient: 'Potassium (mg)', per100ml: '55.10 - 60.86', perServe: '137.8 - 152.2', rda: '3.90% - 4.35%' },
        { nutrient: 'Magnesium (mg)', per100ml: '48.92 - 53.33', perServe: '122.3 - 133.3', rda: '31.8% - 34.6%' },
        { nutrient: 'Caffeine (mg)', per100ml: '17 - 19', perServe: '42.5 - 47.5', rda: '14.2% - 15.8%' },
        { nutrient: 'Vitamin B6 (mg)', per100ml: '0.33 - 0.43', perServe: '0.83 - 1.08', rda: '34.4% - 44.8%' },
        { nutrient: 'Vitamin B9 (mcg)', per100ml: '33.25 - 45.79', perServe: '83.1 - 114.5', rda: '27.7% - 38.2%' },
        { nutrient: 'Vitamin B12 (mcg)', per100ml: '0.13 - 0.23', perServe: '0.33 - 0.58', rda: '13.0% - 23.0%' },
      ],
      notes: ['* Approximate Value', '** Based on 2000 kCal Diet'],
    },
    additionalInfo: COMMON_ADDITIONAL_INFO,
  },
};

async function main() {
  console.log('--- Updating Product Details & Additional Info in Database ---');

  for (const [slug, data] of Object.entries(PRODUCTS_METADATA)) {
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (!existing) {
      console.warn(`Product slug '${slug}' not found in DB, skipping.`);
      continue;
    }

    await prisma.product.update({
      where: { slug },
      data: {
        netQuantity: data.netQuantity,
        isVegetarian: data.isVegetarian,
        ingredients: data.ingredients,
        nutritionInfo: data.nutritionInfo,
        additionalInfo: data.additionalInfo,
      },
    });

    console.log(`✓ Updated '${slug}' with ingredients, nutritionInfo & additionalInfo.`);
  }

  console.log('--- Product Update Complete! ---');
}

main()
  .catch((e) => {
    console.error('Error updating products:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
