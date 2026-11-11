import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptToken } from '@/lib/security/crypto';
import { getVerifiedUserId, AuthError } from '@/lib/auth/session';
import { z } from 'zod';

const ConnectionActionSchema = z.object({
  action: z.enum(['disconnect', 'connect_demo']),
});

export async function GET(req: Request) {
  try {
    const userId = getVerifiedUserId(req);

    const conn = await prisma.brokerConnection.findUnique({
      where: { user_id: userId },
    });

    if (!conn) {
      return NextResponse.json({
        success: true,
        connected: false,
        status: 'DISCONNECTED',
      });
    }

    const now = new Date();
    const isExpired = conn.token_expires_at < now;
    const currentStatus = isExpired ? 'EXPIRED' : conn.status;

    return NextResponse.json({
      success: true,
      connected: currentStatus === 'CONNECTED',
      connection: {
        broker: conn.broker,
        status: currentStatus,
        token_expires_at: conn.token_expires_at,
        connected_at: conn.connected_at,
      },
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('Fetch connection status error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = getVerifiedUserId(req);

    const rawBody = await req.json();
    const parseResult = ConnectionActionSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const { action } = parseResult.data;

    if (action === 'disconnect') {
      await prisma.brokerConnection.updateMany({
        where: { user_id: userId },
        data: { status: 'DISCONNECTED' },
      });
      return NextResponse.json({ success: true, message: 'Broker disconnected' });
    }

    if (action === 'connect_demo') {
      // Demo connection allowed only if DEMO_MODE or KITE_SANDBOX is enabled
      const demoAllowed = process.env.DEMO_MODE === 'true' || process.env.KITE_SANDBOX === 'true';
      if (!demoAllowed) {
        return NextResponse.json(
          { success: false, error: 'connect_demo is only available when DEMO_MODE=true or KITE_SANDBOX=true.' },
          { status: 403 }
        );
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 1);
      expiresAt.setHours(7, 30, 0, 0);

      await prisma.brokerConnection.upsert({
        where: { user_id: userId },
        update: {
          broker: 'KITE',
          access_token: encryptToken(`demo_access_token_${Date.now()}`),
          token_expires_at: expiresAt,
          connected_at: new Date(),
          status: 'CONNECTED',
        },
        create: {
          user_id: userId,
          broker: 'KITE',
          access_token: encryptToken(`demo_access_token_${Date.now()}`),
          token_expires_at: expiresAt,
          connected_at: new Date(),
          status: 'CONNECTED',
        },
      });

      return NextResponse.json({ success: true, message: 'Zerodha Kite connected in demo mode' });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('Update connection error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
