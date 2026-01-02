'use client';

import { useState } from 'react';
import { Header } from '@/components/dashboard/header';
import { BalanceCards } from '@/components/dashboard/balance-cards';
import { BalanceChart } from '@/components/dashboard/balance-chart';
import { PositionsTable } from '@/components/dashboard/positions-table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePortfolio } from '@/hooks/use-portfolio';
import type { TimeRange } from '@/lib/types';

export default function DashboardPage() {
  const [chartRange, setChartRange] = useState<TimeRange>('7d');
  const { data: portfolio, isLoading, error } = usePortfolio();

  if (error) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <Header />
          <Alert variant="destructive" className="mt-6">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Failed to load portfolio data'}
            </AlertDescription>
          </Alert>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Header lastUpdated={portfolio?.timestamp} />

        {isLoading ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-[100px]" />
              ))}
            </div>
            <Skeleton className="h-[400px]" />
            <Skeleton className="h-[300px]" />
          </div>
        ) : portfolio ? (
          <>
            <BalanceCards
              totalBalance={portfolio.totalBalance}
              availableBalance={portfolio.availableBalance}
              invested={portfolio.invested}
              totalPnlUsd={portfolio.totalPnlUsd}
              totalPnlPct={portfolio.totalPnlPct}
            />

            <BalanceChart range={chartRange} onRangeChange={setChartRange} />

            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Positions</h2>
              <PositionsTable positions={portfolio.positions} />
            </div>
          </>
        ) : (
          <Alert>
            <AlertTitle>No Data</AlertTitle>
            <AlertDescription>
              No portfolio data available. Click Refresh to fetch the latest data.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </main>
  );
}
