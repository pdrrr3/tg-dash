'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useBalanceHistory } from '@/hooks/use-balance-history';
import type { TimeRange } from '@/lib/types';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

interface BalanceChartProps {
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
}

const TRADER_COLORS = [
  '#30d158', // Green
  '#ff9500', // Orange
  '#ff3b30', // Red
  '#af52de', // Purple
  '#5ac8fa', // Light blue
  '#ffcc00', // Yellow
];

export function BalanceChart({ range, onRangeChange }: BalanceChartProps) {
  const { data, isLoading, error } = useBalanceHistory(range);

  const chartData = useMemo(() => {
    if (!data?.history) return null;

    // Get unique traders for per-trader lines
    const traders = [
      ...new Set(data.investedByTrader?.map((item) => item.trader) || []),
    ];

    // Build trader datasets
    const traderDatasets = traders.map((trader, index) => {
      const traderData = data.investedByTrader
        ?.filter((item) => item.trader === trader)
        .map((item) => ({
          x: new Date(item.timestamp),
          y: item.invested,
        }));

      return {
        label: trader,
        data: traderData || [],
        borderColor: TRADER_COLORS[index % TRADER_COLORS.length],
        backgroundColor: TRADER_COLORS[index % TRADER_COLORS.length],
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
      };
    });

    return {
      datasets: [
        {
          label: 'Total Balance',
          data: data.history.map((item) => ({
            x: new Date(item.timestamp),
            y: item.totalBalance,
          })),
          borderColor: '#007aff',
          backgroundColor: '#007aff',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
        },
        ...traderDatasets,
      ],
    };
  }, [data]);

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            usePointStyle: true,
            padding: 20,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 12,
          displayColors: true,
          callbacks: {
            label: (context) => {
              const value = context.parsed.y ?? 0;
              return `${context.dataset.label}: $${value.toFixed(2)}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time' as const,
          time: {
            unit: range === '24h' || range === '48h' ? 'hour' : 'day',
            displayFormats: {
              hour: 'MMM d, HH:mm',
              day: 'MMM d',
            },
          },
          grid: {
            display: false,
          },
        },
        y: {
          beginAtZero: false,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
          },
          ticks: {
            callback: (value) => `$${value}`,
          },
        },
      },
    }),
    [range]
  );

  return (
    <Card className="bg-white/80 backdrop-blur-xl border-border/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium">Balance Over Time</CardTitle>
        <Select value={range} onValueChange={(v) => onRangeChange(v as TimeRange)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Select range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">24 Hours</SelectItem>
            <SelectItem value="48h">48 Hours</SelectItem>
            <SelectItem value="3d">3 Days</SelectItem>
            <SelectItem value="7d">7 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : error ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Failed to load chart data
          </div>
        ) : chartData ? (
          <div className="h-[300px]">
            <Line data={chartData} options={options} />
          </div>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            No chart data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
