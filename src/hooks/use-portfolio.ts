'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PortfolioSnapshotWithPositions } from '@/lib/types';

export function usePortfolio() {
  return useQuery<PortfolioSnapshotWithPositions>({
    queryKey: ['portfolio', 'latest'],
    queryFn: async () => {
      const response = await fetch('/api/portfolio/latest');
      if (!response.ok) {
        throw new Error('Failed to fetch portfolio');
      }
      return response.json();
    },
  });
}

export function useRefreshPortfolio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/refresh', { method: 'POST' });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to refresh portfolio');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate portfolio queries to refetch
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['balanceHistory'] });
    },
  });
}
