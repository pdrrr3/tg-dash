import { NextResponse } from 'next/server';
import { getTelegramClient } from '@/lib/telegram';
import { parsePortfolioResponse } from '@/lib/parser';
import { savePortfolio, getLatestSnapshot, getUniqueTraders, saveCopyTradingEvent } from '@/lib/db';

// Track known traders for change detection
let lastKnownTraders: Set<string> = new Set();
let tradersInitialized = false;

async function initializeTraders() {
  if (tradersInitialized) return;

  try {
    const latestSnapshot = await getLatestSnapshot();
    if (latestSnapshot) {
      const traders = await getUniqueTraders(latestSnapshot.id);
      lastKnownTraders = new Set(traders);
      console.log('[REFRESH] Initialized known traders:', Array.from(lastKnownTraders));
    }
    tradersInitialized = true;
  } catch (error) {
    console.error('[REFRESH] Error initializing traders:', error);
  }
}

async function detectCopyTradingChanges(snapshotId: number) {
  const currentTraders = await getUniqueTraders(snapshotId);
  const currentSet = new Set(currentTraders);

  // Find added traders
  for (const trader of currentTraders) {
    if (!lastKnownTraders.has(trader)) {
      console.log(`[COPY-TRADING] New trader detected: ${trader}`);
      await saveCopyTradingEvent({
        timestamp: new Date().toISOString(),
        eventType: 'copier_added',
        description: `Started copying ${trader}`,
        traderName: trader,
      });
    }
  }

  // Find removed traders
  for (const trader of lastKnownTraders) {
    if (!currentSet.has(trader)) {
      console.log(`[COPY-TRADING] Trader removed: ${trader}`);
      await saveCopyTradingEvent({
        timestamp: new Date().toISOString(),
        eventType: 'copier_removed',
        description: `Stopped copying ${trader}`,
        traderName: trader,
      });
    }
  }

  lastKnownTraders = currentSet;
}

export async function POST() {
  try {
    const client = getTelegramClient();

    if (!client) {
      return NextResponse.json(
        { success: false, error: 'Telegram client not connected. Please authenticate first.' },
        { status: 503 }
      );
    }

    // Initialize traders if not done
    await initializeTraders();

    // Get portfolio from Telegram
    const responseText = await client.sendPositionsCommand();
    console.log('[REFRESH] Received response, first 500 chars:', responseText.substring(0, 500));

    // Parse the response
    const { snapshot, positions } = parsePortfolioResponse(responseText);

    // Save to database
    const snapshotId = await savePortfolio(snapshot, positions);

    // Detect copy-trading changes
    await detectCopyTradingChanges(snapshotId);

    console.log('[REFRESH] Portfolio refreshed successfully, snapshot ID:', snapshotId);

    return NextResponse.json({
      success: true,
      snapshotId,
      message: 'Portfolio refreshed successfully',
    });
  } catch (error) {
    console.error('[REFRESH] Error refreshing portfolio:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
