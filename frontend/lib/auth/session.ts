import crypto from 'node:crypto';

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

/**
 * Verify a standard HS256 JWT using node:crypto with constant-time signature comparison.
 */
export function verifyJWT(token: string, secretKey: string): { sub: string; exp?: number; [key: string]: any } {
  if (!token) {
    throw new AuthError('Missing token');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthError('Malformed JWT format');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const data = `${headerB64}.${payloadB64}`;

  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(data)
    .digest('base64url');

  const expectedBuf = Buffer.from(expectedSignature);
  const actualBuf = Buffer.from(signatureB64);

  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    throw new AuthError('Invalid JWT signature');
  }

  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new AuthError('Invalid JWT payload encoding');
  }

  if (payload.exp && typeof payload.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      throw new AuthError('JWT token has expired');
    }
  }

  if (!payload.sub) {
    throw new AuthError('JWT token missing subject (userId)');
  }

  return payload;
}

/**
 * Derives user ID strictly from the verified session/JWT (Authorization: Bearer <token>).
 * Never accepts userId from request body or query parameters.
 */
export function getVerifiedUserId(req: Request): string {
  const secretKey = process.env.SECRET_KEY;
  if (!secretKey || secretKey.trim() === '') {
    throw new Error('SECRET_KEY is not configured on the server');
  }

  const authHeader = req.headers.get('authorization');
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else {
    // Check cookie fallback if present
    const cookieHeader = req.headers.get('cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }
  }

  if (!token) {
    throw new AuthError('Authentication required: missing Bearer token');
  }

  const payload = verifyJWT(token, secretKey);
  return String(payload.sub);
}

/**
 * Validates CRON_SECRET for cron routes and protected maintenance/generation endpoints.
 */
export function verifyCronSecret(req: Request): void {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.trim() === '') {
    throw new AuthError('CRON_SECRET is not configured — endpoint disabled', 503);
  }

  const headerSecret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!headerSecret || headerSecret !== cronSecret) {
    throw new AuthError('Unauthorized: invalid CRON_SECRET', 401);
  }
}

