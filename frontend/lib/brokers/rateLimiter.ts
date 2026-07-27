// In-memory rate limiting tracker: max 1 order per symbol per 60 seconds per user
const recentOrdersMap: Record<string, number> = {};

export function isOrderRateLimited(userId: string, symbol: string, nowMs = Date.now()): boolean {
  const key = `${userId}:${symbol.toUpperCase()}`;
  const lastTime = recentOrdersMap[key];
  if (lastTime && nowMs - lastTime < 60 * 1000) {
    return true; // Rate limited
  }
  recentOrdersMap[key] = nowMs;
  return false;
}
