export interface PortfolioSnapshot {
  id?: number;
  total_balance: number;
  available_balance: number;
  invested: number;
  value: number;
  total_pnl_usd: number;
  total_pnl_pct: number;
  timestamp: string;
  total_positions?: number; // Total positions count from bot message
}

export interface Position {
  id?: number;
  snapshot_id?: number;
  market_question: string;
  side: 'Yes' | 'No';
  entry_price: number;
  invested: number;
  shares: number;
  value: number;
  pnl_usd: number;
  pnl_pct: number;
  expiry_timestamp: string | null;
  copied_from: string | null;
}

export interface ParsedPortfolio {
  snapshot: PortfolioSnapshot;
  positions: Position[];
}

export interface CopyTradingEvent {
  id?: number;
  timestamp: string;
  event_type: 'copier_added' | 'copier_removed' | 'settings_changed';
  description: string;
  trader_name?: string;
}

