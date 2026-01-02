import {
  getTelegramClient,
  initializeTelegramClient,
  setTelegramClient,
} from './telegram';
import { parsePortfolioResponse } from './parser';
import {
  savePortfolio,
  getLatestSnapshot,
  getUniqueTraders,
  saveCopyTradingEvent,
} from './db';

let refreshInterval: NodeJS.Timeout | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
let lastKnownTraders: Set<string> = new Set();
let tradersInitialized = false;

async function initializeTraders() {
  if (tradersInitialized) return;

  try {
    const latestSnapshot = await getLatestSnapshot();
    if (latestSnapshot) {
      const traders = await getUniqueTraders(latestSnapshot.id);
      lastKnownTraders = new Set(traders);
      console.log('[SCHEDULER] Initialized known traders:', Array.from(lastKnownTraders));
    }
    tradersInitialized = true;
  } catch (error) {
    console.error('[SCHEDULER] Error initializing traders:', error);
  }
}

async function detectCopyTradingChanges(snapshotId: number) {
  const currentTraders = await getUniqueTraders(snapshotId);
  const currentSet = new Set(currentTraders);

  // Find added traders
  for (const trader of currentTraders) {
    if (!lastKnownTraders.has(trader)) {
      console.log(`[SCHEDULER] New trader detected: ${trader}`);
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
      console.log(`[SCHEDULER] Trader removed: ${trader}`);
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

async function autoRefresh() {
  console.log('[AUTO-REFRESH] Running auto-refresh...');

  try {
    let client = getTelegramClient();

    // Try to initialize if not connected
    if (!client) {
      console.log('[AUTO-REFRESH] No client, attempting to initialize...');
      client = await initializeTelegramClient();
      if (!client) {
        console.log('[AUTO-REFRESH] Could not initialize client, skipping refresh');
        return;
      }
    }

    // Initialize traders if not done
    await initializeTraders();

    // Ensure connection
    await client.ensureConnected();

    // Get portfolio
    const responseText = await client.sendPositionsCommand();
    console.log(
      '[AUTO-REFRESH] Received response, length:',
      responseText.length
    );

    // Parse and save
    const { snapshot, positions } = parsePortfolioResponse(responseText);
    const snapshotId = await savePortfolio(snapshot, positions);

    // Detect copy-trading changes
    await detectCopyTradingChanges(snapshotId);

    console.log('[AUTO-REFRESH] Successfully saved snapshot ID:', snapshotId);
  } catch (error) {
    console.error('[AUTO-REFRESH] Error:', error);

    // Try to reconnect on connection errors
    if (
      error instanceof Error &&
      (error.message.includes('Not connected') ||
        error.message.includes('Not authorized'))
    ) {
      console.log('[AUTO-REFRESH] Attempting to reconnect...');
      setTelegramClient(null);
      await initializeTelegramClient();
    }
  }
}

async function healthCheck() {
  const client = getTelegramClient();

  if (!client) {
    console.log('[HEALTH-CHECK] No client available');
    return;
  }

  try {
    await client.ensureConnected();
    console.log('[HEALTH-CHECK] Connection OK');
  } catch (error) {
    console.error('[HEALTH-CHECK] Connection failed:', error);
    setTelegramClient(null);
    await initializeTelegramClient();
  }
}

export function startScheduler() {
  console.log('[SCHEDULER] Starting scheduler...');

  // Stop any existing intervals
  stopScheduler();

  // Run initial refresh
  autoRefresh();

  // Auto-refresh every 5 minutes
  refreshInterval = setInterval(autoRefresh, 5 * 60 * 1000);
  console.log('[SCHEDULER] Auto-refresh scheduled every 5 minutes');

  // Health check every 2 minutes
  healthCheckInterval = setInterval(healthCheck, 2 * 60 * 1000);
  console.log('[SCHEDULER] Health check scheduled every 2 minutes');
}

export function stopScheduler() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  console.log('[SCHEDULER] Scheduler stopped');
}

export function isSchedulerRunning(): boolean {
  return refreshInterval !== null;
}
