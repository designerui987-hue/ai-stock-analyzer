import { NextResponse } from 'next/server';
import { getVerifiedUserId, AuthError } from '@/lib/auth/session';

export async function GET(req: Request) {
  try {
    const userId = getVerifiedUserId(req);
    const apiKey = process.env.KITE_API_KEY;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = encodeURIComponent(`${baseUrl}/api/broker/kite/callback`);

    if (!apiKey) {
      if (process.env.KITE_SANDBOX === 'true') {
        return NextResponse.redirect(
          `${baseUrl}/api/broker/kite/callback?request_token=demo_request_token_12345&state=${encodeURIComponent(userId)}`
        );
      }
      return NextResponse.redirect(
        `${baseUrl}/settings?broker_error=${encodeURIComponent('Kite API key not configured and KITE_SANDBOX is false')}`
      );
    }

    const kiteLoginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}&redirect_params=redirect_uri%3D${redirectUri}&state=${encodeURIComponent(userId)}`;
    return NextResponse.redirect(kiteLoginUrl);
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
