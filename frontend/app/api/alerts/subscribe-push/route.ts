import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { subscription, userId = 'demo_user' } = await req.json();

    if (!subscription) {
      return NextResponse.json({ success: false, error: 'Subscription object required' }, { status: 400 });
    }

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
    console.error('Subscribe push error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
