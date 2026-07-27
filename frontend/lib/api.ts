const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

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
    }
  },

  removeToken: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
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
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      // Token expired or invalid
      auth.removeToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Authentication required');
    }

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`API Error [${endpoint}]: ${res.status} - ${errorText}`);
      throw new Error(`API error: ${res.status}`);
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

  // Stocks
  searchStocks: (q: string) => fetchAPI(`/api/stocks/search?q=${q}`),
  listStocks: () => fetchAPI('/api/stocks/list'),
  getStockAnalysis: (symbol: string) => fetchAPI(`/api/stocks/${symbol}`),
  getChartData: (symbol: string, period: string = '1Y') =>
    fetchAPI(`/api/stocks/${symbol}/chart?period=${period}`),
  getAIPicks: () => fetchAPI('/api/stocks/RELIANCE/ai-picks'),

  // Portfolio
  getPortfolio: () => fetchAPI('/api/portfolio/'),
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
};
