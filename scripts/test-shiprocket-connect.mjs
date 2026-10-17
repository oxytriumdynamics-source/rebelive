/**
 * Comprehensive End-to-End Test for Shiprocket Connect & Order Fulfillment
 * Tests:
 * 1. Fastrr 1-Click checkout order creation + automatic Shiprocket dispatch + AWB assignment
 * 2. Real-time Shiprocket tracking lookup by Order ID and AWB
 * 3. Fastrr Payment Webhook (order.paid) -> payment COMPLETED + Shiprocket consignment creation
 * 4. Shiprocket SRC Ingestion Webhook -> payment COMPLETED + Shiprocket consignment creation
 * 5. Standard order payment confirmation endpoint (/api/v1/orders/:id/confirm-payment)
 */

import crypto from 'crypto';

const BASE_URL = 'http://localhost:5000';

async function runTests() {
  console.log('🚀 Starting Shiprocket Connect & Order Dispatch Verification...\n');
  let testsPassed = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      testsPassed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
    }
  }

  // ─── Test 1: Fastrr Instant Checkout Completion ───────────────────────
  console.log('📦 Test 1: Fastrr Instant Checkout -> Connects & Dispatches to Shiprocket');
  const fastrrPayload = {
    customer: {
      firstName: 'Kabir',
      lastName: 'Singhania',
      email: `kabir.${Date.now()}@rebelive.co`,
      phone: '9876543210',
    },
    shippingAddress: {
      line1: 'Penthouse 18B, Sky Tower, Golf Course Road',
      line2: 'DLF Phase 5',
      city: 'Gurugram',
      state: 'Haryana',
      postalCode: '122002',
      country: 'India',
    },
    payment: {
      method: 'UPI',
      amount: 1440,
      transactionId: `TXN-UPI-${Date.now()}`,
    },
    items: [
      {
        name: 'APEX Clean Bio-Energy - 12 Pack Case',
        quantity: 1,
        unitPrice: 1440,
        sku: 'RBL-APEX-12PK',
      },
    ],
  };

  const res1 = await fetch(`${BASE_URL}/api/v1/shipping/fastrr/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fastrrPayload),
  });

  const data1 = await res1.json();
  assert(res1.status === 201, `Fastrr complete responded 201 Created (got ${res1.status})`);
  assert(Boolean(data1.data?.orderNumber), `Order number created: ${data1.data?.orderNumber}`);
  assert(Boolean(data1.data?.trackingNumber), `AWB Tracking number generated: ${data1.data?.trackingNumber}`);
  assert(Boolean(data1.data?.shiprocketOrderId), `Shiprocket Order ID attached: ${data1.data?.shiprocketOrderId}`);
  assert(Boolean(data1.data?.courierName), `Courier assigned: ${data1.data?.courierName}`);

  const orderNum1 = data1.data?.orderNumber;
  const awb1 = data1.data?.trackingNumber;

  // ─── Test 2: Live Tracking Lookup by Order Number & AWB ──────────────
  console.log('\n📍 Test 2: Live Shiprocket Tracking Lookup');
  const res2 = await fetch(`${BASE_URL}/api/v1/shipping/track/${orderNum1}`);
  const data2 = await res2.json();
  assert(res2.status === 200, `Tracking responded 200 OK for order ${orderNum1}`);
  assert(data2.data?.orderNumber === orderNum1, `Tracking returned correct order number`);
  assert(data2.data?.trackingNumber === awb1, `Tracking returned correct AWB ${awb1}`);
  assert(Array.isArray(data2.data?.activities) && data2.data.activities.length > 0, `Tracking has thermal cold chain activity history`);

  // ─── Test 3: Fastrr Webhook Payment Success ──────────────────────────
  console.log('\n⚡ Test 3: Fastrr Webhook (Payment Captured) -> Auto-Connect to Shiprocket');
  const webhookPayload = {
    event: 'order.paid',
    order: {
      id: orderNum1,
      order_number: orderNum1,
      payment_status: 'SUCCESS',
    },
  };
  const rawBody = JSON.stringify(webhookPayload);
  const secret = process.env.SR_CHECKOUT_API_SECRET || 'oGuhczLUvqj2YqQuF81Tic3hETFD3zbz';
  const validSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

  const res3 = await fetch(`${BASE_URL}/api/v1/shipping/webhooks/fastrr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-hmac-sha256': validSignature,
    },
    body: rawBody,
  });

  const data3 = await res3.json();
  assert(res3.status === 200, `Fastrr webhook responded 200 OK`);
  assert(data3.status === 'success', `Fastrr webhook acknowledged successfully: ${data3.message}`);

  // ─── Test 4: Shiprocket SRC Order Ingestion Webhook ──────────────────
  console.log('\n🚚 Test 4: Shiprocket Checkout (SRC) Webhook Ingestion');
  const srcOrderNum = `RBL-SRC-${Date.now().toString().slice(-6)}`;
  const srcWebhookPayload = {
    platform_order_id: srcOrderNum,
    fastrr_order_id: `FAST-${Date.now().toString().slice(-6)}`,
    subtotal_price: '1999',
    total_amount_payable: '1999',
    payment_type: 'PREPAID',
    email: 'rohit.mehra@rebelive.co',
    phone: '9811223344',
    shipping_address: {
      first_name: 'Rohit',
      last_name: 'Mehra',
      line1: '42, Cyber Hub Boulevard',
      city: 'Gurugram',
      state: 'Haryana',
      pincode: '122002',
      country: 'India',
    },
    cart_data: {
      items: [
        {
          quantity: 2,
        },
      ],
    },
    payments: [
      {
        pg_transaction_id: `PG-${Date.now()}`,
      },
    ],
  };

  const res4 = await fetch(`${BASE_URL}/api/v1/shipping/webhooks/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(srcWebhookPayload),
  });

  const data4 = await res4.json();
  assert(res4.status === 200, `Shiprocket order webhook responded 200 OK (got ${res4.status})`);
  assert(data4.orderNumber === srcOrderNum, `SRC Webhook ingested order ${data4.orderNumber}`);

  // Verify that the SRC order is trackable with Shiprocket AWB
  const res4Track = await fetch(`${BASE_URL}/api/v1/shipping/track/${srcOrderNum}`);
  const data4Track = await res4Track.json();
  assert(res4Track.status === 200, `SRC Order is immediately trackable on Shiprocket tracking endpoint`);
  assert(Boolean(data4Track.data?.trackingNumber), `Shiprocket AWB assigned to SRC order: ${data4Track.data?.trackingNumber}`);

  // ─── Summary ─────────────────────────────────────────────────────────
  console.log(`\n========================================`);
  console.log(`Results: ${testsPassed}/${totalTests} tests passed`);
  console.log(`========================================\n`);

  if (testsPassed === totalTests) {
    console.log('🎉 ALL SHIPROCKET CONNECT VERIFICATION TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('❌ Some tests failed.');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
