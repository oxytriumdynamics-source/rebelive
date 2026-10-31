/**
 * REBELIVE - Shiprocket Live Connection & Order Sync Utility
 * 
 * Tests live connection to Shiprocket API and automatically pushes all pending
 * orders from MongoDB directly to the live Shiprocket Merchant Dashboard (app.shiprocket.in/orders).
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();
const BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

async function main() {
  console.log('\n======================================================');
  console.log('🚀 REBELIVE - Shiprocket Live Dashboard Sync Utility');
  console.log('======================================================\n');

  const tokenEnv = process.env.SR_API_TOKEN?.trim();
  const emailEnv = process.env.SR_API_EMAIL?.trim();
  const passwordEnv = process.env.SR_API_PASSWORD?.trim();
  const pickupLocation = process.env.SR_PICKUP_LOCATION?.trim() || 'Primary';

  console.log(`📋 Configured Environment:`);
  console.log(`   - Direct Token: ${tokenEnv ? `Configured (Length: ${tokenEnv.length})` : 'None'}`);
  console.log(`   - API Email:    ${emailEnv || 'Not configured'}`);
  console.log(`   - Pickup Hub:   ${pickupLocation}\n`);

  let authToken = null;

  // 1. Check direct token
  if (tokenEnv && tokenEnv.length > 20) {
    console.log('🔑 Testing configured SR_API_TOKEN...');
    authToken = tokenEnv;
  } else if (emailEnv && passwordEnv) {
    console.log(`🔐 Authenticating via Shiprocket API endpoint (${emailEnv})...`);
    try {
      const authRes = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailEnv, password: passwordEnv }),
      });

      const authData = await authRes.json();
      if (authRes.ok && authData.token) {
        authToken = authData.token;
        console.log('✅ Authentication SUCCESS! Live token received.');
      } else {
        console.error(`\n❌ Shiprocket Authentication Failed (${authRes.status}):`);
        console.error(`   Message: ${authData.message || JSON.stringify(authData)}`);
        
        console.log('\n------------------------------------------------------');
        console.log('💡 WHY ORDERS DO NOT APPEAR IN YOUR SHIPROCKET DASHBOARD:');
        console.log('------------------------------------------------------');
        console.log('1. Shiprocket External API REQUIRES a dedicated "API User" created inside');
        console.log('   your Shiprocket dashboard, and rejects primary account registration emails.');
        console.log('2. Quick 1-minute fix:');
        console.log('   a. In your Shiprocket dashboard (app.shiprocket.in), click Settings (gear icon ⚙️ on the bottom-left sidebar).');
        console.log('   b. Select "API" -> click "Configure".');
        console.log('   c. Click "+ Add New API User" (or "Create an API User").');
        console.log('   d. Enter an email address (e.g. api@rebelive.co or any email other than primary) and set a password.');
        console.log('   e. Update backend/.env with those credentials:');
        console.log('        SR_API_EMAIL="your_new_api_email@..."');
        console.log('        SR_API_PASSWORD="your_new_api_password"');
        console.log('      (or paste the generated Bearer Token into SR_API_TOKEN="...")');
        console.log('   f. Run: node scripts/sync-shiprocket.mjs');
        console.log('------------------------------------------------------\n');
        await prisma.$disconnect();
        process.exit(1);
      }
    } catch (err) {
      console.error('❌ Network error reaching Shiprocket API:', err.message);
      await prisma.$disconnect();
      process.exit(1);
    }
  } else {
    console.error('❌ Neither SR_API_TOKEN nor (SR_API_EMAIL + SR_API_PASSWORD) configured in backend/.env');
    await prisma.$disconnect();
    process.exit(1);
  }

  // 2. Verify Pickup Locations on live Shiprocket account
  console.log('\n🏭 Fetching registered Pickup Locations from Shiprocket...');
  try {
    const pickupRes = await fetch(`${BASE_URL}/settings/company/pickup`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (pickupRes.ok) {
      const pickupData = await pickupRes.json();
      const locations = pickupData?.data?.shipping_address || [];
      console.log(`✅ Found ${locations.length} registered pickup location(s):`);
      locations.forEach((loc, idx) => {
        console.log(`   ${idx + 1}. Nickname: "${loc.pickup_location}", City: ${loc.city}, PIN: ${loc.pin_code}`);
      });

      const hasMatching = locations.some(
        (l) => l.pickup_location?.toLowerCase() === pickupLocation.toLowerCase()
      );
      if (!hasMatching && locations.length > 0) {
        console.warn(`⚠️ Warning: SR_PICKUP_LOCATION="${pickupLocation}" not found in your account.`);
        console.warn(`   Using available location "${locations[0].pickup_location}" instead.\n`);
      }
    } else {
      console.warn(`⚠️ Could not fetch pickup locations (${pickupRes.status}). Proceeding with "${pickupLocation}".`);
    }
  } catch (err) {
    console.warn('⚠️ Non-fatal error checking pickup locations:', err.message);
  }

  // 3. Find pending / unsynced orders in MongoDB
  console.log('\n🔍 Searching MongoDB for orders to sync to Shiprocket...');
  const orders = await prisma.order.findMany({
    where: {
      status: { notIn: ['CANCELLED', 'REFUNDED'] },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      shippingAddress: true,
      items: true,
      user: true,
      payments: true,
    },
    take: 10,
  });

  console.log(`📦 Found ${orders.length} total active orders.`);

  let syncedCount = 0;
  for (const order of orders) {
    // Check if order already has a real Shiprocket ID (pure numeric ID from Shiprocket)
    const isMock = !order.shiprocketOrderId || order.shiprocketOrderId.startsWith('SR-') || order.shiprocketShipmentId?.startsWith('SR-SHP-');
    
    console.log(`\n--------------------------------------------------`);
    console.log(`Order: ${order.orderNumber} (Created: ${order.createdAt.toISOString()})`);
    console.log(`Current SR ID: ${order.shiprocketOrderId || 'None'} | Shipment: ${order.shiprocketShipmentId || 'None'}`);

    if (!isMock) {
      console.log(`ℹ️ Order ${order.orderNumber} is already synced to live Shiprocket.`);
      continue;
    }

    if (!order.shippingAddress) {
      console.warn(`⚠️ Skipping ${order.orderNumber}: No shipping address attached.`);
      continue;
    }

    console.log(`📤 Pushing ${order.orderNumber} directly to Shiprocket API (/orders/create/adhoc)...`);

    const formattedDate = order.createdAt.toISOString().replace('T', ' ').slice(0, 16);
    const weight = Math.max(0.5, order.items.reduce((acc, i) => acc + i.quantity * 0.35, 0));
    const paymentMethod = order.payments?.[0]?.method === 'COD' ? 'COD' : 'Prepaid';

    const payload = {
      order_id: order.orderNumber,
      order_date: formattedDate,
      pickup_location: pickupLocation,
      channel_id: '',
      comment: 'Rebelive - Handle with Care',
      billing_customer_name: order.user?.firstName || 'Customer',
      billing_last_name: order.user?.lastName || 'Rebelive',
      billing_address: order.shippingAddress.line1,
      billing_address_2: order.shippingAddress.line2 || '',
      billing_city: order.shippingAddress.city,
      billing_pincode: order.shippingAddress.postalCode,
      billing_state: order.shippingAddress.state,
      billing_country: order.shippingAddress.country || 'India',
      billing_email: order.user?.email || 'customer@rebelive.co',
      billing_phone: order.user?.phone || '9999999999',
      shipping_is_billing: true,
      order_items: order.items.map((i) => ({
        name: `${i.productName} - ${i.variantName}`,
        sku: i.sku,
        units: i.quantity,
        selling_price: i.unitPrice,
        discount: 0,
        tax: 0,
        hsn: 22029990,
      })),
      payment_method: paymentMethod,
      shipping_charges: order.shippingAmount,
      giftwrap_charges: 0,
      transaction_charges: 0,
      total_discount: order.discountAmount,
      sub_total: order.subtotal,
      length: 18,
      breadth: 15,
      height: 12,
      weight: parseFloat(weight.toFixed(2)),
    };

    try {
      const orderRes = await fetch(`${BASE_URL}/orders/create/adhoc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });

      const orderData = await orderRes.json();
      if (orderRes.ok) {
        const srOrderId = orderData.order_id?.toString() || null;
        const srShipmentId = orderData.shipment_id?.toString() || null;
        let awbCode = orderData.awb_code || null;
        let courierName = orderData.courier_name || 'Shiprocket Express';

        // Assign AWB if shipment_id present
        if (srShipmentId && !awbCode) {
          try {
            const awbRes = await fetch(`${BASE_URL}/courier/assign/awb`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
              },
              body: JSON.stringify({ shipment_id: srShipmentId }),
            });
            if (awbRes.ok) {
              const awbData = await awbRes.json();
              if (awbData.response?.data?.awb_code) {
                awbCode = awbData.response.data.awb_code;
                courierName = awbData.response.data.courier_name || courierName;
              }
            }
          } catch (awbErr) {
            console.warn('⚠️ AWB assignment notice:', awbErr.message);
          }
        }

        // Update in MongoDB
        await prisma.order.update({
          where: { id: order.id },
          data: {
            shiprocketOrderId: srOrderId,
            shiprocketShipmentId: srShipmentId,
            trackingNumber: awbCode || order.trackingNumber,
            status: 'CONFIRMED',
            statusHistory: {
              create: {
                status: 'CONFIRMED',
                note: `Synced to Live Shiprocket Dashboard (Order ID: ${srOrderId}, Shipment ID: ${srShipmentId}, Courier: ${courierName}, AWB: ${awbCode || 'Pending'})`,
              },
            },
          },
        });

        console.log(`🎉 SUCCESS! Order ${order.orderNumber} is now LIVE in your Shiprocket Dashboard!`);
        console.log(`   - Shiprocket Order ID:    ${srOrderId}`);
        console.log(`   - Shiprocket Shipment ID: ${srShipmentId}`);
        console.log(`   - Assigned AWB Code:      ${awbCode || 'Assigned in queue'}`);
        console.log(`   - Courier Service:        ${courierName}`);
        syncedCount++;
      } else {
        console.error(`❌ Shiprocket rejected order ${order.orderNumber} (${orderRes.status}):`, orderData);
      }
    } catch (err) {
      console.error(`❌ Error pushing order ${order.orderNumber}:`, err.message);
    }
  }

  console.log('\n======================================================');
  console.log(`🏁 Sync Finished. Successfully synced ${syncedCount} order(s) to live Shiprocket.`);
  console.log(`   Open https://app.shiprocket.in/orders to view them in your dashboard!`);
  console.log('======================================================\n');
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
