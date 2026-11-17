import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getVerifiedUserId, AuthError } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const userId = getVerifiedUserId(req);
    const secretKey = process.env.SECRET_KEY;
    if (!secretKey) {
      throw new Error('SECRET_KEY is not configured');
    }

    const apiKey = process.env.KITE_API_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = encodeURIComponent(`${baseUrl}/api/broker/kite/callback`);

    // Generate single-use expiring nonce tied to the user
    const nonce = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
      await prisma.oAuthState.create({
        data: {
          user_id: userId,
          nonce: nonce,
          expires_at: expiresAt,
          used: false,
        },
      });
    } catch (dbErr) {
      console.warn('[broker/kite/login] Failed to persist OAuthState in DB, falling back to HMAC cookie verification', dbErr);
    }

    // Sign state: payload.signature
    const payloadObj = {
      userId,
      nonce,
      exp: expiresAt.getTime(),
    };
    const payloadStr = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
    const signature = crypto.createHmac('sha256', secretKey).update(payloadStr).digest('base64url');
    const signedState = `${payloadStr}.${signature}`;

    const isSecure = baseUrl.startsWith('https://');
    const cookieHeader = `kite_oauth_state=${signedState}; Path=/api/broker/kite; Max-Age=600; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}`;

    if (!apiKey) {
      if (process.env.KITE_SANDBOX === 'true') {
        const response = NextResponse.redirect(
          `${baseUrl}/api/broker/kite/callback?request_token=demo_request_token_${Date.now()}&state=${encodeURIComponent(signedState)}`
        );
        response.headers.set('Set-Cookie', cookieHeader);
        return response;
      }
      return NextResponse.redirect(
        `${baseUrl}/settings?broker_error=${encodeURIComponent('Kite API key not configured and KITE_SANDBOX is false')}`
      );
    }

    const kiteLoginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}&redirect_params=redirect_uri%3D${redirectUri}&state=${encodeURIComponent(signedState)}`;
    const response = NextResponse.redirect(kiteLoginUrl);
    response.headers.set('Set-Cookie', cookieHeader);
    return response;
  } catch (err: any) {
    if (err instanceof AuthError) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      return NextResponse.redirect(`${baseUrl}/login?next=${encodeURIComponent('/settings')}`);
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
