'use client';

import { useQuery } from '@tanstack/react-query';
import type { BalanceHistoryItem, InvestedByTrader, TimeRange } from '@/lib/types';
import type { CopyTradingEvent } from '@/generated/prisma/client';

interface BalanceHistoryResponse {
  history: BalanceHistoryItem[];
  events: CopyTradingEvent[];
  investedByTrader: InvestedByTrader[];
}

export function useBalanceHistory(range: TimeRange = '7d') {
  return useQuery<BalanceHistoryResponse>({
    queryKey: ['balanceHistory', range],
    queryFn: async () => {
      const response = await fetch(`/api/portfolio/balance-history?range=${range}`);
      if (!response.ok) {
        throw new Error('Failed to fetch balance history');
      }
      return response.json();
    },
  });
}
