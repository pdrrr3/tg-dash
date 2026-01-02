import sqlite3 from 'sqlite3';
import { PortfolioSnapshot, Position, CopyTradingEvent } from './types';
import { promisify } from 'util';
import path from 'path';

// Use environment variable for database path, or default to current directory
// Railway volumes should be mounted to /data
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'portfolio.db');
const db = new sqlite3.Database(DB_PATH);

// Promisify database methods
const dbGet = promisify(db.get.bind(db)) as (sql: string, params?: any[]) => Promise<any>;
const dbAll = promisify(db.all.bind(db)) as (sql: string, params?: any[]) => Promise<any[]>;
const dbExec = promisify(db.exec.bind(db));

// Initialize database
dbExec(`
  CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_balance REAL NOT NULL,
    available_balance REAL NOT NULL,
    invested REAL NOT NULL,
    value REAL NOT NULL,
    total_pnl_usd REAL NOT NULL,
    total_pnl_pct REAL NOT NULL,
    timestamp TEXT NOT NULL,
    total_positions INTEGER
  );

  CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id INTEGER NOT NULL,
    market_question TEXT NOT NULL,
    side TEXT NOT NULL,
    entry_price REAL NOT NULL,
    invested REAL NOT NULL,
    shares REAL NOT NULL,
    value REAL NOT NULL,
    pnl_usd REAL NOT NULL,
    pnl_pct REAL NOT NULL,
    expiry_timestamp TEXT,
    copied_from TEXT,
    FOREIGN KEY (snapshot_id) REFERENCES portfolio_snapshots(id)
  );

  CREATE TABLE IF NOT EXISTS copy_trading_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    trader_name TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_snapshot_timestamp ON portfolio_snapshots(timestamp);
  CREATE INDEX IF NOT EXISTS idx_positions_snapshot ON positions(snapshot_id);
  CREATE INDEX IF NOT EXISTS idx_copy_events_timestamp ON copy_trading_events(timestamp);
`).catch(err => console.error('Database initialization error:', err));

export async function savePortfolio(snapshot: PortfolioSnapshot, positions: Position[]): Promise<number> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Insert snapshot
      db.run(
        `INSERT INTO portfolio_snapshots 
        (total_balance, available_balance, invested, value, total_pnl_usd, total_pnl_pct, timestamp, total_positions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          snapshot.total_balance,
          snapshot.available_balance,
          snapshot.invested,
          snapshot.value,
          snapshot.total_pnl_usd,
          snapshot.total_pnl_pct,
          snapshot.timestamp,
          snapshot.total_positions || null
        ],
        function(err) {
          if (err) {
            reject(err);
            return;
          }

          const snapshotId = this.lastID;

          // Insert positions
          let completed = 0;
          if (positions.length === 0) {
            resolve(snapshotId);
            return;
          }

          for (const position of positions) {
            db.run(
              `INSERT INTO positions 
              (snapshot_id, market_question, side, entry_price, invested, shares, value, pnl_usd, pnl_pct, expiry_timestamp, copied_from)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                snapshotId,
                position.market_question,
                position.side,
                position.entry_price,
                position.invested,
                position.shares,
                position.value,
                position.pnl_usd,
                position.pnl_pct,
                position.expiry_timestamp,
                position.copied_from
              ],
              (err) => {
                if (err) {
                  reject(err);
                  return;
                }
                completed++;
                if (completed === positions.length) {
                  resolve(snapshotId);
                }
              }
            );
          }
        }
      );
    });
  });
}

export async function getLatestSnapshot(): Promise<(PortfolioSnapshot & { positions: Position[] }) | null> {
  try {
    const snapshot = await dbGet(
      `SELECT * FROM portfolio_snapshots 
      ORDER BY timestamp DESC 
      LIMIT 1`
    ) as PortfolioSnapshot | undefined;

    if (!snapshot) return null;

    const positions = await dbAll(
      `SELECT * FROM positions 
      WHERE snapshot_id = ?
      ORDER BY market_question`,
      [snapshot.id]
    ) as Position[];

    return { ...snapshot, positions };
  } catch (error) {
    console.error('Error getting latest snapshot:', error);
    return null;
  }
}

export async function getHistory(limit: number = 50): Promise<PortfolioSnapshot[]> {
  try {
    return await dbAll(
      `SELECT * FROM portfolio_snapshots 
      ORDER BY timestamp DESC 
      LIMIT ?`,
      [limit]
    ) as PortfolioSnapshot[];
  } catch (error) {
    console.error('Error getting history:', error);
    return [];
  }
}

export async function getBalanceHistory(range: string = '7d'): Promise<{ timestamp: string; total_balance: number; invested: number }[]> {
  try {
    const startTime = getStartTimeForRange(range);

    if (startTime) {
      return await dbAll(
        `SELECT timestamp, total_balance, invested
        FROM portfolio_snapshots
        WHERE timestamp >= ?
        ORDER BY timestamp ASC`,
        [startTime.toISOString()]
      ) as { timestamp: string; total_balance: number; invested: number }[];
    } else {
      // 'all' - no time filter
      return await dbAll(
        `SELECT timestamp, total_balance, invested
        FROM portfolio_snapshots
        ORDER BY timestamp ASC`
      ) as { timestamp: string; total_balance: number; invested: number }[];
    }
  } catch (error) {
    console.error('Error getting balance history:', error);
    return [];
  }
}

function getStartTimeForRange(range: string): Date | null {
  const now = new Date();
  switch (range) {
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '48h': return new Date(now.getTime() - 48 * 60 * 60 * 1000);
    case '3d': return new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'all': return null;
    default: return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Default to 7d
  }
}

export async function getInvestedByTrader(range: string = '7d'): Promise<Array<{ timestamp: string; trader: string; invested: number }>> {
  try {
    const startTime = getStartTimeForRange(range);

    // Get invested amounts grouped by trader and snapshot timestamp
    // This returns one row per snapshot per trader
    // Use value if invested is 0 (some positions may have 0 invested but still have value)
    if (startTime) {
      return await dbAll(
        `SELECT
          s.timestamp,
          p.copied_from as trader,
          SUM(COALESCE(NULLIF(p.invested, 0), p.value)) as invested
        FROM portfolio_snapshots s
        INNER JOIN positions p ON p.snapshot_id = s.id
        WHERE p.copied_from IS NOT NULL AND p.copied_from != ''
          AND s.timestamp >= ?
        GROUP BY s.timestamp, p.copied_from
        HAVING SUM(COALESCE(NULLIF(p.invested, 0), p.value)) > 0
        ORDER BY s.timestamp ASC`,
        [startTime.toISOString()]
      ) as Array<{ timestamp: string; trader: string; invested: number }>;
    } else {
      // 'all' - no time filter
      return await dbAll(
        `SELECT
          s.timestamp,
          p.copied_from as trader,
          SUM(COALESCE(NULLIF(p.invested, 0), p.value)) as invested
        FROM portfolio_snapshots s
        INNER JOIN positions p ON p.snapshot_id = s.id
        WHERE p.copied_from IS NOT NULL AND p.copied_from != ''
        GROUP BY s.timestamp, p.copied_from
        HAVING SUM(COALESCE(NULLIF(p.invested, 0), p.value)) > 0
        ORDER BY s.timestamp ASC`
      ) as Array<{ timestamp: string; trader: string; invested: number }>;
    }
  } catch (error) {
    console.error('Error getting invested by trader:', error);
    return [];
  }
}

export async function saveCopyTradingEvent(event: CopyTradingEvent): Promise<number> {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO copy_trading_events (timestamp, event_type, description, trader_name)
      VALUES (?, ?, ?, ?)`,
      [event.timestamp, event.event_type, event.description, event.trader_name || null],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
}

export async function getCopyTradingEvents(limit: number = 100): Promise<CopyTradingEvent[]> {
  try {
    return await dbAll(
      `SELECT * FROM copy_trading_events 
      ORDER BY timestamp ASC 
      LIMIT ?`,
      [limit]
    ) as CopyTradingEvent[];
  } catch (error) {
    console.error('Error getting copy trading events:', error);
    return [];
  }
}

export async function getUniqueTraders(snapshotId: number): Promise<string[]> {
  try {
    const positions = await dbAll(
      `SELECT DISTINCT copied_from FROM positions 
      WHERE snapshot_id = ? AND copied_from IS NOT NULL AND copied_from != ''`,
      [snapshotId]
    ) as Array<{ copied_from: string }>;
    return positions.map(p => p.copied_from);
  } catch (error) {
    console.error('Error getting unique traders:', error);
    return [];
  }
}

export async function snapshotExistsNearTimestamp(timestamp: string, toleranceMinutes: number = 5): Promise<boolean> {
  try {
    // Check if a snapshot exists within toleranceMinutes of this timestamp (to avoid duplicates)
    const snapshot = await dbGet(
      `SELECT id FROM portfolio_snapshots 
      WHERE ABS(julianday(timestamp) - julianday(?)) * 24 * 60 < ?
      LIMIT 1`,
      [timestamp, toleranceMinutes]
    );
    
    return !!snapshot;
  } catch (error) {
    console.error('Error checking snapshot by timestamp:', error);
    return false;
  }
}
