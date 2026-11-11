import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getVerifiedUserId, AuthError } from '@/lib/auth/session';
import { z } from 'zod';

const PreferencesPostSchema = z.object({
  channels_enabled: z.record(z.string(), z.boolean()).optional(),
  alert_types_subscribed: z.array(z.string()).optional(),
  quiet_hours: z.object({
    enabled: z.boolean(),
    start: z.string(),
    end: z.string(),
  }).optional(),
  min_confidence_threshold: z.number().min(0).max(100).optional(),
  whatsapp_number: z.string().max(20).nullable().optional(),
  telegram_chat_id: z.string().max(50).nullable().optional(),
});

export async function GET(req: Request) {
  try {
    const userId = getVerifiedUserId(req);

    let pref = await prisma.alertPreference.findUnique({
      where: { user_id: userId },
    });

    if (!pref) {
      pref = await prisma.alertPreference.create({
        data: { user_id: userId },
      });
    }

    return NextResponse.json({
      success: true,
      preference: {
        ...pref,
        channels_enabled: JSON.parse(pref.channels_enabled),
        alert_types_subscribed: JSON.parse(pref.alert_types_subscribed),
        quiet_hours: JSON.parse(pref.quiet_hours),
      },
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('Fetch preferences error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = getVerifiedUserId(req);

    const rawBody = await req.json();
    const parseResult = PreferencesPostSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parseResult.error.format() },
        { status: 400 }
      );
    }

    const {
      channels_enabled,
      alert_types_subscribed,
      quiet_hours,
      min_confidence_threshold,
      whatsapp_number,
      telegram_chat_id,
    } = parseResult.data;

    const data: any = {};
    if (channels_enabled !== undefined) data.channels_enabled = JSON.stringify(channels_enabled);
    if (alert_types_subscribed !== undefined) data.alert_types_subscribed = JSON.stringify(alert_types_subscribed);
    if (quiet_hours !== undefined) data.quiet_hours = JSON.stringify(quiet_hours);
    if (min_confidence_threshold !== undefined) data.min_confidence_threshold = min_confidence_threshold;
    if (whatsapp_number !== undefined) data.whatsapp_number = whatsapp_number;
    if (telegram_chat_id !== undefined) data.telegram_chat_id = telegram_chat_id;

    const pref = await prisma.alertPreference.upsert({
      where: { user_id: userId },
      update: data,
      create: { user_id: userId, ...data },
    });

    return NextResponse.json({
      success: true,
      preference: {
        ...pref,
        channels_enabled: JSON.parse(pref.channels_enabled),
        alert_types_subscribed: JSON.parse(pref.alert_types_subscribed),
        quiet_hours: JSON.parse(pref.quiet_hours),
      },
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    console.error('Update preferences error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
