/**
 * Telegram Bot API Channel Sender
 * 
 * REQUIRED ENVIRONMENT VARIABLES:
 * - TELEGRAM_BOT_TOKEN : Token obtained from @BotFather (e.g., "712345678:AAFg...")
 * - TELEGRAM_BOT_USERNAME: Bot handle without @ (e.g., "StockAINotifierBot")
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a bot via @BotFather on Telegram to get your TELEGRAM_BOT_TOKEN.
 * 2. Set the token in .env and point bot webhook to /api/telegram/webhook.
 */

export interface TelegramMessagePayload {
  text: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
}

export async function sendTelegramAlert(
  chatId: string | null,
  payload: TelegramMessagePayload
): Promise<{ success: boolean; error?: string }> {
  if (!chatId) {
    return { success: false, error: 'Telegram account not linked (chat_id missing)' };
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    // Simulated delivery for development/demo mode
    console.log(`[Telegram Mock Send to Chat ${chatId}]:`, payload.text);
    return { success: true };
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: payload.text,
        parse_mode: payload.parse_mode || 'HTML',
        disable_web_page_preview: false,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('[Telegram Send Error]', data.description);
      return { success: false, error: data.description };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[Telegram Send Failed]', err.message);
    return { success: false, error: err.message };
  }
}
