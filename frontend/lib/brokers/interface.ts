export type BrokerType = 'KITE' | 'UPSTOX' | 'ANGELONE';
export type TransactionType = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL_M';
export type ProductType = 'CNC' | 'MIS' | 'NRML';
export type OrderStatus = 'PLACED' | 'COMPLETE' | 'REJECTED' | 'CANCELLED';

export interface OrderParams {
  symbol: string;
  transaction_type: TransactionType;
  quantity: number;
  order_type: OrderType;
  product_type: ProductType;
  price?: number;
  trigger_price?: number;
  signal_id?: string;
}

export interface OrderResponse {
  success: boolean;
  broker_order_id?: string;
  status: OrderStatus;
  message?: string;
  raw_response?: any;
}

export interface PositionItem {
  symbol: string;
  quantity: number;
  average_price: number;
  last_price: number;
  pnl: number;
  product: ProductType;
}

export interface MarginBalance {
  available_cash: number;
  used_margin: number;
  total_collateral: number;
}

export interface BrokerAdapter {
  brokerName: BrokerType;
  placeOrder(accessToken: string, params: OrderParams): Promise<OrderResponse>;
  getOrderStatus(accessToken: string, orderId: string): Promise<OrderStatus>;
  getPositions(accessToken: string): Promise<PositionItem[]>;
  getFunds(accessToken: string): Promise<MarginBalance>;
  cancelOrder(accessToken: string, orderId: string): Promise<boolean>;
}
