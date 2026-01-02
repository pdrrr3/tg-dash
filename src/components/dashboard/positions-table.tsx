'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Position } from '@/generated/prisma/client';

interface PositionsTableProps {
  positions: Position[];
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

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function PositionsTable({ positions }: PositionsTableProps) {
  if (positions.length === 0) {
    return (
      <div className="rounded-lg border bg-white/80 backdrop-blur-xl p-8 text-center">
        <p className="text-muted-foreground">No positions found</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white/80 backdrop-blur-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40%]">Market</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Entry</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="text-right">P&L</TableHead>
            <TableHead className="text-right">P&L %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position) => {
            const isPnlPositive = position.pnlUsd >= 0;
            return (
              <TableRow key={position.id} className="hover:bg-muted/50">
                <TableCell className="font-medium">
                  <div className="max-w-md truncate" title={position.marketQuestion}>
                    {escapeHtml(position.marketQuestion)}
                  </div>
                  {position.copiedFrom && (
                    <span className="text-xs text-muted-foreground">
                      Copied from: {position.copiedFrom}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={position.side === 'Yes' ? 'default' : 'secondary'}
                    className={cn(
                      position.side === 'Yes'
                        ? 'bg-green-100 text-green-800 hover:bg-green-100'
                        : 'bg-red-100 text-red-800 hover:bg-red-100'
                    )}
                  >
                    {position.side}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {position.entryPrice.toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(position.value)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-medium',
                    isPnlPositive ? 'text-green-500' : 'text-red-500'
                  )}
                >
                  {formatCurrency(position.pnlUsd)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-medium',
                    isPnlPositive ? 'text-green-500' : 'text-red-500'
                  )}
                >
                  {formatPercent(position.pnlPct)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
