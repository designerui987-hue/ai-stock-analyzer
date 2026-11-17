import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptToken } from '@/lib/security/crypto';
import { getVerifiedUserId, AuthError } from '@/lib/auth/session';
import crypto from 'node:crypto';

export async function GET(req: Request) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const { searchParams } = new URL(req.url);
    const requestToken = searchParams.get('request_token');
    const stateParam = searchParams.get('state');

    if (!requestToken) {
      return NextResponse.redirect(`${baseUrl}/settings?broker_error=Missing+request_token`);
    }

    if (!stateParam) {
      return NextResponse.redirect(`${baseUrl}/settings?broker_error=Missing+OAuth+state+parameter`);
    }

    // 1. Enforce authenticated app session
    let sessionUserId: string;
    try {
      sessionUserId = getVerifiedUserId(req);
    } catch (authErr) {
      return NextResponse.redirect(`${baseUrl}/login?next=${encodeURIComponent('/settings')}`);
    }

    // 2. Validate cookie state matches param if cookie present
    const cookieHeader = req.headers.get('cookie') || '';
    const cookieMatch = cookieHeader.match(/(?:^|;\s*)kite_oauth_state=([^;]+)/);
    const stateCookie = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;

    if (stateCookie && stateCookie !== stateParam) {
      return NextResponse.redirect(
        `${baseUrl}/settings?broker_error=${encodeURIComponent('OAuth state mismatch (cross-site request detected)')}`
      );
    }

    // 3. Cryptographically verify state HMAC signature
    const secretKey = process.env.SECRET_KEY;
    if (!secretKey) {
      throw new Error('SECRET_KEY is not configured on the server');
    }

    const parts = stateParam.split('.');
    if (parts.length !== 2) {
      return NextResponse.redirect(
        `${baseUrl}/settings?broker_error=${encodeURIComponent('Malformed OAuth state format')}`
      );
    }

    const [payloadB64, signatureB64] = parts;
    const expectedSig = crypto.createHmac('sha256', secretKey).update(payloadB64).digest('base64url');

    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf = Buffer.from(signatureB64);
    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      return NextResponse.redirect(
        `${baseUrl}/settings?broker_error=${encodeURIComponent('Forged or corrupted OAuth state signature')}`
      );
    }

    // 4. Decode payload and check expiration
    let payload: { userId: string; nonce: string; exp: number };
    try {
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    } catch {
      return NextResponse.redirect(
        `${baseUrl}/settings?broker_error=${encodeURIComponent('Invalid OAuth state payload encoding')}`
      );
    }

    if (!payload.userId || !payload.nonce || !payload.exp) {
      return NextResponse.redirect(
        `${baseUrl}/settings?broker_error=${encodeURIComponent('Incomplete OAuth state claims')}`
      );
    }

    if (Date.now() > payload.exp) {
      return NextResponse.redirect(
        `${baseUrl}/settings?broker_error=${encodeURIComponent('OAuth state has expired (10 minute limit)')}`
      );
    }

    // 5. Account isolation: verify state belongs to the active session user
    if (payload.userId !== sessionUserId) {
      return NextResponse.redirect(
        `${baseUrl}/settings?broker_error=${encodeURIComponent('Cross-account broker link attempt rejected')}`
      );
    }

    // 6. Atomically consume the matching, unused, unexpired database nonce before contacting Kite
    try {
      const result = await prisma.oAuthState.updateMany({
        where: {
          nonce: payload.nonce,
          user_id: sessionUserId,
          used: false,
          expires_at: { gt: new Date() },
        },
        data: {
          used: true,
        },
      });

      if (result.count === 0) {
        // Atomic consume failed: state was either missing, already consumed (replay), expired, or belonged to another user
        const existing = await prisma.oAuthState.findUnique({
          where: { nonce: payload.nonce },
        });

        if (!existing) {
          return NextResponse.redirect(
            `${baseUrl}/settings?broker_error=${encodeURIComponent('Missing or invalid OAuth state nonce. Please try linking again.')}`
          );
        }
        if (existing.user_id !== sessionUserId) {
          return NextResponse.redirect(
            `${baseUrl}/settings?broker_error=${encodeURIComponent('Cross-account broker link attempt rejected')}`
          );
        }
        if (existing.used) {
          return NextResponse.redirect(
            `${baseUrl}/settings?broker_error=${encodeURIComponent('Replay attack detected: OAuth state has already been used')}`
          );
        }
        if (existing.expires_at <= new Date()) {
          return NextResponse.redirect(
            `${baseUrl}/settings?broker_error=${encodeURIComponent('OAuth state has expired (10 minute limit)')}`
          );
        }
        return NextResponse.redirect(
          `${baseUrl}/settings?broker_error=${encodeURIComponent('Invalid OAuth state. Please try linking again.')}`
        );
      }
    } catch (dbErr) {
      console.error('[broker/kite/callback] Database error during nonce verification:', dbErr);
      return NextResponse.redirect(
        `${baseUrl}/settings?broker_error=${encodeURIComponent('Database unavailable. Please try linking again.')}`
      );
    }

    // 7. Exchange request_token server-side
    const apiKey = process.env.KITE_API_KEY;
    const apiSecret = process.env.KITE_API_SECRET;
    let accessToken = `sess_kite_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').substring(0, 9)}`;

    if (apiKey && apiSecret) {
      const checksum = crypto
        .createHash('sha256')
        .update(apiKey + requestToken + apiSecret)
        .digest('hex');

      const res = await fetch('https://api.kite.trade/session/token', {
        method: 'POST',
        headers: {
          'X-Kite-Version': '3',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          api_key: apiKey,
          request_token: requestToken,
          checksum: checksum,
        }),
      });

      const data = await res.json();
      if (data.status === 'success' && data.data.access_token) {
        accessToken = data.data.access_token;
      } else {
        return NextResponse.redirect(
          `${baseUrl}/settings?broker_error=${encodeURIComponent(data.message || 'Token exchange failed')}`
        );
      }
    } else if (process.env.KITE_SANDBOX !== 'true') {
      return NextResponse.redirect(
        `${baseUrl}/settings?broker_error=${encodeURIComponent('Kite API keys not configured and KITE_SANDBOX is false')}`
      );
    }

    // 8. Encrypt token at rest and persist to PostgreSQL
    const encryptedAccessToken = encryptToken(accessToken);

    // Kite Connect tokens expire daily at ~07:30 AM next day
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);
    expiresAt.setHours(7, 30, 0, 0);

    await prisma.brokerConnection.upsert({
      where: { user_id: sessionUserId },
      update: {
        broker: 'KITE',
        access_token: encryptedAccessToken,
        token_expires_at: expiresAt,
        connected_at: new Date(),
        status: 'CONNECTED',
      },
      create: {
        user_id: sessionUserId,
        broker: 'KITE',
        access_token: encryptedAccessToken,
        token_expires_at: expiresAt,
        connected_at: new Date(),
        status: 'CONNECTED',
      },
    });

    const response = NextResponse.redirect(`${baseUrl}/settings?broker_connected=true`);
    // Clear oauth state cookie
    response.headers.set('Set-Cookie', 'kite_oauth_state=; Path=/api/broker/kite; Max-Age=0; HttpOnly; SameSite=Lax');
    return response;
  } catch (err: any) {
    console.error('[Kite Callback Error]', err);
    return NextResponse.redirect(
      `${baseUrl}/settings?broker_error=${encodeURIComponent(err.message || 'Broker connection failed')}`
    );
  }
}
