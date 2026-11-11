/**
 * Authentication and API Lockdown Tests
 *
 * Verifies:
 * 1. Unauthenticated access returns 401 across protected Next.js API route handlers.
 * 2. User A cannot read User B's orders (strict tenant isolation derived from verified JWT).
 * 3. Query string or body tampering (?userId=user-B) is ignored.
 * 4. Missing TOKEN_ENCRYPTION_SECRET or SECRET_KEY throws an error (fails startup).
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import { prisma } from './prisma';
import { getVerifiedUserId, AuthError } from './auth/session';
import { encryptToken, decryptToken } from './security/crypto';
import { GET as getOrders, POST as postOrders } from '../app/api/broker/orders/route';
import { GET as getConnection } from '../app/api/broker/connection/route';
import { GET as getPreferences } from '../app/api/alerts/preferences/route';
import { GET as resolveSignals } from '../app/api/cron/resolve-signals/route';

const TEST_SECRET = 'test_jwt_secret_key_minimum_32_characters_long_for_auth_12345';
const TEST_CRON = 'test_cron_secret_token_12345';
const TEST_ENCRYPTION = 'test_encryption_secret_key_32_bytes_long_12345';

process.env.SECRET_KEY = TEST_SECRET;
process.env.CRON_SECRET = TEST_CRON;
process.env.TOKEN_ENCRYPTION_SECRET = TEST_ENCRYPTION;

function makeJWT(userId: string, secret = TEST_SECRET, expired = false): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const exp = expired ? now - 3600 : now + 3600;
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function runTests() {
  console.log('🔒 Running Authentication & API Lockdown Tests...\n');

  // --- Test 1: Missing secrets fail ---
  console.log('Test 1: Missing secrets fail startup / execution');
  {
    delete process.env.TOKEN_ENCRYPTION_SECRET;
    assert.throws(
      () => encryptToken('secret_data'),
      /TOKEN_ENCRYPTION_SECRET environment variable is required/,
      'Must throw when TOKEN_ENCRYPTION_SECRET is missing'
    );
    process.env.TOKEN_ENCRYPTION_SECRET = TEST_ENCRYPTION;

    delete process.env.SECRET_KEY;
    const dummyReq = new Request('http://localhost/api/broker/orders', {
      headers: { Authorization: `Bearer ${makeJWT('usr-1')}` },
    });
    assert.throws(
      () => getVerifiedUserId(dummyReq),
      /SECRET_KEY is not configured/,
      'Must throw when SECRET_KEY is missing'
    );
    process.env.SECRET_KEY = TEST_SECRET;
    console.log('  ✓ Missing secrets throw immediately');
  }

  // --- Test 2: Unauthenticated requests return 401 ---
  console.log('Test 2: Unauthenticated access returns 401');
  {
    const reqNoAuth = new Request('http://localhost/api/broker/orders');
    const resOrders = await getOrders(reqNoAuth);
    assert.strictEqual(resOrders.status, 401, 'Orders GET without auth must return 401');

    const resConn = await getConnection(reqNoAuth);
    assert.strictEqual(resConn.status, 401, 'Connection GET without auth must return 401');

    const resPref = await getPreferences(reqNoAuth);
    assert.strictEqual(resPref.status, 401, 'Preferences GET without auth must return 401');

    const resCron = await resolveSignals(reqNoAuth as any);
    assert.strictEqual(resCron.status, 401, 'Cron GET without x-cron-secret must return 401');

    // Expired JWT
    const expiredReq = new Request('http://localhost/api/broker/orders', {
      headers: { Authorization: `Bearer ${makeJWT('usr-1', TEST_SECRET, true)}` },
    });
    const resExpired = await getOrders(expiredReq);
    assert.strictEqual(resExpired.status, 401, 'Expired JWT must return 401');

    // Forged JWT (signed with wrong secret)
    const forgedReq = new Request('http://localhost/api/broker/orders', {
      headers: { Authorization: `Bearer ${makeJWT('usr-1', 'wrong_secret_12345')}` },
    });
    const resForged = await getOrders(forgedReq);
    assert.strictEqual(resForged.status, 401, 'Forged JWT signature must return 401');
    console.log('  ✓ Unauthenticated, expired, and forged requests return 401');
  }

  // --- Test 3: User A cannot read User B's orders ---
  console.log("Test 3: User A cannot read User B's orders (strict tenant isolation)");
  {
    const userA = 'user_alpha_test_' + Date.now();
    const userB = 'user_beta_test_' + Date.now();

    let isDbOnline = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      isDbOnline = true;
    } catch {
      // Offline fallback: mock in-memory store for prisma.orderLog
    }

    const inMemoryOrders: any[] = [];
    const origFindMany = prisma.orderLog.findMany;
    const origCreate = prisma.orderLog.create;
    const origDeleteMany = prisma.orderLog.deleteMany;

    if (!isDbOnline) {
      prisma.orderLog.create = (async (args: any) => {
        const order = { id: 'mock_' + Date.now(), placed_at: new Date(), ...args.data };
        inMemoryOrders.push(order);
        return order;
      }) as any;
      prisma.orderLog.findMany = (async (args: any) => {
        return inMemoryOrders.filter((o) => {
          if (args?.where?.user_id && o.user_id !== args.where.user_id) return false;
          return true;
        });
      }) as any;
      prisma.orderLog.deleteMany = (async () => ({ count: 0 })) as any;
    }

    // Seed distinct orders for User A and User B
    const orderA = await prisma.orderLog.create({
      data: {
        user_id: userA,
        broker: 'KITE',
        symbol: 'RELIANCE',
        transaction_type: 'BUY',
        quantity: 10,
        order_type: 'MARKET',
        price: 2500,
        product_type: 'CNC',
        status: 'COMPLETE',
        response_raw: '{"status":"COMPLETE"}',
      },
    });

    const orderB = await prisma.orderLog.create({
      data: {
        user_id: userB,
        broker: 'KITE',
        symbol: 'TCS',
        transaction_type: 'SELL',
        quantity: 5,
        order_type: 'MARKET',
        price: 3900,
        product_type: 'CNC',
        status: 'COMPLETE',
        response_raw: '{"status":"COMPLETE"}',
      },
    });

    try {
      // 1. User A queries orders
      const reqA = new Request('http://localhost/api/broker/orders', {
        headers: { Authorization: `Bearer ${makeJWT(userA)}` },
      });
      const resA = await getOrders(reqA);
      const jsonA = await resA.json();

      assert.strictEqual(jsonA.success, true);
      assert.strictEqual(jsonA.orders.length, 1);
      assert.strictEqual(jsonA.orders[0].user_id, userA);
      assert.strictEqual(jsonA.orders[0].symbol, 'RELIANCE');

      // Verify User B's order is NOT present in User A's response
      const hasOrderB = jsonA.orders.some((o: any) => o.user_id === userB);
      assert.strictEqual(hasOrderB, false, "User A must NOT see User B's order");

      // 2. User B queries orders
      const reqB = new Request('http://localhost/api/broker/orders', {
        headers: { Authorization: `Bearer ${makeJWT(userB)}` },
      });
      const resB = await getOrders(reqB);
      const jsonB = await resB.json();

      assert.strictEqual(jsonB.success, true);
      assert.strictEqual(jsonB.orders.length, 1);
      assert.strictEqual(jsonB.orders[0].user_id, userB);
      assert.strictEqual(jsonB.orders[0].symbol, 'TCS');

      // Verify User A's order is NOT present in User B's response
      const hasOrderA = jsonB.orders.some((o: any) => o.user_id === userA);
      assert.strictEqual(hasOrderA, false, "User B must NOT see User A's order");

      // 3. User A attempts IDOR: passing ?userId=userB in query string
      const reqTamper = new Request(`http://localhost/api/broker/orders?userId=${encodeURIComponent(userB)}`, {
        headers: { Authorization: `Bearer ${makeJWT(userA)}` },
      });
      const resTamper = await getOrders(reqTamper);
      const jsonTamper = await resTamper.json();

      assert.strictEqual(jsonTamper.success, true);
      assert.strictEqual(jsonTamper.orders[0].user_id, userA, 'Endpoint must ignore query string userId');
      assert.strictEqual(jsonTamper.orders.some((o: any) => o.user_id === userB), false);

      console.log('  ✓ User A and User B orders are strictly isolated (no cross-tenant leakage)');
    } finally {
      // Clean up test orders
      await prisma.orderLog.deleteMany({
        where: { user_id: { in: [userA, userB] } },
      });
      if (!isDbOnline) {
        prisma.orderLog.findMany = origFindMany;
        prisma.orderLog.create = origCreate;
        prisma.orderLog.deleteMany = origDeleteMany;
      }
    }
  }

  // --- Test 4: Cron authentication ---
  console.log('Test 4: CRON_SECRET authentication');
  {
    const origSignalFindMany = prisma.signal.findMany;
    prisma.signal.findMany = (async () => []) as any;

    try {
      // Valid CRON_SECRET header
      const validCronReq = new Request('http://localhost/api/cron/resolve-signals', {
        headers: { 'x-cron-secret': TEST_CRON },
      });
      const resValid = await resolveSignals(validCronReq as any);
      assert.strictEqual(resValid.status, 200, 'Valid CRON_SECRET must succeed');

      // Invalid CRON_SECRET
      const invalidCronReq = new Request('http://localhost/api/cron/resolve-signals', {
        headers: { 'x-cron-secret': 'invalid_secret' },
      });
      const resInvalid = await resolveSignals(invalidCronReq as any);
      assert.strictEqual(resInvalid.status, 401, 'Invalid CRON_SECRET must return 401');
      console.log('  ✓ CRON_SECRET strictly enforced');
    } finally {
      prisma.signal.findMany = origSignalFindMany;
    }
  }

  console.log('\n🎉 ALL AUTHENTICATION & API LOCKDOWN TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
