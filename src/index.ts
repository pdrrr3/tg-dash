import express from 'express';
import dotenv from 'dotenv';
import { TelegramPortfolioClient } from './telegram';
import { parsePortfolioResponse } from './parser';
import { savePortfolio, getLatestSnapshot, getHistory, getBalanceHistory, snapshotExistsNearTimestamp, saveCopyTradingEvent, getCopyTradingEvents, getUniqueTraders, getInvestedByTrader, getTelegramSession, saveTelegramSession } from './db';
import path from 'path';
import { createAuthSession, submitPhoneNumber, submitCode, submitPassword, cleanupAuthSession } from './auth-web';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3001;
const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0');
const API_HASH = process.env.TELEGRAM_API_HASH || '';
const SESSION_STRING = process.env.TELEGRAM_SESSION || '';
const TARGET_BOT = (process.env.TARGET_BOT_USERNAME || '').replace(/^@/, ''); // Remove @ if present

if (!API_ID || !API_HASH) {
  console.warn('⚠️  Missing TELEGRAM_API_ID or TELEGRAM_API_HASH. Server will start but Telegram features will be unavailable.');
}

let telegramClient: TelegramPortfolioClient | null = null;
let refreshInterval: NodeJS.Timeout | null = null;
let connectionHealthCheckInterval: NodeJS.Timeout | null = null;

// Track copy trading state to detect changes
let lastKnownTraders: Set<string> = new Set();

// Initialize lastKnownTraders from the latest snapshot
async function initializeCopyTradingState(): Promise<void> {
  try {
    const latest = await getLatestSnapshot();
    if (latest && latest.id) {
      const traders = await getUniqueTraders(latest.id);
      lastKnownTraders = new Set(traders);
      console.log(`[COPY TRADING] Initialized with ${traders.length} traders: ${traders.join(', ')}`);
    }
  } catch (error) {
    console.error('Error initializing copy trading state:', error);
  }
}

async function detectCopyTradingChanges(snapshotId: number, positions: any[]): Promise<void> {
  try {
    // Get unique traders from current snapshot
    const currentTraders = new Set<string>();
    positions.forEach(pos => {
      if (pos.copied_from && pos.copied_from.trim()) {
        currentTraders.add(pos.copied_from.trim());
      }
    });

    // Compare with last known traders
    if (lastKnownTraders.size > 0) {
      const added = Array.from(currentTraders).filter(t => !lastKnownTraders.has(t));
      const removed = Array.from(lastKnownTraders).filter(t => !currentTraders.has(t));

      // Get snapshot timestamp
      const snapshot = await getLatestSnapshot();
      if (snapshot) {
        for (const trader of added) {
          await saveCopyTradingEvent({
            timestamp: snapshot.timestamp,
            event_type: 'copier_added',
            description: `Started copying ${trader}`,
            trader_name: trader,
          });
          console.log(`[COPY TRADING] Detected new copier: ${trader}`);
        }

        for (const trader of removed) {
          await saveCopyTradingEvent({
            timestamp: snapshot.timestamp,
            event_type: 'copier_removed',
            description: `Stopped copying ${trader}`,
            trader_name: trader,
          });
          console.log(`[COPY TRADING] Detected removed copier: ${trader}`);
        }
      }
    }

    // Update last known traders
    lastKnownTraders = currentTraders;
  } catch (error) {
    console.error('Error detecting copy trading changes:', error);
  }
}

async function initializeTelegram() {
  // Try to get session from database first, then fall back to env var
  const dbSession = await getTelegramSession();
  const envSession = process.env.TELEGRAM_SESSION || '';
  const currentSession = dbSession || envSession;
  const currentBot = (process.env.TARGET_BOT_USERNAME || '').replace(/^@/, '');

  if (!currentSession || !currentBot) {
    console.log('⚠️  Telegram session not configured. Use /auth page to authenticate.');
    telegramClient = null;
    return;
  }

  if (dbSession) {
    console.log('[TELEGRAM] Using session from database');
  } else if (envSession) {
    console.log('[TELEGRAM] Using session from environment variable');
  }

  try {
    telegramClient = new TelegramPortfolioClient(API_ID, API_HASH, currentSession, currentBot);
    await telegramClient.connect();
    console.log('✅ Telegram client connected');
    
    // Initialize copy trading state
    await initializeCopyTradingState();
    
    // Start auto-refresh if not already started
    if (!refreshInterval) {
      startAutoRefresh();
    }
    
    // Start connection health check if not already started
    if (!connectionHealthCheckInterval) {
      startConnectionHealthCheck();
    }
  } catch (error) {
    console.error('Failed to connect to Telegram:', error instanceof Error ? error.message : error);
    console.log('Server will start, but /api/refresh will fail until Telegram is configured');
    telegramClient = null;
  }
}

// API Routes
app.post('/api/refresh', async (req, res) => {
  try {
    // Always try to reconnect in case session was updated
    await initializeTelegram();
    if (!telegramClient) {
      return res.status(500).json({
        success: false,
        error: 'Telegram not connected. Please authenticate at /auth',
      });
    }

    // Ensure connection is alive
    await telegramClient.ensureConnected();
    const responseText = await telegramClient.sendPositionsCommand();
    console.log('Bot response length:', responseText.length);
    console.log('Bot response (first 1000 chars):', responseText.substring(0, 1000));
    console.log('Bot response (full):', responseText);
    
    const parsed = parsePortfolioResponse(responseText);
    console.log('Parsed snapshot:', JSON.stringify(parsed.snapshot, null, 2));
    console.log('Parsed positions count:', parsed.positions.length);
    console.log('Parsed positions:', parsed.positions.map(p => p.market_question).join('\n'));
    
    const snapshotId = await savePortfolio(parsed.snapshot, parsed.positions);
    
    // Detect copy trading changes
    await detectCopyTradingChanges(snapshotId, parsed.positions);
    
    res.json({
      success: true,
      snapshotId,
      message: 'Portfolio refreshed successfully',
    });
  } catch (error) {
    console.error('Error refreshing portfolio:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/api/portfolio/latest', async (req, res) => {
  try {
    const portfolio = await getLatestSnapshot();
    if (!portfolio) {
      return res.status(404).json({ error: 'No portfolio data found' });
    }
    res.json(portfolio);
  } catch (error) {
    console.error('Error getting latest portfolio:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/api/portfolio/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await getHistory(limit);
    res.json(history);
  } catch (error) {
    console.error('Error getting portfolio history:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.get('/api/portfolio/balance-history', async (req, res) => {
  try {
    const range = (req.query.range as string) || '7d';
    const history = await getBalanceHistory(range);
    const events = await getCopyTradingEvents(100);
    const investedByTrader = await getInvestedByTrader(range);
    res.json({ history, events, investedByTrader });
  } catch (error) {
    console.error('Error getting balance history:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.post('/api/historical/fetch', async (req, res) => {
  try {
    await initializeTelegram();
    if (!telegramClient) {
      return res.status(500).json({
        success: false,
        error: 'Telegram not connected. Please authenticate at /auth',
      });
    }

    const limit = parseInt(req.body.limit as string) || 2000;
    console.log(`[HISTORICAL] Fetching up to ${limit} messages from chat...`);
    
    // Ensure connection is alive
    await telegramClient.ensureConnected();
    const messages = await telegramClient.fetchHistoricalMessages(limit);
    console.log(`[HISTORICAL] Found ${messages.length} portfolio messages`);
    
    let saved = 0;
    let skipped = 0;
    let errors = 0;

    // Process messages in reverse chronological order (oldest first)
    messages.reverse();

    for (const msg of messages) {
      try {
        // Check if we already have a snapshot near this timestamp
        const exists = await snapshotExistsNearTimestamp(msg.date.toISOString(), 5);
        if (exists) {
          skipped++;
          continue;
        }

        // Parse the message
        const parsed = parsePortfolioResponse(msg.message, msg.date);
        
        // Only save if we got valid data (non-zero balance or positions)
        if (parsed.snapshot.total_balance > 0 || parsed.positions.length > 0 || parsed.snapshot.total_positions) {
          await savePortfolio(parsed.snapshot, parsed.positions);
          saved++;
          if (saved % 10 === 0) {
            console.log(`[HISTORICAL] Processed ${saved + skipped + errors} messages, saved ${saved}...`);
          }
        } else {
          skipped++;
        }
      } catch (error) {
        errors++;
        console.error(`[HISTORICAL] Error processing message ${msg.id}:`, error instanceof Error ? error.message : error);
      }
    }

    console.log(`[HISTORICAL] Complete: ${saved} saved, ${skipped} skipped, ${errors} errors`);

    res.json({
      success: true,
      totalMessages: messages.length,
      saved,
      skipped,
      errors,
      message: `Processed ${messages.length} messages: ${saved} saved, ${skipped} skipped, ${errors} errors`,
    });
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Auth API routes
app.get('/api/auth/status', (req, res) => {
  // Reload .env to get latest values
  dotenv.config();
  const hasSession = !!process.env.TELEGRAM_SESSION;
  const hasBot = !!process.env.TARGET_BOT_USERNAME;
  const isConnected = !!telegramClient;

  res.json({
    configured: hasSession && hasBot,
    connected: isConnected,
  });
});

app.post('/api/auth/start', (req, res) => {
  // Reload .env to get latest values
  dotenv.config();
  const currentApiId = parseInt(process.env.TELEGRAM_API_ID || '0');
  const currentApiHash = process.env.TELEGRAM_API_HASH || '';
  
  // Validate API credentials first
  if (!currentApiId || currentApiId === 0 || !currentApiHash || currentApiHash.trim() === '') {
    console.error('[AUTH] Missing API credentials. API_ID:', currentApiId, 'API_HASH:', currentApiHash ? '***' : 'missing');
    return res.status(400).json({ 
      success: false, 
      error: 'Missing TELEGRAM_API_ID or TELEGRAM_API_HASH. Please add them to your .env file and restart the server. Get your credentials from https://my.telegram.org/apps' 
    });
  }
  
  try {
    const sessionId = req.body.sessionId || `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('[AUTH] Creating auth session with API_ID:', currentApiId);
    createAuthSession(sessionId, currentApiId, currentApiHash);
    res.json({ success: true, sessionId, step: 'phone' });
  } catch (error) {
    console.error('[AUTH] Error creating auth session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to initialize authentication';
    
    // Provide helpful error message
    if (errorMessage.includes('API ID') || errorMessage.includes('Hash cannot be empty')) {
      return res.status(400).json({
        success: false,
        error: 'TELEGRAM_API_ID and TELEGRAM_API_HASH must be configured in your .env file. Get them from https://my.telegram.org/apps'
      });
    }
    
    res.status(400).json({
      success: false,
      error: errorMessage
    });
  }
});

app.post('/api/auth/phone', async (req, res) => {
  const { sessionId, phoneNumber } = req.body;
  if (!sessionId || !phoneNumber) {
    return res.status(400).json({ success: false, error: 'Missing sessionId or phoneNumber' });
  }

  const result = await submitPhoneNumber(sessionId, phoneNumber);
  res.json(result);
});

app.post('/api/auth/code', async (req, res) => {
  const { sessionId, code } = req.body;
  if (!sessionId || !code) {
    return res.status(400).json({ success: false, error: 'Missing sessionId or code' });
  }

  const result = await submitCode(sessionId, code);
  if (result.success && result.sessionString) {
    // Save session string to database (secure, not exposed to frontend)
    await saveTelegramSession(result.sessionString);
    // Reinitialize Telegram client with new session
    await initializeTelegram();
  }
  // Don't expose sessionString to frontend - remove it from response
  const { sessionString, ...safeResult } = result;
  res.json(safeResult);
});

app.post('/api/auth/password', async (req, res) => {
  const { sessionId, password } = req.body;
  if (!sessionId || !password) {
    return res.status(400).json({ success: false, error: 'Missing sessionId or password' });
  }

  console.log(`[AUTH] Password submission for session ${sessionId}`);
  const result = await submitPassword(sessionId, password);
  console.log(`[AUTH] Password result:`, result.success ? 'SUCCESS' : `FAILED: ${result.error}`);

  if (result.success && result.sessionString) {
    // Save session string to database (secure, not exposed to frontend)
    await saveTelegramSession(result.sessionString);
    // Reinitialize Telegram client with new session
    await initializeTelegram();
  }
  // Don't expose sessionString to frontend - remove it from response
  const { sessionString, ...safeResult } = result;
  res.json(safeResult);
});

// Serve auth page
app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/auth.html'));
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/view.html'));
});

// Redirect old /view route to home
app.get('/view', (req, res) => {
  res.redirect('/');
});

// Auto-refresh every 5 minutes
async function autoRefresh() {
  if (!telegramClient) {
    await initializeTelegram();
  }
  
  if (telegramClient) {
    try {
      // Ensure connection is alive before fetching
      await telegramClient.ensureConnected();
      console.log('[AUTO-REFRESH] Fetching portfolio data...');
      const responseText = await telegramClient.sendPositionsCommand();
      const parsed = parsePortfolioResponse(responseText);
      const snapshotId = await savePortfolio(parsed.snapshot, parsed.positions);
      await detectCopyTradingChanges(snapshotId, parsed.positions);
      console.log(`[AUTO-REFRESH] Portfolio updated (snapshot ID: ${snapshotId})`);
    } catch (error) {
      console.error('[AUTO-REFRESH] Error:', error instanceof Error ? error.message : error);
      // Try to reconnect on next refresh
      if (error instanceof Error && (error.message.includes('Not connected') || error.message.includes('Not authorized'))) {
        console.log('[AUTO-REFRESH] Attempting to reconnect...');
        telegramClient = null;
        await initializeTelegram();
      }
    }
  }
}

function startAutoRefresh() {
  // Refresh immediately on start, then every 5 minutes
  autoRefresh();
  refreshInterval = setInterval(autoRefresh, 5 * 60 * 1000); // 5 minutes
  console.log('✅ Auto-refresh enabled: portfolio will update every 5 minutes');
}

// Connection health check - runs every 2 minutes to keep connection alive
async function connectionHealthCheck() {
  if (!telegramClient) {
    return;
  }
  
  try {
    await telegramClient.ensureConnected();
  } catch (error) {
    console.error('[HEALTH CHECK] Connection issue detected:', error instanceof Error ? error.message : error);
    // Try to reconnect
    telegramClient = null;
    await initializeTelegram();
  }
}

function startConnectionHealthCheck() {
  // Check connection health every 2 minutes
  connectionHealthCheckInterval = setInterval(connectionHealthCheck, 2 * 60 * 1000);
  console.log('✅ Connection health check enabled: checking every 2 minutes');
}

// Initialize and start server
async function start() {
  // Try to initialize Telegram, but don't fail if it doesn't work
  await initializeTelegram();
  
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (!telegramClient) {
      console.log('⚠️  Telegram not connected. Run authentication first.');
    } else {
      // Start auto-refresh if Telegram is connected
      startAutoRefresh();
    }
  });
}

start();

