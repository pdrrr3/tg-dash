import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBalanceHistory, getCopyTradingEvents, getInvestedByTrader } from '@/lib/db';
import type { TimeRange } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const range = (searchParams.get('range') || '7d') as TimeRange;

    // Fetch all data in parallel
    const [history, events, investedByTrader] = await Promise.all([
      getBalanceHistory(range),
      getCopyTradingEvents(100),
      getInvestedByTrader(range),
    ]);

    return NextResponse.json({
      history,
      events,
      investedByTrader,
    });
  } catch (error) {
    console.error('[API] Error fetching balance history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balance history' },
      { status: 500 }
    );
  }
}
