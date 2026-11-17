import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Validates HS256 JWT using Web Crypto API compatible with Edge Runtime.
 */
async function isValidJWT(token: string, secretKey: string): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode and verify expiration
    const payloadStr = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadStr);
    if (!payload.sub) return false;

    if (payload.exp && typeof payload.exp === 'number') {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) return false;
    }

    // Verify HMAC-SHA256 signature
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const data = enc.encode(`${headerB64}.${payloadB64}`);
    const binarySig = atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/'));
    const sigBytes = new Uint8Array(binarySig.length);
    for (let i = 0; i < binarySig.length; i++) {
      sigBytes[i] = binarySig.charCodeAt(i);
    }

    return await crypto.subtle.verify('HMAC', key, sigBytes, data);
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const secretKey = process.env.SECRET_KEY;
  const token =
    req.cookies.get('auth_token')?.value ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  let authenticated = false;
  if (token && secretKey) {
    authenticated = await isValidJWT(token, secretKey);
  }

  if (!authenticated) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/watchlist/:path*',
    '/orders/:path*',
    '/portfolio/:path*',
    '/settings/:path*',
  ],
};

