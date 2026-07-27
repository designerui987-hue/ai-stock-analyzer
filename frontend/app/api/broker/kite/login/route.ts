import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.KITE_API_KEY || 'demo_kite_api_key';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = encodeURIComponent(`${baseUrl}/api/broker/kite/callback`);

  if (!process.env.KITE_API_KEY) {
    // If running in demo mode without real Kite keys, redirect directly to callback with demo request_token
    return NextResponse.redirect(`${baseUrl}/api/broker/kite/callback?request_token=demo_request_token_12345`);
  }

  const kiteLoginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}&redirect_params=redirect_uri%3D${redirectUri}`;
  return NextResponse.redirect(kiteLoginUrl);
}
