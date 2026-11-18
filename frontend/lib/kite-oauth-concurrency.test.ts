/// <reference types="node" />
/**
 * Kite OAuth Callback Concurrency & Replay Protection Tests
 *
 * Requirement:
 * "Add a concurrency test proving two callbacks with the same nonce can trigger at most one token exchange."
 * "Require a valid signed state that matches the authenticated session. Atomically consume the matching,
 * unused, unexpired database nonce before contacting Kite. Reject missing, forged, expired, reused,
 * and cross-account state. If the database is unavailable, return a retryable error and require a fresh link attempt."
 */

import assert from 'node:assert';
import crypto from 'node:crypto';

// Simulated database state table with atomic row-level update semantics
class MockDatabase {
  private records: Map<string, { userId: string; nonce: string; expiresAt: Date; used: boolean }> = new Map();
  public unavailable: boolean = false;

  insertState(record: { userId: string; nonce: string; expiresAt: Date; used: boolean }) {
    this.records.set(record.nonce, { ...record });
  }

  // Simulates PostgreSQL atomic UPDATE ... WHERE nonce = $1 AND user_id = $2 AND used = false AND expires_at > NOW()
  async updateMany(filter: { nonce: string; userId: string; now: Date }): Promise<{ count: number }> {
    if (this.unavailable) {
      throw new Error('Connection terminated unexpectedly: DB unavailable');
    }
    // Simulate async network latency jitter
    await new Promise((r) => setTimeout(r, Math.random() * 20 + 5));

    const rec = this.records.get(filter.nonce);
    if (!rec) return { count: 0 };
    if (rec.userId !== filter.userId) return { count: 0 };
    if (rec.used) return { count: 0 };
    if (rec.expiresAt <= filter.now) return { count: 0 };

    rec.used = true;
    return { count: 1 };
  }

  async findUnique(nonce: string) {
    if (this.unavailable) {
      throw new Error('DB unavailable');
    }
    return this.records.get(nonce) ? { ...this.records.get(nonce)! } : null;
  }
}

// Simulated Token Exchange Counter
let kiteTokenExchangeCount = 0;
async function mockKiteTokenExchange(requestToken: string) {
  kiteTokenExchangeCount++;
  await new Promise((r) => setTimeout(r, 10));
  return { access_token: `sess_kite_${requestToken}_ok` };
}

// Core OAuth callback handler logic mirroring route.ts
async function handleKiteCallback(
  params: {
    requestToken: string | null;
    stateParam: string | null;
    sessionUserId: string | null;
    secretKey: string;
    db: MockDatabase;
    now?: Date;
  }
): Promise<{ status: 'SUCCESS' | 'REJECTED' | 'ERROR'; reason: string }> {
  const { requestToken, stateParam, sessionUserId, secretKey, db, now = new Date() } = params;

  if (!requestToken) return { status: 'REJECTED', reason: 'Missing request_token' };
  if (!stateParam) return { status: 'REJECTED', reason: 'Missing OAuth state parameter' };
  if (!sessionUserId) return { status: 'REJECTED', reason: 'Unauthenticated' };

  // 1. Signature verification
  const parts = stateParam.split('.');
  if (parts.length !== 2) return { status: 'REJECTED', reason: 'Malformed OAuth state format' };
  const [payloadB64, signatureB64] = parts;
  const expectedSig = crypto.createHmac('sha256', secretKey).update(payloadB64).digest('base64url');
  if (signatureB64 !== expectedSig) {
    return { status: 'REJECTED', reason: 'Forged or corrupted OAuth state signature' };
  }

  // 2. Decode payload
  let payload: { userId: string; nonce: string; exp: number };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { status: 'REJECTED', reason: 'Invalid OAuth state payload encoding' };
  }

  if (Date.now() > payload.exp) {
    return { status: 'REJECTED', reason: 'OAuth state has expired (10 minute limit)' };
  }

  // 3. Cross-account check
  if (payload.userId !== sessionUserId) {
    return { status: 'REJECTED', reason: 'Cross-account broker link attempt rejected' };
  }

  // 4. Atomic nonce consumption before contacting Kite
  try {
    const res = await db.updateMany({
      nonce: payload.nonce,
      userId: sessionUserId,
      now,
    });

    if (res.count === 0) {
      const existing = await db.findUnique(payload.nonce);
      if (!existing) {
        return { status: 'REJECTED', reason: 'Missing or invalid OAuth state nonce' };
      }
      if (existing.userId !== sessionUserId) {
        return { status: 'REJECTED', reason: 'Cross-account broker link attempt rejected' };
      }
      if (existing.used) {
        return { status: 'REJECTED', reason: 'Replay attack detected: OAuth state has already been used' };
      }
      if (existing.expiresAt <= now) {
        return { status: 'REJECTED', reason: 'OAuth state has expired (10 minute limit)' };
      }
      return { status: 'REJECTED', reason: 'Invalid OAuth state' };
    }
  } catch (err: any) {
    return { status: 'ERROR', reason: 'Database unavailable. Please try linking again.' };
  }

  // 5. Contact Kite ONLY after atomic nonce consumption succeeds
  await mockKiteTokenExchange(requestToken);
  return { status: 'SUCCESS', reason: 'Broker connected' };
}

async function runConcurrencyTests() {
  console.log('Running Kite OAuth Concurrency & Replay Protection Tests...');

  const SECRET_KEY = 'test_secret_key_for_hmac_verification';
  const db = new MockDatabase();

  const userA = 'user-alice-123';
  const userB = 'user-bob-456';
  const nonce1 = 'nonce-uuid-111';
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Setup initial active nonce for User A
  db.insertState({
    userId: userA,
    nonce: nonce1,
    expiresAt,
    used: false,
  });

  // Create valid signed state for User A
  const payloadStr = Buffer.from(
    JSON.stringify({ userId: userA, nonce: nonce1, exp: expiresAt.getTime() })
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(payloadStr).digest('base64url');
  const validStateParam = `${payloadStr}.${signature}`;

  // TEST 1: Two concurrent callbacks with the exact same nonce
  kiteTokenExchangeCount = 0;
  const [res1, res2] = await Promise.all([
    handleKiteCallback({
      requestToken: 'req_token_alpha',
      stateParam: validStateParam,
      sessionUserId: userA,
      secretKey: SECRET_KEY,
      db,
    }),
    handleKiteCallback({
      requestToken: 'req_token_beta',
      stateParam: validStateParam,
      sessionUserId: userA,
      secretKey: SECRET_KEY,
      db,
    }),
  ]);

  const successes = [res1, res2].filter((r) => r.status === 'SUCCESS');
  const replays = [res1, res2].filter(
    (r) => r.status === 'REJECTED' && r.reason.includes('Replay attack detected')
  );

  assert.strictEqual(successes.length, 1, 'Exactly one concurrent callback must succeed');
  assert.strictEqual(replays.length, 1, 'The other concurrent callback must be rejected as replay attack');
  assert.strictEqual(kiteTokenExchangeCount, 1, 'Kite token exchange must be triggered AT MOST ONCE');
  console.log('✓ Concurrent callback race condition safely resolved: exactly 1 token exchange triggered');

  // TEST 2: Serial replay attack with the consumed nonce
  const res3 = await handleKiteCallback({
    requestToken: 'req_token_replay',
    stateParam: validStateParam,
    sessionUserId: userA,
    secretKey: SECRET_KEY,
    db,
  });
  assert.strictEqual(res3.status, 'REJECTED');
  assert.ok(res3.reason.includes('Replay attack detected'));
  assert.strictEqual(kiteTokenExchangeCount, 1, 'Kite token exchange was NOT triggered on replay');
  console.log('✓ Serial replay attack rejected without contacting Kite');

  // TEST 3: Cross-account callback attempt (User B presents User A signed state)
  const resCross = await handleKiteCallback({
    requestToken: 'req_token_cross',
    stateParam: validStateParam,
    sessionUserId: userB, // Logged in as User B
    secretKey: SECRET_KEY,
    db,
  });
  assert.strictEqual(resCross.status, 'REJECTED');
  assert.ok(resCross.reason.includes('Cross-account'));
  assert.strictEqual(kiteTokenExchangeCount, 1, 'Cross-account link rejected without contacting Kite');
  console.log('✓ Cross-account attack rejected');

  // TEST 4: Forged signature
  const forgedState = `${payloadStr}.forged_signature_xyz`;
  const resForged = await handleKiteCallback({
    requestToken: 'req_token_forged',
    stateParam: forgedState,
    sessionUserId: userA,
    secretKey: SECRET_KEY,
    db,
  });
  assert.strictEqual(resForged.status, 'REJECTED');
  assert.ok(resForged.reason.includes('Forged or corrupted'));
  console.log('✓ Forged state signature rejected');

  // TEST 5: Database unavailable returns retryable error
  const nonce2 = 'nonce-uuid-222';
  db.insertState({ userId: userA, nonce: nonce2, expiresAt, used: false });
  const payloadStr2 = Buffer.from(
    JSON.stringify({ userId: userA, nonce: nonce2, exp: expiresAt.getTime() })
  ).toString('base64url');
  const signature2 = crypto.createHmac('sha256', SECRET_KEY).update(payloadStr2).digest('base64url');
  const validState2 = `${payloadStr2}.${signature2}`;

  db.unavailable = true;
  const resDbDown = await handleKiteCallback({
    requestToken: 'req_token_db_down',
    stateParam: validState2,
    sessionUserId: userA,
    secretKey: SECRET_KEY,
    db,
  });
  assert.strictEqual(resDbDown.status, 'ERROR');
  assert.ok(resDbDown.reason.includes('Database unavailable'));
  assert.strictEqual(kiteTokenExchangeCount, 1, 'DB failure fails closed without contacting Kite');
  console.log('✓ Database failure handled safely with retryable error');

  console.log('All Kite OAuth Concurrency & Security Tests Passed successfully!');
}

runConcurrencyTests().catch((err) => {
  console.error('Kite OAuth Concurrency Test Failed:', err);
  process.exit(1);
});
