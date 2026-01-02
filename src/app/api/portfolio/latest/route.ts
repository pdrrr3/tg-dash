import { NextResponse } from 'next/server';
import { getLatestSnapshot } from '@/lib/db';

export async function GET() {
  try {
    const snapshot = await getLatestSnapshot();

    if (!snapshot) {
      return NextResponse.json(
        { error: 'No portfolio data available' },
        { status: 404 }
      );
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('[API] Error fetching latest snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio data' },
      { status: 500 }
    );
  }
}
