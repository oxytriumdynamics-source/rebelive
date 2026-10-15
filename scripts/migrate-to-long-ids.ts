import { MongoClient, Long } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

async function migrate() {
  const client = new MongoClient(url);
  await client.connect();
  console.log('Connected to MongoDB Atlas');

  const db = client.db();

  const productsColl = db.collection('products');
  const variantsColl = db.collection('product_variants');
  const orderItemsColl = db.collection('order_items');
  const inventoryLogsColl = db.collection('inventory_logs');
  const tagsColl = db.collection('tags');
  const personalityTypesColl = db.collection('personality_types');

  // 1. Fetch current products
  const products = await productsColl.find({}).toArray();
  console.log(`Found ${products.length} products to migrate`);

  const productIdMap = new Map<string, Long>();

  const predefinedIds: Record<string, number> = {
    apex: 1,
    aviva: 2,
    capella: 3,
    variety: 4,
  };

  let fallbackId = 10;

  for (const prod of products) {
    // Check if already Long
    if (prod._id instanceof Long || typeof prod._id === 'bigint') {
      console.log(`Product ${prod.slug || prod.name} already has Long _id: ${prod._id}`);
      productIdMap.set(String(prod._id), prod._id as Long);
      continue;
    }

    const oldIdStr = String(prod._id);
    const slug = (prod.slug || '').toLowerCase();
    const newNum = predefinedIds[slug] || fallbackId++;
    const newLongId = Long.fromNumber(newNum);

    productIdMap.set(oldIdStr, newLongId);

    // Reinsert document with new _id
    const newDoc = { ...prod, _id: newLongId };
    await productsColl.deleteOne({ _id: prod._id });
    await productsColl.insertOne(newDoc);
    console.log(`Migrated Product ${slug || prod.name}: old ObjectId(${oldIdStr}) -> Long(${newNum})`);
  }

  // 2. Fetch current variants
  const variants = await variantsColl.find({}).toArray();
  console.log(`Found ${variants.length} variants to migrate`);

  const variantIdMap = new Map<string, Long>();
  let variantCounter = 100;

  for (const v of variants) {
    if (v._id instanceof Long || typeof v._id === 'bigint') {
      console.log(`Variant ${v.sku} already has Long _id: ${v._id}`);
      variantIdMap.set(String(v._id), v._id as Long);
      continue;
    }

    const oldVarIdStr = String(v._id);
    const oldProdIdStr = String(v.product_id);
    const newProdLongId = productIdMap.get(oldProdIdStr) || Long.fromNumber(1);

    variantCounter++;
    const newVarLongId = Long.fromNumber(variantCounter);
    variantIdMap.set(oldVarIdStr, newVarLongId);

    const newVarDoc = {
      ...v,
      _id: newVarLongId,
      product_id: newProdLongId,
    };

    await variantsColl.deleteOne({ _id: v._id });
    await variantsColl.insertOne(newVarDoc);
    console.log(`Migrated Variant ${v.sku}: old ObjectId(${oldVarIdStr}) -> Long(${variantCounter}), product_id: Long(${newProdLongId})`);
  }

  // 3. Update order items
  const orderItems = await orderItemsColl.find({}).toArray();
  for (const oi of orderItems) {
    const oldPId = String(oi.product_id);
    const oldVId = String(oi.variant_id);
    const newPId = productIdMap.get(oldPId);
    const newVId = variantIdMap.get(oldVId);

    const updateFields: any = {};
    if (newPId) updateFields.product_id = newPId;
    if (newVId) updateFields.variant_id = newVId;

    if (Object.keys(updateFields).length > 0) {
      await orderItemsColl.updateOne({ _id: oi._id }, { $set: updateFields });
      console.log(`Updated order_item ${oi._id} with Long product_id and variant_id`);
    }
  }

  // 4. Update inventory logs
  const logs = await inventoryLogsColl.find({}).toArray();
  for (const log of logs) {
    const oldPId = String(log.product_id);
    const oldVId = String(log.variant_id);
    const newPId = productIdMap.get(oldPId);
    const newVId = variantIdMap.get(oldVId);

    const updateFields: any = {};
    if (newPId) updateFields.product_id = newPId;
    if (newVId) updateFields.variant_id = newVId;

    if (Object.keys(updateFields).length > 0) {
      await inventoryLogsColl.updateOne({ _id: log._id }, { $set: updateFields });
      console.log(`Updated inventory_log ${log._id} with Long product_id and variant_id`);
    }
  }

  // 5. Update tags if any
  const tags = await tagsColl.find({}).toArray();
  for (const tag of tags) {
    if (Array.isArray(tag.product_ids) && tag.product_ids.length > 0) {
      const newPIds = tag.product_ids.map((id: any) => productIdMap.get(String(id))).filter(Boolean);
      await tagsColl.updateOne({ _id: tag._id }, { $set: { product_ids: newPIds } });
    }
  }

  // 6. Update personality types if any
  const pts = await personalityTypesColl.find({}).toArray();
  for (const pt of pts) {
    if (Array.isArray(pt.ideal_product_ids) && pt.ideal_product_ids.length > 0) {
      const newPIds = pt.ideal_product_ids.map((id: any) => productIdMap.get(String(id))).filter(Boolean);
      await personalityTypesColl.updateOne({ _id: pt._id }, { $set: { ideal_product_ids: newPIds } });
    }
  }

  console.log(' Migration to Long data-type completed successfully!');
  await client.close();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
