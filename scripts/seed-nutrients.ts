import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APEX_NUTRIENTS = {
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
  items: [
    { key: 'Energy', amount: '9.33', unit: 'kCal', dv: '1.17%' },
    { key: 'Total Fat', amount: '0', unit: 'g', dv: '0%' },
    { key: 'Carbohydrates', amount: '2.33', unit: 'g', dv: '10.79%' },
    { key: 'Total Sugars', amount: '1.9', unit: 'g', dv: '0%' },
    { key: 'Added Sugars', amount: '0', unit: 'g', dv: '0%' },
    { key: 'Dietary Fiber', amount: '1.48', unit: 'g', dv: '12.33%' },
    { key: 'Protein', amount: '0', unit: 'g', dv: '0%' },
    { key: 'Sodium', amount: '2.97', unit: 'mg', dv: '0.37%' },
    { key: 'Potassium', amount: '55.98', unit: 'mg', dv: '4.00%' },
    { key: 'Magnesium', amount: '49.77', unit: 'mg', dv: '32.32%' },
    { key: 'Caffeine', amount: '18', unit: 'mg', dv: '15.00%' },
    { key: 'Vitamin B6', amount: '0.39', unit: 'mg', dv: '40.63%' },
    { key: 'Vitamin B9', amount: '36.39', unit: 'mcg', dv: '30.33%' },
    { key: 'Vitamin B12', amount: '0.21', unit: 'mcg', dv: '21.00%' },
  ],
  notes: ['* Approximate Value', '** Based on 2000 kCal Diet'],
};

const AVIVA_NUTRIENTS = {
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
  items: [
    { key: 'Energy', amount: '9.63', unit: 'kCal', dv: '1.20%' },
    { key: 'Total Fat', amount: '0', unit: 'g', dv: '0%' },
    { key: 'Carbohydrates', amount: '2.4', unit: 'g', dv: '11.10%' },
    { key: 'Total Sugars', amount: '1.79', unit: 'g', dv: '0%' },
    { key: 'Added Sugars', amount: '0', unit: 'g', dv: '0%' },
    { key: 'Dietary Fiber', amount: '1.52', unit: 'g', dv: '12.70%' },
    { key: 'Protein', amount: '0', unit: 'g', dv: '0%' },
    { key: 'Sodium', amount: '3.04', unit: 'mg', dv: '0.40%' },
    { key: 'Potassium', amount: '55.1', unit: 'mg', dv: '3.90%' },
    { key: 'Magnesium', amount: '48.92', unit: 'mg', dv: '31.80%' },
    { key: 'Caffeine', amount: '17', unit: 'mg', dv: '14.20%' },
    { key: 'Vitamin B6', amount: '0.43', unit: 'mg', dv: '44.80%' },
    { key: 'Vitamin B9', amount: '33.25', unit: 'mcg', dv: '27.70%' },
    { key: 'Vitamin B12', amount: '0.23', unit: 'mcg', dv: '23.00%' },
  ],
  notes: ['* Approximate Value', '** Based on 2000 kCal Diet'],
};

const CAPELLA_NUTRIENTS = {
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
  items: [
    { key: 'Energy', amount: '10.78', unit: 'kCal', dv: '1.35%' },
    { key: 'Total Fat', amount: '0', unit: 'g', dv: '0%' },
    { key: 'Carbohydrates', amount: '2.69', unit: 'g', dv: '12.45%' },
    { key: 'Total Sugars', amount: '1.8', unit: 'g', dv: '0%' },
    { key: 'Added Sugars', amount: '0', unit: 'g', dv: '0%' },
    { key: 'Dietary Fiber', amount: '1.56', unit: 'g', dv: '13.00%' },
    { key: 'Protein', amount: '0', unit: 'g', dv: '0%' },
    { key: 'Sodium', amount: '3.11', unit: 'mg', dv: '0.39%' },
    { key: 'Potassium', amount: '60.86', unit: 'mg', dv: '4.35%' },
    { key: 'Magnesium', amount: '53.33', unit: 'mg', dv: '34.63%' },
    { key: 'Caffeine', amount: '19', unit: 'mg', dv: '15.83%' },
    { key: 'Vitamin B6', amount: '0.33', unit: 'mg', dv: '34.38%' },
    { key: 'Vitamin B9', amount: '45.79', unit: 'mcg', dv: '38.16%' },
    { key: 'Vitamin B12', amount: '0.13', unit: 'mcg', dv: '13.00%' },
  ],
  notes: ['* Approximate Value', '** Based on 2000 kCal Diet'],
};

const VARIETY_NUTRIENTS = {
  productName: 'THE REBEL TRIO',
  servingSize: '250 ml (Each Can)',
  servingsPerContainer: '3 unique signature flavours per crate (Apex, Aviva, Capella)',
  trioNutrients: {
    apex: APEX_NUTRIENTS,
    aviva: AVIVA_NUTRIENTS,
    capella: CAPELLA_NUTRIENTS,
  },
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
  items: [
    { key: 'Energy', amount: '9.33 - 10.78', unit: 'kCal', dv: '1.17% - 1.35%' },
    { key: 'Total Fat', amount: '0', unit: 'g', dv: '0%' },
    { key: 'Carbohydrates', amount: '2.33 - 2.69', unit: 'g', dv: '10.8% - 12.5%' },
    { key: 'Total Sugars', amount: '1.79 - 1.90', unit: 'g', dv: '0%' },
    { key: 'Added Sugars', amount: '0', unit: 'g', dv: '0%' },
    { key: 'Dietary Fiber', amount: '1.48 - 1.56', unit: 'g', dv: '12.3% - 13.0%' },
    { key: 'Protein', amount: '0', unit: 'g', dv: '0%' },
    { key: 'Sodium', amount: '2.97 - 3.11', unit: 'mg', dv: '0.37% - 0.40%' },
    { key: 'Potassium', amount: '55.10 - 60.86', unit: 'mg', dv: '3.90% - 4.35%' },
    { key: 'Magnesium', amount: '48.92 - 53.33', unit: 'mg', dv: '31.8% - 34.6%' },
    { key: 'Caffeine', amount: '17 - 19', unit: 'mg', dv: '14.2% - 15.8%' },
    { key: 'Vitamin B6', amount: '0.33 - 0.43', unit: 'mg', dv: '34.4% - 44.8%' },
    { key: 'Vitamin B9', amount: '33.25 - 45.79', unit: 'mcg', dv: '27.7% - 38.2%' },
    { key: 'Vitamin B12', amount: '0.13 - 0.23', unit: 'mcg', dv: '13.0% - 23.0%' },
  ],
  notes: ['* Approximate Value', '** Based on 2000 kCal Diet'],
};

async function main() {
  console.log('Updating APEX nutrients...');
  await prisma.product.update({
    where: { slug: 'apex' },
    data: {
      nutritionInfo: APEX_NUTRIENTS,
      nutrition: APEX_NUTRIENTS,
    },
  });

  console.log('Updating AVIVA nutrients...');
  await prisma.product.update({
    where: { slug: 'aviva' },
    data: {
      nutritionInfo: AVIVA_NUTRIENTS,
      nutrition: AVIVA_NUTRIENTS,
    },
  });

  console.log('Updating CAPELLA nutrients...');
  await prisma.product.update({
    where: { slug: 'capella' },
    data: {
      nutritionInfo: CAPELLA_NUTRIENTS,
      nutrition: CAPELLA_NUTRIENTS,
    },
  });

  console.log('Updating VARIETY (THE REBEL TRIO) nutrients...');
  await prisma.product.update({
    where: { slug: 'variety' },
    data: {
      nutritionInfo: VARIETY_NUTRIENTS,
      nutrition: VARIETY_NUTRIENTS,
    },
  });

  console.log('✓ Successfully updated all products with exact database nutrition data!');
}

main()
  .catch((e) => {
    console.error('Error updating products:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
