import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getVerifiedUserId, AuthError } from '@/lib/auth/session';

export async function GET(req: Request) {
  try {
    const userId = getVerifiedUserId(req);

    // Clean up expired nonces for this user
    await prisma.oAuthState.deleteMany({
      where: {
        user_id: userId,
        expires_at: { lt: new Date() },
      },
    }).catch(() => {});

    // Generate single-use, 10-minute linking nonce
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const nonce = `tg_${randomBytes}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.oAuthState.create({
      data: {
        user_id: userId,
        nonce,
        expires_at: expiresAt,
        used: false,
      },
    });

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'StockAIBot';
    const deepLink = `https://t.me/${botUsername}?start=${nonce}`;

    return NextResponse.json({
      success: true,
      link_token: nonce,
      expires_at: expiresAt.toISOString(),
      bot_username: botUsername,
      deep_link: deepLink,
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('Error generating Telegram link token:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
