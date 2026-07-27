import { prisma } from '../prisma.ts';
import { sendWebPushAlert } from './webPush.ts';
import { sendTelegramAlert } from './telegram.ts';
import { sendWhatsAppAlert } from './whatsapp.ts';

export type AlertType =
  | 'new_signal'
  | 'target_hit'
  | 'sl_hit'
  | 'breakout'
  | 'risk_warning'
  | 'watchlist_move';

export interface AlertPayload {
  symbol: string;
  signal_type: 'BUY' | 'SELL';
  price: number;
  entry_price?: number;
  target_price?: number;
  stop_loss_price?: number;
  confidence_pct: number;
  rationale?: string;
  closed_price?: number;
  pnl_pct?: number;
  custom_message?: string;
}

// In-memory rate limiting tracker (max 20 alerts / hour per user)
const userHourlyAlertCounts: Record<string, { count: number; windowStart: number }> = {};

export function isRateLimited(userId: string, maxPerHour = 20, nowMs = Date.now()): boolean {
  const windowSizeMs = 60 * 60 * 1000;
  const userRate = userHourlyAlertCounts[userId];

  if (!userRate || nowMs - userRate.windowStart > windowSizeMs) {
    userHourlyAlertCounts[userId] = { count: 1, windowStart: nowMs };
    return false;
  }

  if (userRate.count >= maxPerHour) {
    return true;
  }

  userRate.count += 1;
  return false;
}

export function isQuietHoursActive(
  quietHoursJson: string | null | undefined,
  currentDate = new Date()
): boolean {
  if (!quietHoursJson) return false;

  try {
    const qh = typeof quietHoursJson === 'string' ? JSON.parse(quietHoursJson) : quietHoursJson;
    if (!qh.enabled || !qh.start || !qh.end) return false;

    const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
    const [startH, startM] = qh.start.split(':').map(Number);
    const [endH, endM] = qh.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Spans midnight (e.g. 22:00 to 07:00)
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  } catch (e) {
    return false;
  }
}

export function shouldSendAlert(
  pref: {
    channels_enabled?: string;
    alert_types_subscribed?: string;
    quiet_hours?: string;
    min_confidence_threshold?: number;
  },
  alertType: AlertType,
  confidencePct: number,
  channel: 'web_push' | 'telegram' | 'whatsapp',
  currentDate = new Date()
): { send: boolean; reason?: string } {
  // 1. Strict Minimum Confidence Threshold Check (No exceptions)
  const minConf = pref.min_confidence_threshold ?? 70;
  if (confidencePct < minConf) {
    return { send: false, reason: `Confidence ${confidencePct}% below threshold ${minConf}%` };
  }

  // 2. Alert Type Subscription Check
  try {
    const types = typeof pref.alert_types_subscribed === 'string'
      ? JSON.parse(pref.alert_types_subscribed)
      : pref.alert_types_subscribed;
    if (types && types[alertType] === false) {
      return { send: false, reason: `Subscribed alert types disabled for ${alertType}` };
    }
  } catch (e) {}

  // 3. Channel Enabled Check
  try {
    const channels = typeof pref.channels_enabled === 'string'
      ? JSON.parse(pref.channels_enabled)
      : pref.channels_enabled;
    if (channels && channels[channel] === false) {
      return { send: false, reason: `Channel ${channel} disabled in preferences` };
    }
  } catch (e) {}

  // 4. Quiet Hours Check (SL_HIT & risk_warning ALWAYS override quiet hours for capital protection)
  const isUrgent = alertType === 'sl_hit' || alertType === 'risk_warning';
  if (!isUrgent && isQuietHoursActive(pref.quiet_hours, currentDate)) {
    return { send: false, reason: 'Blocked by quiet hours schedule' };
  }

  return { send: true };
}

export function formatAlertText(alertType: AlertType, p: AlertPayload): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const stockUrl = `${baseUrl}/stocks/${p.symbol}`;

  if (alertType === 'new_signal') {
    const icon = p.signal_type === 'BUY' ? '🟢' : '🔴';
    return `${icon} ${p.signal_type} ${p.symbol} @ ₹${p.price.toFixed(2)} | Target ₹${p.target_price?.toFixed(2) || '-'} | SL ₹${p.stop_loss_price?.toFixed(2) || '-'} | Conf ${p.confidence_pct}% | ${p.rationale || 'Breakout detected'}\n👉 View: ${stockUrl}`;
  }

  if (alertType === 'target_hit') {
    return `🎯 TARGET HIT: ${p.symbol} | Entry ₹${p.entry_price?.toFixed(2)} → Closed ₹${p.closed_price?.toFixed(2)} | +${p.pnl_pct?.toFixed(2)}%\n👉 Details: ${stockUrl}`;
  }

  if (alertType === 'sl_hit') {
    return `🔴 STOP-LOSS HIT: ${p.symbol} | Entry ₹${p.entry_price?.toFixed(2)} → Closed ₹${p.closed_price?.toFixed(2)} | ${p.pnl_pct?.toFixed(2)}%\n👉 Details: ${stockUrl}`;
  }

  if (alertType === 'risk_warning') {
    return `⚠️ RISK WARNING: ${p.symbol} | ${p.custom_message || 'Volatility spike detected'}\n👉 View: ${stockUrl}`;
  }

  return `🔔 ALERT [${p.symbol}]: ${p.custom_message || 'Price movement alert'}\n👉 View: ${stockUrl}`;
}

export async function sendAlert(
  userId = 'demo_user',
  alertType: AlertType,
  payload: AlertPayload
): Promise<{ dispatched: number; logged: number }> {
  try {
    let pref = await prisma.alertPreference.findUnique({
      where: { user_id: userId },
    });

    if (!pref) {
      pref = await prisma.alertPreference.create({
        data: { user_id: userId },
      });
    }

    if (isRateLimited(userId)) {
      console.warn(`[Alert Dispatcher] User ${userId} rate limited (>20 alerts/hr).`);
      await prisma.alertLog.create({
        data: {
          user_id: userId,
          channel: 'ALL',
          alert_type: alertType.toUpperCase(),
          symbol: payload.symbol,
          message_body: formatAlertText(alertType, payload),
          delivery_status: 'FAILED',
        },
      });
      return { dispatched: 0, logged: 1 };
    }

    const messageText = formatAlertText(alertType, payload);
    const channels: ('web_push' | 'telegram' | 'whatsapp')[] = ['web_push', 'telegram', 'whatsapp'];
    let dispatched = 0;
    let logged = 0;

    for (const channel of channels) {
      const decision = shouldSendAlert(pref, alertType, payload.confidence_pct, channel);

      if (!decision.send) {
        console.log(`[Alert Filtered] ${channel}: ${decision.reason}`);
        continue;
      }

      let status = 'SENT';

      if (channel === 'web_push') {
        const res = await sendWebPushAlert(pref.web_push_subscription, {
          title: `StockAI: ${payload.symbol}`,
          body: messageText,
          url: `/stocks/${payload.symbol}`,
        });
        if (!res.success) status = 'FAILED';
      } else if (channel === 'telegram') {
        const res = await sendTelegramAlert(pref.telegram_chat_id, { text: messageText });
        if (!res.success) status = 'FAILED';
      } else if (channel === 'whatsapp') {
        const res = await sendWhatsAppAlert(pref.whatsapp_number, {
          phoneNumber: pref.whatsapp_number || '',
          symbol: payload.symbol,
          signalType: payload.signal_type,
          price: payload.price.toString(),
          targetPrice: payload.target_price?.toString() || '',
          stopLoss: payload.stop_loss_price?.toString() || '',
          confidence: payload.confidence_pct.toString(),
        });
        if (!res.success) status = 'FAILED';
      }

      await prisma.alertLog.create({
        data: {
          user_id: userId,
          channel: channel.toUpperCase(),
          alert_type: alertType.toUpperCase(),
          symbol: payload.symbol,
          message_body: messageText,
          delivery_status: status,
        },
      });

      dispatched++;
      logged++;
    }

    return { dispatched, logged };
  } catch (err: any) {
    console.error('[Alert Dispatcher Error]', err);
    return { dispatched: 0, logged: 0 };
  }
}
