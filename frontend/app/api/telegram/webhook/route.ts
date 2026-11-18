import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    // 1. Webhook Secret Token Verification
    const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (configuredSecret) {
      const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token');
      if (!incomingSecret || incomingSecret !== configuredSecret) {
        return NextResponse.json({ ok: false, error: 'Unauthorized webhook request' }, { status: 401 });
      }
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 });
    }

    const message = body.message || body.edited_message;
    if (!message || !message.chat || !message.text) {
      return NextResponse.json({ ok: true, message: 'No actionable message' });
    }

    const chatId = message.chat.id.toString();
    const text = message.text.trim();

    // 2. Process /start command with link token
    if (text.startsWith('/start')) {
      const parts = text.split(/\s+/);
      const linkToken = parts[1]?.trim();

      if (!linkToken) {
        return NextResponse.json({ ok: false, error: 'Account link token required' }, { status: 400 });
      }

      // Reject direct unauthenticated user IDs (e.g. /start user_123)
      if (!linkToken.startsWith('tg_')) {
        return NextResponse.json({ ok: false, error: 'Invalid link token format. Please generate a link token from Settings.' }, { status: 400 });
      }

      // Look up unexpired, unused token
      const now = new Date();
      const stateRecord = await prisma.oAuthState.findFirst({
        where: {
          nonce: linkToken,
          used: false,
          expires_at: { gt: now },
        },
      });

      if (!stateRecord) {
        return NextResponse.json(
          { ok: false, error: 'Invalid, expired, or already used link token' },
          { status: 400 }
        );
      }

      // Atomically mark used to prevent concurrent replay attacks
      const updateResult = await prisma.oAuthState.updateMany({
        where: {
          id: stateRecord.id,
          used: false,
        },
        data: {
          used: true,
        },
      });

      if (updateResult.count === 0) {
        return NextResponse.json(
          { ok: false, error: 'Link token was already consumed' },
          { status: 409 }
        );
      }

      const userId = stateRecord.user_id;

      // 3. Preserve existing notification preferences
      const existing = await prisma.alertPreference.findUnique({
        where: { user_id: userId },
      });

      let channels = { web_push: true, telegram: true, whatsapp: false };
      if (existing?.channels_enabled) {
        try {
          const parsed = JSON.parse(existing.channels_enabled);
          channels = { ...parsed, telegram: true };
        } catch {
          channels.telegram = true;
        }
      }

      await prisma.alertPreference.upsert({
        where: { user_id: userId },
        update: {
          telegram_chat_id: chatId,
          channels_enabled: JSON.stringify(channels),
        },
        create: {
          user_id: userId,
          telegram_chat_id: chatId,
          channels_enabled: JSON.stringify(channels),
        },
      });

      // 4. Send confirmation message back to user via Telegram Bot API
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `✅ <b>StockAI Alerts Connected!</b>\nYour Telegram chat has been securely linked to your account. You will now receive quantitative alerts here.`,
            parse_mode: 'HTML',
          }),
        }).catch((err) => console.error('Telegram bot sendMessage error:', err));
      }

      return NextResponse.json({ ok: true, linked: true, user_id: userId });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram Webhook Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
