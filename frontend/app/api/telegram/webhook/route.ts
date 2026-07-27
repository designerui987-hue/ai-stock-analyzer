import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = body.message || body.edited_message;

    if (message && message.chat && message.text) {
      const chatId = message.chat.id.toString();
      const text = message.text.trim();

      // Telegram /start deep link format: /start demo_user
      if (text.startsWith('/start')) {
        const parts = text.split(' ');
        const userId = parts[1] || 'demo_user';

        await prisma.alertPreference.upsert({
          where: { user_id: userId },
          update: {
            telegram_chat_id: chatId,
            channels_enabled: JSON.stringify({
              web_push: true,
              telegram: true,
              whatsapp: false,
            }),
          },
          create: {
            user_id: userId,
            telegram_chat_id: chatId,
            channels_enabled: JSON.stringify({
              web_push: true,
              telegram: true,
              whatsapp: false,
            }),
          },
        });

        // Send confirmation message back to user via Telegram Bot API
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (token) {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `✅ <b>StockAI Alerts Connected!</b>\nYour Telegram chat has been linked to account <code>${userId}</code>. You will now receive instant AI signal alerts here.`,
              parse_mode: 'HTML',
            }),
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Telegram Webhook Error:', err);
    return NextResponse.json({ ok: true }); // Always return 200 to Telegram
  }
}
