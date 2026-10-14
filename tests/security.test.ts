import http from 'http';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { prisma } from '../src/config/database';
import { env } from '../src/config/env';
import { generateAccessToken } from '../src/modules/auth/auth.service';

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function recordTest(category: string, name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ category, name, passed: true });
    console.log(`  ✓ [${category}] ${name}`);
  } catch (err: any) {
    results.push({ category, name, passed: false, error: err?.message || String(err) });
    console.error(`  ✗ [${category}] ${name}: ${err?.message || err}`);
  }
}

async function run() {
  console.log('\n🔒 STARTING AUTOMATED SECURITY TEST SUITE...\n');

  // Spin up ephemeral test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let testUserA: any = null;
  let testUserB: any = null;
  let testAdmin: any = null;

  try {
    // 0. Set up temporary test users for cross-user IDOR and privilege escalation tests
    testUserA = await prisma.user.create({
      data: {
        email: `sec_test_a_${Date.now()}@rebelive.test`,
        firstName: 'TestUserA',
        lastName: 'Security',
        role: 'CUSTOMER',
        authProvider: 'local',
        passwordHash: 'dummy_hash',
        emailVerified: true,
      },
    });

    testUserB = await prisma.user.create({
      data: {
        email: `sec_test_b_${Date.now()}@rebelive.test`,
        firstName: 'TestUserB',
        lastName: 'Security',
        role: 'CUSTOMER',
        authProvider: 'local',
        passwordHash: 'dummy_hash',
        emailVerified: true,
      },
    });

    testAdmin = await prisma.user.create({
      data: {
        email: `sec_test_admin_${Date.now()}@rebelive.test`,
        firstName: 'TestAdmin',
        lastName: 'Security',
        role: 'ADMIN',
        authProvider: 'local',
        passwordHash: 'dummy_hash',
        emailVerified: true,
      },
    });

    const tokenA = generateAccessToken(testUserA);
    const tokenB = generateAccessToken(testUserB);
    const tokenAdmin = generateAccessToken(testAdmin);

    // ─── 1. UNAUTHORIZED ACCESS TESTS ─────────────────────────────────────
    console.log('--- 1. Testing Unauthorized Access (Missing Credentials) ---');

    await recordTest('Unauthorized Access', 'GET /api/v1/users/profile without token returns 401', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/profile`);
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.status, 'error');
    });

    await recordTest('Unauthorized Access', 'GET /api/v1/orders without token returns 401', async () => {
      const res = await fetch(`${baseUrl}/api/v1/orders`);
      assert.strictEqual(res.status, 401);
    });

    await recordTest('Unauthorized Access', 'GET /api/v1/admin/dashboard without token returns 401', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/dashboard`);
      assert.strictEqual(res.status, 401);
    });

    await recordTest('Unauthorized Access', 'POST /api/v1/shipping/webhooks/fastrr without signature returns 401', async () => {
      const res = await fetch(`${baseUrl}/api/v1/shipping/webhooks/fastrr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'order.paid', data: { order_id: '123' } }),
      });
      // If SR_CHECKOUT_API_SECRET is configured, must return 401
      if (env.SR_CHECKOUT_API_SECRET) {
        assert.strictEqual(res.status, 401);
      }
    });

    // ─── 2. EXPIRED & FORGED TOKEN TESTS ─────────────────────────────────
    console.log('\n--- 2. Testing Expired & Forged Tokens ---');

    await recordTest('Token Validation', 'GET /api/v1/users/profile with forged signature returns 401', async () => {
      const forgedToken = jwt.sign(
        { sub: testUserA.id, email: testUserA.email, role: 'CUSTOMER', jti: 'fake' },
        'wrong-secret-key-attacker',
      );
      const res = await fetch(`${baseUrl}/api/v1/users/profile`, {
        headers: { Authorization: `Bearer ${forgedToken}` },
      });
      assert.strictEqual(res.status, 401);
    });

    await recordTest('Token Validation', 'GET /api/v1/users/profile with expired token returns 401', async () => {
      const expiredToken = jwt.sign(
        { sub: testUserA.id, email: testUserA.email, role: 'CUSTOMER', jti: 'exp' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '-10s' },
      );
      const res = await fetch(`${baseUrl}/api/v1/users/profile`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      assert.strictEqual(res.status, 401);
    });

    // ─── 3. PRIVILEGE ESCALATION TESTS ───────────────────────────────────
    console.log('\n--- 3. Testing Privilege Escalation & Admin Protections ---');

    await recordTest('Privilege Escalation', 'CUSTOMER accessing GET /api/v1/admin/dashboard returns 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/dashboard`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.status, 'error');
    });

    await recordTest('Privilege Escalation', 'CUSTOMER accessing GET /api/v1/admin/users returns 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/users`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(res.status, 403);
    });

    await recordTest('Privilege Escalation', 'ADMIN (non-superadmin) accessing PATCH /api/v1/admin/change-password returns 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/change-password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`,
        },
        body: JSON.stringify({ currentPassword: 'test', newPassword: 'newPassword123' }),
      });
      assert.strictEqual(res.status, 403);
    });

    await recordTest('Privilege Escalation', 'ADMIN (non-superadmin) accessing GET /api/v1/admin/audit-logs returns 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/audit-logs`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` },
      });
      assert.strictEqual(res.status, 403);
    });

    // ─── 4. REQUEST VALIDATION TESTS ─────────────────────────────────────
    console.log('\n--- 4. Testing Input Validation & Schema Enforcement ---');

    await recordTest('Input Validation', 'POST /api/v1/auth/register with password < 8 chars returns 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'shortpass@example.com',
          password: 'Short1', // < 8 characters
          firstName: 'Short',
          lastName: 'Pass',
          phone: '+919876543210',
        }),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.status, 'error');
    });

    await recordTest('Input Validation', 'POST /api/v1/auth/forgot-password-verify with 4-digit OTP returns 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/forgot-password-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@rebelive.co',
          otp: '1234', // should be 6 digits
          newPassword: 'Password123',
        }),
      });
      assert.strictEqual(res.status, 400);
    });

    await recordTest('Input Validation', 'POST /api/v1/cart/items without session or user context returns 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/cart/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: 'some-variant', quantity: 1 }),
      });
      assert.strictEqual(res.status, 400);
    });

    // ─── 5. CROSS-USER IDOR TESTS ────────────────────────────────────────
    console.log('\n--- 5. Testing Cross-User Access / IDOR Protections ---');

    // Create an address for User B
    const addressB = await prisma.address.create({
      data: {
        userId: testUserB.id,
        line1: '123 Secret Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        country: 'IN',
      },
    });

    await recordTest('IDOR Protection', 'User A cannot update User B address (returns 404/NotFoundError)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/addresses/${addressB.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ line1: 'Tampered Address' }),
      });
      assert.strictEqual(res.status, 404);
    });

    await recordTest('IDOR Protection', 'User A cannot delete User B address (returns 404/NotFoundError)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/users/addresses/${addressB.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.strictEqual(res.status, 404);
    });

    await recordTest('IDOR Protection', 'User A cannot attach User B address to order (returns 400)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({
          shippingAddressId: addressB.id,
          paymentMethod: 'UPI',
        }),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.message.includes('shipping address') || json.message.includes('cart'));
    });

    // Create a cart for User B with an item
    const product = await prisma.product.findFirst({
      include: { variants: true },
    });

    if (product && product.variants.length > 0) {
      const cartB = await prisma.cart.create({
        data: { userId: testUserB.id },
      });
      const itemB = await prisma.cartItem.create({
        data: {
          cartId: cartB.id,
          productId: product.id,
          variantId: product.variants[0].id,
          quantity: 2,
        },
      });

      await recordTest('IDOR Protection', 'User A cannot modify User B cart item (returns 404)', async () => {
        const res = await fetch(`${baseUrl}/api/v1/cart/items/${itemB.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenA}`,
          },
          body: JSON.stringify({ quantity: 99 }),
        });
        assert.strictEqual(res.status, 404);
      });

      await recordTest('IDOR Protection', 'User A cannot delete User B cart item (returns 404)', async () => {
        const res = await fetch(`${baseUrl}/api/v1/cart/items/${itemB.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tokenA}` },
        });
        assert.strictEqual(res.status, 404);
      });

      // Clean up cartB and itemB
      await prisma.cartItem.deleteMany({ where: { cartId: cartB.id } });
      await prisma.cart.delete({ where: { id: cartB.id } });
    }

    // Clean up addressB
    await prisma.address.delete({ where: { id: addressB.id } });

    // ─── 6. PAYMENT WEBHOOK TAMPERING TESTS ─────────────────────────────
    console.log('\n--- 6. Testing Payment & Webhook Signature Spoofing ---');

    await recordTest('Webhook Verification', 'Fastrr webhook with invalid signature returns 401', async () => {
      if (env.SR_CHECKOUT_API_SECRET) {
        const res = await fetch(`${baseUrl}/api/v1/shipping/webhooks/fastrr`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-hmac-sha256': 'invalidsignature000000000000000000000000000000000000000000000000',
          },
          body: JSON.stringify({ event: 'order.paid', data: { order_id: 'FAKE123' } }),
        });
        assert.strictEqual(res.status, 401);
      }
    });

    await recordTest('Webhook Verification', 'Shiprocket webhook with invalid token returns 401', async () => {
      if (env.SR_WEBHOOK_TOKEN && env.SR_WEBHOOK_TOKEN !== 'change-me') {
        const res = await fetch(`${baseUrl}/api/v1/shipping/webhooks/shiprocket`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'attacker-forged-api-key',
          },
          body: JSON.stringify({ current_status: 'DELIVERED', order_id: 'FAKE123' }),
        });
        assert.strictEqual(res.status, 401);
      }
    });

  } finally {
    // Clean up test users
    if (testUserA) await prisma.user.delete({ where: { id: testUserA.id } }).catch(() => {});
    if (testUserB) await prisma.user.delete({ where: { id: testUserB.id } }).catch(() => {});
    if (testAdmin) await prisma.user.delete({ where: { id: testAdmin.id } }).catch(() => {});

    // Close server
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // ─── SUMMARY ──────────────────────────────────────────────────────────
  console.log('\n======================================================');
  console.log('             SECURITY TEST SUMMARY');
  console.log('======================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`Total Tests Run:  ${total}`);
  console.log(`Passed:           ${passed}`);
  console.log(`Failed:           ${failed}`);

  if (failed > 0) {
    console.error('\nFAILURES:');
    results.filter((r) => !r.passed).forEach((r) => {
      console.error(`  - [${r.category}] ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 ALL SECURITY TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  }
}

run().catch((e) => {
  console.error('Test suite runner crashed:', e);
  process.exit(1);
});
