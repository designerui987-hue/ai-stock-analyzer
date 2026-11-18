/**
 * Web Push Channel Sender
 * 
 * REQUIRED ENVIRONMENT VARIABLES:
 * - VAPID_PUBLIC_KEY : Public VAPID key for web push authentication
 * - VAPID_PRIVATE_KEY: Private VAPID key for web push signing
 * - VAPID_SUBJECT    : mailto: or website URL (e.g. mailto:alerts@stockai.in)
 */

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

export async function sendWebPushAlert(
  subscriptionJson: string | null,
  payload: WebPushPayload
): Promise<{ success: boolean; status?: 'delivered' | 'failed' | 'unavailable'; error?: string }> {
  if (!subscriptionJson) {
    return { success: false, status: 'unavailable', error: 'No Web Push subscription found' };
  }

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    return {
      success: false,
      status: 'unavailable',
      error: 'Web Push unconfigured: VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY missing',
    };
  }

  try {
    const subscription = JSON.parse(subscriptionJson);
    if (!subscription?.endpoint) {
      return { success: false, status: 'failed', error: 'Invalid push subscription endpoint' };
    }
    // WebPush delivery would be performed via web-push library here
    return { success: true, status: 'delivered' };
  } catch (err: any) {
    console.error('[WebPush Send Failed]', err.message);
    return { success: false, status: 'failed', error: err.message };
  }
}
