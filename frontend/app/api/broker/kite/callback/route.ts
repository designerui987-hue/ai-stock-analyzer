import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptToken } from '@/lib/security/crypto';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requestToken = searchParams.get('request_token');
    const userId = searchParams.get('userId') || 'demo_user';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (!requestToken) {
      return NextResponse.redirect(`${baseUrl}/settings?broker_error=Missing+request_token`);
    }

    const apiKey = process.env.KITE_API_KEY;
    const apiSecret = process.env.KITE_API_SECRET;
    let accessToken = `sess_kite_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (apiKey && apiSecret) {
      // Exchange request_token server-side using SHA-256(api_key + request_token + api_secret)
      const crypto = await import('node:crypto');
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
        return NextResponse.redirect(`${baseUrl}/settings?broker_error=${encodeURIComponent(data.message || 'Token exchange failed')}`);
      }
    }

    // Encrypt token at rest
    const encryptedAccessToken = encryptToken(accessToken);

    // Kite Connect tokens expire daily at ~07:30 AM next day
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);
    expiresAt.setHours(7, 30, 0, 0);

    await prisma.brokerConnection.upsert({
      where: { user_id: userId },
      update: {
        broker: 'KITE',
        access_token: encryptedAccessToken,
        token_expires_at: expiresAt,
        connected_at: new Date(),
        status: 'CONNECTED',
      },
      create: {
        user_id: userId,
        broker: 'KITE',
        access_token: encryptedAccessToken,
        token_expires_at: expiresAt,
        connected_at: new Date(),
        status: 'CONNECTED',
      },
    });

    return NextResponse.redirect(`${baseUrl}/settings?broker_connected=true`);
  } catch (err: any) {
    console.error('[Kite Callback Error]', err);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${baseUrl}/settings?broker_error=${encodeURIComponent(err.message)}`);
  }
}
