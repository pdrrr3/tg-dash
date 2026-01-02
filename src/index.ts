import express from 'express';
import dotenv from 'dotenv';
import { TelegramPortfolioClient } from './telegram';
import { parsePortfolioResponse } from './parser';
import { savePortfolio, getLatestSnapshot, getHistory, getBalanceHistory, snapshotExistsNearTimestamp, saveCopyTradingEvent, getCopyTradingEvents, getUniqueTraders, getInvestedByTrader } from './db';
import path from 'path';
import fs from 'fs';
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
  console.error('Missing TELEGRAM_API_ID or TELEGRAM_API_HASH. Please check your .env file.');
  process.exit(1);
}

let telegramClient: TelegramPortfolioClient | null = null;

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
  // Reload .env to get latest session string
  dotenv.config();
  const currentSession = process.env.TELEGRAM_SESSION || '';
  const currentBot = (process.env.TARGET_BOT_USERNAME || '').replace(/^@/, '');
  
  if (!currentSession || !currentBot) {
    console.log('⚠️  Telegram session not configured. Use /auth page to authenticate.');
    telegramClient = null;
    return;
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
    const limit = parseInt(req.query.limit as string) || 100;
    const history = await getBalanceHistory(limit);
    const events = await getCopyTradingEvents(limit);
    const investedByTrader = await getInvestedByTrader(limit);
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
app.post('/api/auth/start', (req, res) => {
  const sessionId = req.body.sessionId || `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  createAuthSession(sessionId, API_ID, API_HASH);
  res.json({ success: true, sessionId, step: 'phone' });
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
    // Save session string to .env file
    try {
      const envPath = path.join(__dirname, '../.env');
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      if (envContent.includes('TELEGRAM_SESSION=')) {
        envContent = envContent.replace(/TELEGRAM_SESSION=.*/, `TELEGRAM_SESSION=${result.sessionString}`);
      } else {
        envContent += `\nTELEGRAM_SESSION=${result.sessionString}\n`;
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log('✅ Session string saved to .env file');
    } catch (error) {
      console.error('Failed to save session to .env:', error);
    }
  }
  res.json(result);
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
    // Save session string to .env file
    try {
      const envPath = path.join(__dirname, '../.env');
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      if (envContent.includes('TELEGRAM_SESSION=')) {
        envContent = envContent.replace(/TELEGRAM_SESSION=.*/, `TELEGRAM_SESSION=${result.sessionString}`);
      } else {
        envContent += `\nTELEGRAM_SESSION=${result.sessionString}\n`;
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log('✅ Session string saved to .env file');
    } catch (error) {
      console.error('Failed to save session to .env:', error);
    }
  }
  res.json(result);
});

// Serve auth page
app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/auth.html'));
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Serve read-only view (no auth controls)
app.get('/view', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/view.html'));
});

// Auto-refresh every 5 minutes
let refreshInterval: NodeJS.Timeout | null = null;

async function autoRefresh() {
  if (!telegramClient) {
    await initializeTelegram();
  }
  
  if (telegramClient) {
    try {
      console.log('[AUTO-REFRESH] Fetching portfolio data...');
      const responseText = await telegramClient.sendPositionsCommand();
      const parsed = parsePortfolioResponse(responseText);
      const snapshotId = await savePortfolio(parsed.snapshot, parsed.positions);
      await detectCopyTradingChanges(snapshotId, parsed.positions);
      console.log(`[AUTO-REFRESH] Portfolio updated (snapshot ID: ${snapshotId})`);
    } catch (error) {
      console.error('[AUTO-REFRESH] Error:', error instanceof Error ? error.message : error);
    }
  }
}

function startAutoRefresh() {
  // Refresh immediately on start, then every 5 minutes
  autoRefresh();
  refreshInterval = setInterval(autoRefresh, 5 * 60 * 1000); // 5 minutes
  console.log('✅ Auto-refresh enabled: portfolio will update every 5 minutes');
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

