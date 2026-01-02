import type { PortfolioSnapshot, Position, CopyTradingEvent } from '@/generated/prisma/client';

// Re-export Prisma types for convenience
export type { PortfolioSnapshot, Position, CopyTradingEvent };

// Snapshot with positions included
export type PortfolioSnapshotWithPositions = PortfolioSnapshot & {
  positions: Position[];
};

// Input types for creating records (without id)
export type PortfolioSnapshotInput = Omit<PortfolioSnapshot, 'id' | 'positions'>;
export type PositionInput = Omit<Position, 'id' | 'snapshot'>;
export type CopyTradingEventInput = Omit<CopyTradingEvent, 'id'>;

// Parsed portfolio from Telegram bot message
export interface ParsedPortfolio {
  snapshot: PortfolioSnapshotInput;
  positions: Omit<PositionInput, 'snapshotId'>[];
}

// Balance history item for charts
export interface BalanceHistoryItem {
  timestamp: string;
  totalBalance: number;
  invested: number;
}

// Invested by trader for chart breakdown
export interface InvestedByTrader {
  timestamp: string;
  trader: string;
  invested: number;
}

// Time range options for balance history
export type TimeRange = '24h' | '48h' | '3d' | '7d' | 'all';
