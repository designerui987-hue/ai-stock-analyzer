import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getVerifiedUserId, AuthError } from '@/lib/auth/session';
import { z } from 'zod';

const SubscribePushSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
    expirationTime: z.number().nullable().optional(),
  }),
});

export async function POST(req: Request) {
  try {
    const userId = getVerifiedUserId(req);

    const rawBody = await req.json();
    const parseResult = SubscribePushSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const { subscription } = parseResult.data;
    const subString = JSON.stringify(subscription);

    await prisma.alertPreference.upsert({
      where: { user_id: userId },
      update: {
        web_push_subscription: subString,
        channels_enabled: JSON.stringify({
          web_push: true,
          telegram: true,
          whatsapp: false,
        }),
      },
      create: {
        user_id: userId,
        web_push_subscription: subString,
        channels_enabled: JSON.stringify({
          web_push: true,
          telegram: true,
          whatsapp: false,
        }),
      },
    });

    return NextResponse.json({ success: true, message: 'Web push subscription saved' });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('Subscribe push error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
