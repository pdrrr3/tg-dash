'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRefreshPortfolio } from '@/hooks/use-portfolio';

interface HeaderProps {
  lastUpdated?: string;
}

export function Header({ lastUpdated }: HeaderProps) {
  const { mutate: refresh, isPending } = useRefreshPortfolio();

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio Dashboard</h1>
        <Badge variant="outline" className="hidden sm:inline-flex">
          Polymarket
        </Badge>
      </div>
      <div className="flex items-center gap-4">
        {lastUpdated && (
          <span className="text-sm text-muted-foreground">
            Last updated: {new Date(lastUpdated).toLocaleString()}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh()}
          disabled={isPending}
        >
          {isPending ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>
    </header>
  );
}
