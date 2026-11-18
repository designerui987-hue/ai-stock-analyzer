/// <reference types="node" />
/**
 * Telegram Linking & Webhook Security Tests
 *
 * Verifies Finding 1 requirements:
 * 1. Webhook secret verification (X-Telegram-Bot-Api-Secret-Token).
 * 2. Reject unauthenticated direct account IDs (prevent account hijacking).
 * 3. Link accounts through short-lived, single-use tokens generated for authenticated users.
 * 4. Token replay protection: second callback with same token is rejected.
 * 5. Expired tokens are rejected.
 * 6. Existing channel preferences (e.g. WhatsApp, quiet hours) are preserved when linking.
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import { prisma } from './prisma';
import { GET as getLinkToken } from '../app/api/telegram/link-token/route';
import { POST as handleWebhook } from '../app/api/telegram/webhook/route';

function makeJWT(userId: string): string {
  const secret = process.env.SECRET_KEY || 'test_jwt_secret_key_minimum_32_characters_long_for_auth_12345';
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function runTelegramSecurityTests() {
  console.log('Running Telegram Security & Webhook Tests...');

  const TEST_USER = 'user_tg_secure_test_01';
  const VICTIM_USER = 'victim_tg_account_99';
  const TEST_SECRET = 'tg_webhook_secret_token_abcdef123456';

  process.env.TELEGRAM_WEBHOOK_SECRET = TEST_SECRET;
  process.env.SECRET_KEY = process.env.SECRET_KEY || 'test_jwt_secret_key_minimum_32_characters_long_for_auth_12345';

  let isDbOnline = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    isDbOnline = true;
  } catch {
    // Offline in-memory fallback
  }

  // In-memory stores for offline testing
  const memoryStates = new Map<string, any>();
  const memoryPrefs = new Map<string, any>();

  const origStateCreate = prisma.oAuthState.create;
  const origStateFindFirst = prisma.oAuthState.findFirst;
  const origStateUpdateMany = prisma.oAuthState.updateMany;
  const origStateDeleteMany = prisma.oAuthState.deleteMany;

  const origPrefFindUnique = prisma.alertPreference.findUnique;
  const origPrefUpsert = prisma.alertPreference.upsert;
  const origPrefCreate = prisma.alertPreference.create;
  const origPrefDeleteMany = prisma.alertPreference.deleteMany;

  if (!isDbOnline) {
    prisma.oAuthState.deleteMany = (async () => ({ count: 0 })) as any;
    prisma.oAuthState.create = (async (args: any) => {
      const row = { id: 'st_' + Date.now() + Math.random(), ...args.data };
      memoryStates.set(row.nonce, row);
      return row;
    }) as any;
    prisma.oAuthState.findFirst = (async (args: any) => {
      const nonce = args?.where?.nonce;
      const rec = memoryStates.get(nonce);
      if (!rec) return null;
      if (args?.where?.used !== undefined && rec.used !== args.where.used) return null;
      if (args?.where?.expires_at?.gt && rec.expires_at <= args.where.expires_at.gt) return null;
      return { ...rec };
    }) as any;
    prisma.oAuthState.updateMany = (async (args: any) => {
      let count = 0;
      for (const [_, rec] of memoryStates) {
        if (args?.where?.id && rec.id !== args.where.id) continue;
        if (args?.where?.used !== undefined && rec.used !== args.where.used) continue;
        Object.assign(rec, args.data);
        count++;
      }
      return { count };
    }) as any;

    prisma.alertPreference.deleteMany = (async () => ({ count: 0 })) as any;
    prisma.alertPreference.findUnique = (async (args: any) => {
      const rec = memoryPrefs.get(args.where.user_id);
      return rec ? { ...rec } : null;
    }) as any;
    prisma.alertPreference.create = (async (args: any) => {
      const row = { id: 'pref_' + Date.now(), ...args.data };
      memoryPrefs.set(row.user_id, row);
      return row;
    }) as any;
    prisma.alertPreference.upsert = (async (args: any) => {
      const existing = memoryPrefs.get(args.where.user_id);
      if (existing) {
        Object.assign(existing, args.update);
        return { ...existing };
      } else {
        const created = { id: 'pref_' + Date.now(), ...args.create };
        memoryPrefs.set(created.user_id, created);
        return { ...created };
      }
    }) as any;
  }

  try {
    // Setup victim's existing preferences with whatsapp: true
    await prisma.alertPreference.create({
      data: {
        user_id: VICTIM_USER,
        telegram_chat_id: null,
        channels_enabled: JSON.stringify({ web_push: false, telegram: false, whatsapp: true }),
        whatsapp_number: '+919988776655',
      },
    });

    // Test 1: Reject request missing secret header
    {
      const req = new Request('http://localhost/api/telegram/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { chat: { id: 123456 }, text: `/start ${VICTIM_USER}` } }),
      });
      const res = await handleWebhook(req);
      assert.strictEqual(res.status, 401, 'Request without secret header must return 401');
      console.log('  ✓ Webhook request without secret header is rejected (401)');
    }

    // Test 2: Reject request with forged/wrong secret header
    {
      const req = new Request('http://localhost/api/telegram/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'wrong_secret',
        },
        body: JSON.stringify({ message: { chat: { id: 123456 }, text: `/start ${VICTIM_USER}` } }),
      });
      const res = await handleWebhook(req);
      assert.strictEqual(res.status, 401, 'Request with forged secret header must return 401');
      console.log('  ✓ Webhook request with forged secret header is rejected (401)');
    }

    // Test 3: Reject direct user ID attack even if secret matches
    {
      const req = new Request('http://localhost/api/telegram/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': TEST_SECRET,
        },
        body: JSON.stringify({ message: { chat: { id: 123456 }, text: `/start ${VICTIM_USER}` } }),
      });
      const res = await handleWebhook(req);
      assert.strictEqual(res.status, 400, 'Direct user ID attack must return 400');
      // Ensure victim's preference was NOT modified
      const victimPref = await prisma.alertPreference.findUnique({ where: { user_id: VICTIM_USER } });
      assert.strictEqual(victimPref?.telegram_chat_id, null, 'Victim telegram_chat_id must remain null');
      console.log('  ✓ Direct user ID linking attack is rejected without modifying victim account');
    }

    // Test 4: Authenticated user generates genuine short-lived link token
    let validToken: string;
    {
      const tokenReq = new Request('http://localhost/api/telegram/link-token', {
        headers: { Authorization: `Bearer ${makeJWT(TEST_USER)}` },
      });
      const tokenRes = await getLinkToken(tokenReq);
      assert.strictEqual(tokenRes.status, 200);
      const data = await tokenRes.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.link_token.startsWith('tg_'));
      assert.ok(data.deep_link.includes(data.link_token));
      validToken = data.link_token;
      console.log('  ✓ Authenticated user generates secure single-use link token');
    }

    // Test 5: Valid link token consumes atomically and preserves existing channels
    {
      // First set existing preferences for TEST_USER with custom channels
      await prisma.alertPreference.create({
        data: {
          user_id: TEST_USER,
          channels_enabled: JSON.stringify({ web_push: true, telegram: false, whatsapp: true }),
          whatsapp_number: '+919876543210',
        },
      });

      const req = new Request('http://localhost/api/telegram/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': TEST_SECRET,
        },
        body: JSON.stringify({ message: { chat: { id: 888777666 }, text: `/start ${validToken}` } }),
      });
      const res = await handleWebhook(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.ok, true);
      assert.strictEqual(data.linked, true);
      assert.strictEqual(data.user_id, TEST_USER);

      // Verify preferences were updated correctly
      const pref = await prisma.alertPreference.findUnique({ where: { user_id: TEST_USER } });
      assert.strictEqual(pref?.telegram_chat_id, '888777666');
      const channels = JSON.parse(pref!.channels_enabled);
      assert.strictEqual(channels.telegram, true, 'Telegram channel must now be enabled');
      assert.strictEqual(channels.whatsapp, true, 'WhatsApp channel preference must be preserved');
      assert.strictEqual(channels.web_push, true, 'Web push preference must be preserved');
      console.log('  ✓ Valid token links Telegram chat while preserving existing preferences');
    }

    // Test 6: Replay attack with same token is rejected
    {
      const req = new Request('http://localhost/api/telegram/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': TEST_SECRET,
        },
        body: JSON.stringify({ message: { chat: { id: 999999 }, text: `/start ${validToken}` } }),
      });
      const res = await handleWebhook(req);
      assert.strictEqual(res.status, 400, 'Replayed token must return 400');
      console.log('  ✓ Replayed token is rejected (cannot be used twice)');
    }

    // Test 7: Expired token is rejected
    {
      const expiredToken = 'tg_expired_token_12345';
      await prisma.oAuthState.create({
        data: {
          user_id: TEST_USER,
          nonce: expiredToken,
          expires_at: new Date(Date.now() - 1000), // in the past
          used: false,
        },
      });

      const req = new Request('http://localhost/api/telegram/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': TEST_SECRET,
        },
        body: JSON.stringify({ message: { chat: { id: 555555 }, text: `/start ${expiredToken}` } }),
      });
      const res = await handleWebhook(req);
      assert.strictEqual(res.status, 400, 'Expired token must return 400');
      console.log('  ✓ Expired token is rejected');
    }

    console.log('All Telegram Security & Webhook Tests Passed Successfully!\n');
  } finally {
    if (!isDbOnline) {
      prisma.oAuthState.create = origStateCreate;
      prisma.oAuthState.findFirst = origStateFindFirst;
      prisma.oAuthState.updateMany = origStateUpdateMany;
      prisma.oAuthState.deleteMany = origStateDeleteMany;

      prisma.alertPreference.findUnique = origPrefFindUnique;
      prisma.alertPreference.upsert = origPrefUpsert;
      prisma.alertPreference.create = origPrefCreate;
      prisma.alertPreference.deleteMany = origPrefDeleteMany;
    }
  }
}

runTelegramSecurityTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
