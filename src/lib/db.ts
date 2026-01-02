import { PrismaClient } from '@/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import type {
  PortfolioSnapshotInput,
  PositionInput,
  CopyTradingEventInput,
  PortfolioSnapshotWithPositions,
  BalanceHistoryItem,
  InvestedByTrader,
  TimeRange,
} from './types';

// Singleton Prisma client with SQLite adapter
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || 'file:./dev.db',
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Helper to get start time for range
function getStartTimeForRange(range: TimeRange): Date | null {
  const now = new Date();
  switch (range) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '48h':
      return new Date(now.getTime() - 48 * 60 * 60 * 1000);
    case '3d':
      return new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'all':
      return null;
    default:
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

// Save portfolio snapshot with positions
export async function savePortfolio(
  snapshot: PortfolioSnapshotInput,
  positions: Omit<PositionInput, 'snapshotId'>[]
): Promise<number> {
  const result = await prisma.portfolioSnapshot.create({
    data: {
      ...snapshot,
      positions: {
        create: positions,
      },
    },
  });
  return result.id;
}

// Get latest snapshot with positions
export async function getLatestSnapshot(): Promise<PortfolioSnapshotWithPositions | null> {
  return prisma.portfolioSnapshot.findFirst({
    orderBy: { timestamp: 'desc' },
    include: { positions: { orderBy: { marketQuestion: 'asc' } } },
  });
}

// Get history of snapshots
export async function getHistory(limit: number = 50) {
  return prisma.portfolioSnapshot.findMany({
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
}

// Get balance history for charts
export async function getBalanceHistory(range: TimeRange = '7d'): Promise<BalanceHistoryItem[]> {
  const startTime = getStartTimeForRange(range);

  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: startTime ? { timestamp: { gte: startTime.toISOString() } } : undefined,
    orderBy: { timestamp: 'asc' },
    select: {
      timestamp: true,
      totalBalance: true,
      invested: true,
    },
  });

  return snapshots;
}

// Get invested by trader for chart breakdown
export async function getInvestedByTrader(range: TimeRange = '7d'): Promise<InvestedByTrader[]> {
  const startTime = getStartTimeForRange(range);

  // We need to use raw query for aggregation with grouping
  const results = await prisma.$queryRaw<InvestedByTrader[]>`
    SELECT
      s.timestamp,
      p.copied_from as trader,
      SUM(COALESCE(NULLIF(p.invested, 0), p.value)) as invested
    FROM portfolio_snapshots s
    INNER JOIN positions p ON p.snapshot_id = s.id
    WHERE p.copied_from IS NOT NULL AND p.copied_from != ''
      ${startTime ? `AND s.timestamp >= '${startTime.toISOString()}'` : ''}
    GROUP BY s.timestamp, p.copied_from
    HAVING SUM(COALESCE(NULLIF(p.invested, 0), p.value)) > 0
    ORDER BY s.timestamp ASC
  `;

  return results;
}

// Save copy trading event
export async function saveCopyTradingEvent(event: CopyTradingEventInput): Promise<number> {
  const result = await prisma.copyTradingEvent.create({
    data: event,
  });
  return result.id;
}

// Get copy trading events
export async function getCopyTradingEvents(limit: number = 100) {
  return prisma.copyTradingEvent.findMany({
    orderBy: { timestamp: 'asc' },
    take: limit,
  });
}

// Get unique traders from a snapshot
export async function getUniqueTraders(snapshotId: number): Promise<string[]> {
  const positions = await prisma.position.findMany({
    where: {
      snapshotId,
      copiedFrom: { not: null },
    },
    select: { copiedFrom: true },
    distinct: ['copiedFrom'],
  });

  return positions
    .map((p) => p.copiedFrom)
    .filter((name): name is string => name !== null && name !== '');
}

// Check if snapshot exists near timestamp (duplicate detection)
export async function snapshotExistsNearTimestamp(
  timestamp: string,
  toleranceMinutes: number = 5
): Promise<boolean> {
  const targetTime = new Date(timestamp);
  const minTime = new Date(targetTime.getTime() - toleranceMinutes * 60 * 1000);
  const maxTime = new Date(targetTime.getTime() + toleranceMinutes * 60 * 1000);

  const existing = await prisma.portfolioSnapshot.findFirst({
    where: {
      timestamp: {
        gte: minTime.toISOString(),
        lte: maxTime.toISOString(),
      },
    },
  });

  return existing !== null;
}

// App settings helpers
export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({
    where: { key },
  });
  return setting?.value ?? null;
}

export async function saveSetting(key: string, value: string): Promise<boolean> {
  try {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value, updatedAt: new Date().toISOString() },
      create: { key, value, updatedAt: new Date().toISOString() },
    });
    return true;
  } catch (error) {
    console.error(`Error saving setting ${key}:`, error);
    return false;
  }
}

// Telegram session helpers
export async function getTelegramSession(): Promise<string | null> {
  return getSetting('telegram_session');
}

export async function saveTelegramSession(sessionString: string): Promise<boolean> {
  const saved = await saveSetting('telegram_session', sessionString);
  if (saved) {
    console.log('[DB] Telegram session saved to database');
  }
  return saved;
}
