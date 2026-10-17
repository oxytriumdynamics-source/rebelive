const fs = require('fs');

async function testCreateAdhoc() {
  const email = '857abhishekls@gmail.com';
  const password = 'lHKZtWx3e!LMaVU8aa#JdpSY2wm&0^52';
  const baseUrl = 'https://apiv2.shiprocket.in/v1/external';

  const authRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const { token } = await authRes.json();

  const payload = {
    order_id: `TEST-${Date.now().toString().slice(-6)}`,
    order_date: '2026-10-16 11:30',
    pickup_location: 'Primary',
    billing_customer_name: 'Abhishek',
    billing_last_name: 'Kumar',
    billing_address: 'Bhui silao, near SBI',
    billing_city: 'Nalanda',
    billing_pincode: '803117',
    billing_state: 'Bihar',
    billing_country: 'India',
    billing_email: 'abhishek@rebelive.co',
    billing_phone: '8409031739',
    shipping_is_billing: true,
    order_items: [
      {
        name: 'APEX Clean Bio-Energy Cans - 6 Pack',
        sku: 'RBL-APEX-6PK',
        units: 1,
        selling_price: 799
      }
    ],
    payment_method: 'Prepaid',
    sub_total: 799,
    length: 18,
    breadth: 15,
    height: 12,
    weight: 0.5
  };

  console.log('Sending test adhoc order...');
  const orderRes = await fetch(`${baseUrl}/orders/create/adhoc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const orderData = await orderRes.json();
  console.log('Order status:', orderRes.status);
  console.log('Order result:', JSON.stringify(orderData, null, 2));
}

testCreateAdhoc().catch(console.error);
