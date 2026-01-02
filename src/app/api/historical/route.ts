import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getTelegramClient } from '@/lib/telegram';
import { parsePortfolioResponse } from '@/lib/parser';
import { savePortfolio, snapshotExistsNearTimestamp } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const limit = body.limit || 2000;

    const client = getTelegramClient();

    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Telegram client not connected. Please authenticate first.' },
        { status: 503 }
      );
    }

    console.log(`[HISTORICAL] Fetching up to ${limit} historical messages...`);

    // Fetch historical messages from Telegram
    const messages = await client.fetchHistoricalMessages(limit);
    console.log(`[HISTORICAL] Found ${messages.length} portfolio messages`);

    let savedCount = 0;
    let skippedCount = 0;

    // Process each message
    for (const msg of messages) {
      try {
        // Check if we already have a snapshot near this timestamp
        const exists = await snapshotExistsNearTimestamp(msg.date.toISOString());
        if (exists) {
          skippedCount++;
          continue;
        }

        // Parse and save
        const { snapshot, positions } = parsePortfolioResponse(msg.message, msg.date);
        await savePortfolio(snapshot, positions);
        savedCount++;
      } catch (error) {
        console.error('[HISTORICAL] Error processing message:', error);
      }
    }

    console.log(
      `[HISTORICAL] Completed: saved ${savedCount}, skipped ${skippedCount} duplicates`
    );

    return NextResponse.json({
      success: true,
      totalMessages: messages.length,
      saved: savedCount,
      skipped: skippedCount,
    });
  } catch (error) {
    console.error('[HISTORICAL] Error fetching historical data:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
