/**
 * WhatsApp Business Cloud API Channel Sender (Meta)
 * 
 * REQUIRED ENVIRONMENT VARIABLES:
 * - WHATSAPP_ACCESS_TOKEN     : Meta System User Permanent Access Token
 * - WHATSAPP_PHONE_NUMBER_ID : Meta WhatsApp Business Phone Number ID
 * - WHATSAPP_TEMPLATE_NAME   : Approved Meta message template name (default: "stock_signal_alert")
 * 
 * IMPORTANT ACCOUNT NOTICE:
 * Meta requires a verified Meta Business Account (WABA) and template message approval.
 * Outbound WhatsApp messages will return a pending/account-unapproved notice until WABA approval is complete.
 */

export interface WhatsAppPayload {
  phoneNumber: string;
  symbol: string;
  signalType: string;
  price: string;
  targetPrice: string;
  stopLoss: string;
  confidence: string;
}

export async function sendWhatsAppAlert(
  phoneNumber: string | null,
  payload: WhatsAppPayload
): Promise<{ success: boolean; error?: string }> {
  if (!phoneNumber) {
    return { success: false, error: 'WhatsApp phone number missing' };
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    // Simulated delivery for development mode
    console.log(`[WhatsApp Mock Send to ${phoneNumber}]:`, `${payload.signalType} ${payload.symbol} @ ₹${payload.price}`);
    return { success: true };
  }

  try {
    const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'stock_signal_alert';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: payload.signalType },
                { type: 'text', text: payload.symbol },
                { type: 'text', text: payload.price },
                { type: 'text', text: payload.targetPrice },
                { type: 'text', text: payload.stopLoss },
                { type: 'text', text: payload.confidence },
              ],
            },
          ],
        },
      }),
    });

    const data = await res.json();
    if (data.error) {
      console.error('[WhatsApp Send Error]', data.error.message);
      return { success: false, error: data.error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[WhatsApp Send Failed]', err.message);
    return { success: false, error: err.message };
  }
}
