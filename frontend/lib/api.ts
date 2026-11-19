const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Resolve backend URL for Next.js Route Handlers (server-side only).
 * Fails closed in production if BACKEND_API_URL / NEXT_PUBLIC_API_URL is missing.
 */
export function getServerBackendUrl(): string {
  const configured = (process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BACKEND_API_URL or NEXT_PUBLIC_API_URL must be configured in production.');
  }
  return 'http://localhost:8000';
}

// JWT token management
export const auth = {
  getToken: () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auth_token');
    }
    return null;
  },

  setToken: (token: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `auth_token=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax${secure}`;
    }
  },

  removeToken: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
    }
  },

  getAuthHeaders: (): Record<string, string> => {
    const token = auth.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  },

  isAuthenticated: () => {
    const token = auth.getToken();
    if (!token) return false;

    try {
      // Basic check - decode JWT to check expiration
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Date.now() / 1000;
      return payload.exp > currentTime;
    } catch {
      return false;
    }
  },

  getUser: (): { id: string; email?: string; username?: string } | null => {
    const token = auth.getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return {
        id: String(payload.sub),
        email: payload.email || '',
        username: payload.username || '',
      };
    } catch {
      return null;
    }
  }
};

export async function fetchAPI(endpoint: string, options?: RequestInit) {
  const token = auth.getToken();

  // Build headers properly
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  
  // Add any provided headers
  if (options?.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers.set(key, value);
      });
    } else if (Array.isArray(options.headers)) {
      options.headers.forEach(([key, value]) => {
        headers.set(key, value);
      });
    } else {
      Object.entries(options.headers).forEach(([key, value]) => {
        if (value !== undefined) {
          headers.set(key, String(value));
        }
      });
    }
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const baseUrl = /^\/api\/watchlist(?:\?|$)/.test(endpoint) ? '' : API_BASE;
    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (res.status === 401 && token && !endpoint.startsWith('/api/auth/')) {
      // Token expired or invalid
      auth.removeToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Authentication required');
    }

    if (!res.ok) {
      let errorMsg = `API error: ${res.status}`;
      try {
        const errorJson = await res.clone().json();
        if (errorJson?.detail) {
          errorMsg = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
        } else if (typeof errorJson?.error === 'string') {
          errorMsg = errorJson.error;
        }
      } catch {
        const errorText = await res.text().catch(() => '');
        if (errorText) errorMsg = errorText;
      }
      console.error(`API Error [${endpoint}]: ${res.status} - ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    return res.json();
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error; // Re-throw to let caller handle it
  }
}

// Authentication functions
export const authAPI = {
  register: async (email: string, username: string, password: string) => {
    const response = await fetchAPI('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password }),
    });

    if (response?.access_token) {
      auth.setToken(response.access_token);
    }

    return response;
  },

  login: async (email: string, password: string) => {
    const response = await fetchAPI('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response?.access_token) {
      auth.setToken(response.access_token);
    }

    return response;
  },

  logout: () => {
    auth.removeToken();
  }
};

export const api = {
  // Market
  getMarketOverview: () => fetchAPI('/api/market/overview'),
  getTopGainers: () => fetchAPI('/api/market/gainers'),
  getTopLosers: () => fetchAPI('/api/market/losers'),
  getSectors: () => fetchAPI('/api/market/sectors'),
  getHeatmap: () => fetchAPI('/api/market/heatmap'),
  getNews: () => fetchAPI('/api/market/news'),

  // Stocks (Unified backend data layer as single source of truth)
  searchStocks: (q: string) => fetchAPI(`/api/stocks/search?q=${q}`),
  listStocks: () => fetchAPI('/api/stocks/list'),
  getStockAnalysis: (symbol: string) => fetchAPI(`/api/stocks/${symbol}`),
  getResearchChanges: (symbol: string, exchange = 'NSE') =>
    fetchAPI(`/api/stocks/${encodeURIComponent(symbol)}/changes?exchange=${encodeURIComponent(exchange)}`),
  getPersonalizedBrief: () => fetchAPI('/api/stocks/brief/personalized'),
  getChartData: (symbol: string, period: string = '1Y') =>
    fetchAPI(`/api/stocks/${symbol}/chart?period=${period}`),
  getQuoteData: (symbol: string, exchange = 'NSE') =>
    fetchAPI(`/api/stocks/quote/${encodeURIComponent(symbol)}?exchange=${encodeURIComponent(exchange)}`),
  getAIPicks: () => fetchAPI('/api/stocks/RELIANCE/ai-picks'),

  // Server-Sent Events (SSE) price stream for watchlist / live tickers without token in URL
  subscribePriceStream: (
    symbols: string[],
    onMessage: (data: any) => void,
    onError?: (err: any) => void
  ) => {
    if (typeof window === 'undefined') return () => {};
    const token = auth.getToken();
    if (!token) {
      if (onError) onError({ code: 'AUTH_REQUIRED' });
      return () => {};
    }
    const symParam = encodeURIComponent(symbols.join(','));
    // Keep session tokens strictly out of URLs (passed via Authorization header & Cookie)
    const url = `${API_BASE}/api/stocks/stream?symbols=${symParam}`;
    let activeController: AbortController | null = null;
    let isCleanedUp = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;
    const MAX_RETRY_DELAY_MS = 15000;
    const INITIAL_RETRY_DELAY_MS = 1000;

    const cancelPendingRetry = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const scheduleReconnect = (reason: string) => {
      if (isCleanedUp) return;
      cancelPendingRetry();
      retryAttempt++;
      const delay = Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * Math.pow(2, retryAttempt - 1));

      if (onError) {
        onError({
          code: 'STREAM_RECONNECTING',
          reason,
          attempt: retryAttempt,
          delayMs: delay,
        });
      }

      retryTimer = setTimeout(() => {
        if (!isCleanedUp) {
          startStream();
        }
      }, delay);
    };

    const startStream = async () => {
      if (isCleanedUp) return;
      cancelPendingRetry();

      // Cancel any previous stream controller to prevent duplicate streams
      if (activeController) {
        activeController.abort();
        activeController = null;
      }

      const controller = new AbortController();
      activeController = controller;

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'text/event-stream',
            'Authorization': `Bearer ${token}`,
          },
          credentials: 'include',
          signal: controller.signal,
        });

        if (!res.ok) {
          if (res.status === 401) {
            // Stop retrying on expired credentials
            if (onError) onError({ code: 'AUTH_EXPIRED', status: 401 });
            return;
          }
          throw new Error(`SSE stream connection failed with HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('Response body is not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        while (!isCleanedUp && activeController === controller) {
          const { done, value } = await reader.read();
          if (done) {
            // Clean EOF from server (e.g. server restart, proxy timeout, network close)
            if (!isCleanedUp && activeController === controller) {
              scheduleReconnect('Clean server EOF received');
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || '';

          for (const msg of messages) {
            const dataLine = msg.split('\n').find((line) => line.startsWith('data: '));
            if (dataLine) {
              try {
                const payload = JSON.parse(dataLine.slice(6).trim());
                retryAttempt = 0;
                onMessage(payload);
              } catch (e) {
                console.warn('Failed to parse SSE price stream event:', e);
              }
            }
          }
        }
      } catch (err: any) {
        if (isCleanedUp || err.name === 'AbortError') return;
        scheduleReconnect(err?.message || 'Network error');
      }
    };

    startStream();

    return () => {
      isCleanedUp = true;
      cancelPendingRetry();
      if (activeController) {
        activeController.abort();
        activeController = null;
      }
    };
  },

  // Portfolio (Authoritative database-backed holdings)
  getPortfolio: () => fetchAPI('/api/portfolio/'),
  addHolding: (symbol: string, qty: number, avg_price: number, exchange = 'NSE') =>
    fetchAPI('/api/portfolio/holdings', {
      method: 'POST',
      body: JSON.stringify({ symbol, qty, avg_price, exchange }),
    }),
  removeHolding: (symbol: string, qty?: number) =>
    fetchAPI(`/api/portfolio/holdings/${encodeURIComponent(symbol)}${qty ? `?qty=${qty}` : ''}`, {
      method: 'DELETE',
    }),
  getPortfolioPerformance: () => fetchAPI('/api/portfolio/performance'),
  getPortfolioSuggestions: () => fetchAPI('/api/portfolio/suggestions'),

  // Assistant
  sendMessage: (message: string) =>
    fetchAPI('/api/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  // Alerts
  getAlerts: () => fetchAPI('/api/alerts/'),
  getUnreadCount: () => fetchAPI('/api/alerts/unread-count'),
  getInsights: () => fetchAPI('/api/alerts/insights'),

  // Watchlist (Persisted per-user in PostgreSQL)
  getWatchlist: () => fetchAPI('/api/watchlist'),
  addToWatchlist: (symbol: string, exchange: string = 'NSE', notes?: string) =>
    fetchAPI('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ symbol, exchange, notes }),
    }),
  removeFromWatchlist: (symbol: string) =>
    fetchAPI(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, {
      method: 'DELETE',
    }),
};
