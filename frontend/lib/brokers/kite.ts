/**
 * Zerodha Kite Connect Broker Adapter Implementation
 * 
 * REQUIRED ENVIRONMENT VARIABLES:
 * - KITE_API_KEY      : Zerodha Developer API Key
 * - KITE_API_SECRET   : Zerodha Developer API Secret
 * - KITE_REDIRECT_URL : OAuth Callback URL (default: http://localhost:3000/api/broker/kite/callback)
 * - KITE_SANDBOX      : Set to "true" to allow dev simulation mode without real Kite API credentials
 */

import crypto from 'node:crypto';
import type {
  BrokerAdapter,
  BrokerType,
  OrderParams,
  OrderResponse,
  OrderStatus,
  PositionItem,
  MarginBalance,
  ProductType,
} from './interface';

export class KiteBrokerAdapter implements BrokerAdapter {
  brokerName: BrokerType = 'KITE';

  private apiKey = process.env.KITE_API_KEY;
  private isSandbox = process.env.KITE_SANDBOX === 'true';

  async placeOrder(accessToken: string, params: OrderParams): Promise<OrderResponse> {
    if (!accessToken) {
      return { success: false, status: 'REJECTED', message: 'Kite access token missing or expired.' };
    }

    if (!this.apiKey) {
      if (!this.isSandbox) {
        return {
          success: false,
          status: 'REJECTED',
          message: 'Kite Connect API key not configured and KITE_SANDBOX is not enabled.',
        };
      }

      // Explicit KITE_SANDBOX mode: generate deterministic UUID-based mock order ID (no Math.random)
      const mockOrderId = `240727${crypto.randomUUID().replace(/\D/g, '').slice(0, 8)}`;
      console.log(`[Kite Sandbox Order] ${params.transaction_type} ${params.quantity}x ${params.symbol} @ ₹${params.price || 'MKT'} (${params.product_type})`);
      
      return {
        success: true,
        broker_order_id: mockOrderId,
        status: 'COMPLETE',
        message: 'Order executed successfully via Zerodha Kite Connect (Sandbox).',
        raw_response: { order_id: mockOrderId, status: 'COMPLETE', exchange_order_id: `NSE_${mockOrderId}` },
      };
    }

    try {
      const formParams = new URLSearchParams({
        tradingsymbol: params.symbol,
        exchange: 'NSE',
        transaction_type: params.transaction_type,
        order_type: params.order_type,
        quantity: params.quantity.toString(),
        product: params.product_type,
        validity: 'DAY',
        ...(params.price ? { price: params.price.toString() } : {}),
        ...(params.trigger_price ? { trigger_price: params.trigger_price.toString() } : {}),
      });

      const res = await fetch('https://api.kite.trade/orders/regular', {
        method: 'POST',
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${this.apiKey}:${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formParams,
      });

      const data = await res.json();
      if (data.status === 'error') {
        return {
          success: false,
          status: 'REJECTED',
          message: data.message || 'Kite order placement failed',
          raw_response: data,
        };
      }

      return {
        success: true,
        broker_order_id: data.data.order_id,
        status: 'PLACED',
        message: 'Order submitted to Zerodha Kite Connect',
        raw_response: data,
      };
    } catch (err: any) {
      console.error('[Kite Order Error]', err.message);
      return {
        success: false,
        status: 'REJECTED',
        message: err.message || 'Network error communicating with Zerodha Kite API',
      };
    }
  }

  async getOrderStatus(accessToken: string, orderId: string): Promise<OrderStatus> {
    if (!this.apiKey) {
      if (this.isSandbox) return 'COMPLETE';
      return 'REJECTED';
    }

    try {
      const res = await fetch(`https://api.kite.trade/orders/${orderId}`, {
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${this.apiKey}:${accessToken}`,
        },
      });
      const data = await res.json();
      if (data.status === 'success' && data.data && data.data.length > 0) {
        const lastState = data.data[data.data.length - 1].status;
        if (lastState === 'COMPLETE') return 'COMPLETE';
        if (lastState === 'REJECTED') return 'REJECTED';
        if (lastState === 'CANCELLED') return 'CANCELLED';
      }
      return 'PLACED';
    } catch (e) {
      return 'PLACED';
    }
  }

  async getPositions(accessToken: string): Promise<PositionItem[]> {
    if (!this.apiKey) {
      if (this.isSandbox) {
        return [
          { symbol: 'RELIANCE', quantity: 50, average_price: 2410, last_price: 2450, pnl: 2000, product: 'CNC' },
          { symbol: 'TCS', quantity: 25, average_price: 3820, last_price: 3800, pnl: -500, product: 'CNC' },
        ];
      }
      return [];
    }

    try {
      const res = await fetch('https://api.kite.trade/portfolio/positions', {
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${this.apiKey}:${accessToken}`,
        },
      });
      const data = await res.json();
      if (data.status === 'success') {
        return (data.data.net || []).map((p: any) => ({
          symbol: p.tradingsymbol,
          quantity: p.quantity,
          average_price: p.average_price,
          last_price: p.last_price,
          pnl: p.pnl,
          product: p.product as ProductType,
        }));
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  async getFunds(accessToken: string): Promise<MarginBalance> {
    if (!this.apiKey) {
      if (this.isSandbox) {
        return {
          available_cash: 850000,
          used_margin: 333500,
          total_collateral: 1183500,
        };
      }
      throw new Error('Kite API key not configured and KITE_SANDBOX is not enabled.');
    }

    try {
      const res = await fetch('https://api.kite.trade/user/margins', {
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${this.apiKey}:${accessToken}`,
        },
      });
      const data = await res.json();
      if (data.status === 'success' && data.data && data.data.equity) {
        const eq = data.data.equity;
        return {
          available_cash: Number(eq.available?.live_balance ?? 0),
          used_margin: Number(eq.utilised?.debits ?? 0),
          total_collateral: Number(eq.net ?? 0),
        };
      }
      return { available_cash: 0, used_margin: 0, total_collateral: 0 };
    } catch (e: any) {
      console.error('[Kite getFunds error]', e);
      throw new Error(`Failed to fetch live margin from Kite API: ${e.message}`);
    }
  }

  async cancelOrder(accessToken: string, orderId: string): Promise<boolean> {
    if (!this.apiKey) {
      return this.isSandbox;
    }
    try {
      const res = await fetch(`https://api.kite.trade/orders/regular/${orderId}`, {
        method: 'DELETE',
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${this.apiKey}:${accessToken}`,
        },
      });
      const data = await res.json();
      return data.status === 'success';
    } catch (e) {
      return false;
    }
  }
}

export const kiteAdapter = new KiteBrokerAdapter();
