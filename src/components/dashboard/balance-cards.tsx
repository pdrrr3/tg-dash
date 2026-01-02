'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface BalanceCardsProps {
  totalBalance: number;
  availableBalance: number;
  invested: number;
  totalPnlUsd: number;
  totalPnlPct: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function BalanceCards({
  totalBalance,
  availableBalance,
  invested,
  totalPnlUsd,
  totalPnlPct,
}: BalanceCardsProps) {
  const isPnlPositive = totalPnlUsd >= 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="bg-white/80 backdrop-blur-xl border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalBalance)}</div>
        </CardContent>
      </Card>

      <Card className="bg-white/80 backdrop-blur-xl border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Available
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(availableBalance)}</div>
        </CardContent>
      </Card>

      <Card className="bg-white/80 backdrop-blur-xl border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Invested
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(invested)}</div>
        </CardContent>
      </Card>

      <Card className="bg-white/80 backdrop-blur-xl border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total P&L
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'text-2xl font-bold',
                isPnlPositive ? 'text-green-500' : 'text-red-500'
              )}
            >
              {formatCurrency(totalPnlUsd)}
            </span>
            <span
              className={cn(
                'text-sm font-medium',
                isPnlPositive ? 'text-green-500' : 'text-red-500'
              )}
            >
              {formatPercent(totalPnlPct)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
