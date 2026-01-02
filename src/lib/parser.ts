import type { ParsedPortfolio, PortfolioSnapshotInput } from './types';

type PositionParsed = {
  marketQuestion: string;
  side: string;
  entryPrice: number;
  invested: number;
  shares: number;
  value: number;
  pnlUsd: number;
  pnlPct: number;
  expiryTimestamp: string | null;
  copiedFrom: string | null;
};

export function parsePortfolioResponse(text: string, timestamp?: Date): ParsedPortfolio {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const snapshot: PortfolioSnapshotInput = {
    totalBalance: 0,
    availableBalance: 0,
    invested: 0,
    value: 0,
    totalPnlUsd: 0,
    totalPnlPct: 0,
    timestamp: timestamp ? timestamp.toISOString() : new Date().toISOString(),
    totalPositions: 0,
  };

  const positions: PositionParsed[] = [];
  let currentPosition: Partial<PositionParsed> | null = null;
  let inPositionsSection = false;

  // Extract total positions count from header (e.g., "Manage your Positions(11)")
  const headerMatch = text.match(/Positions\s*\((\d+)\)/i);
  if (headerMatch) {
    snapshot.totalPositions = parseInt(headerMatch[1], 10);
  }

  // First pass: Extract summary/balance information from the top (before positions)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Stop when we hit the first position
    if (line.match(/^#?\d+\./) && line.includes('?')) {
      break;
    }

    // Parse balances from summary section (before positions start)
    if (lowerLine.includes('total balance')) {
      const balance = extractNumber(line);
      if (balance !== null && balance >= 0) {
        snapshot.totalBalance = balance;
      }
    } else if (lowerLine.includes('available balance') || (lowerLine.includes('available') && lowerLine.includes('balance'))) {
      const available = extractNumber(line);
      if (available !== null && available >= 0) {
        snapshot.availableBalance = available;
      }
    } else if (lowerLine.includes('invested') && !lowerLine.includes('shares') && !line.match(/^#?\d+\./) && !line.startsWith('•') && !line.match(/^#\s*\d+$/)) {
      const invested = extractNumber(line);
      if (invested !== null && invested >= 0) {
        snapshot.invested = invested;
      }
    } else if (lowerLine.includes('value') && !lowerLine.includes('pnl') && !line.match(/^#?\d+\./) && !line.startsWith('•') && !line.match(/^#\s*\d+$/)) {
      const value = extractNumber(line);
      if (value !== null && value >= 0) {
        snapshot.value = value;
      }
    } else if ((lowerLine.includes('total pnl') || lowerLine.includes('total profit')) && !line.match(/^#?\d+\./) && !line.match(/^#\s*\d+$/)) {
      // Match patterns like "Total PNL: -$15.19 (-0.02%)" or "Total PNL: $15.19 (0.02%)"
      const pnlMatch = line.match(/([+-]?)\$?([\d,]+\.?\d*)\s*\(([+-]?)([\d,]+\.?\d*)%\)/);
      if (pnlMatch) {
        const sign = pnlMatch[1] === '-' ? -1 : 1;
        snapshot.totalPnlUsd = sign * parseFloat(pnlMatch[2].replace(/,/g, '') || '0');
        const pctSign = pnlMatch[3] === '-' ? -1 : 1;
        snapshot.totalPnlPct = pctSign * parseFloat(pnlMatch[4].replace(/,/g, '') || '0');
      } else {
        const pnl = extractNumber(line);
        if (pnl !== null) {
          snapshot.totalPnlUsd = pnl;
        }
      }
    }
  }

  // Second pass: Parse positions from first page only
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Stop parsing if we hit pagination controls or bottom buttons
    if (inPositionsSection && (
      lowerLine.includes('← back') ||
      lowerLine.includes('refresh') ||
      lowerLine.includes('last page') ||
      lowerLine.includes('next') ||
      lowerLine.includes('auto redeem') ||
      (lowerLine.includes('sell') && !lowerLine.includes('shares')) ||
      lowerLine.includes('limit') ||
      line.match(/^#\s*\d+$/)
    )) {
      break;
    }

    // Detect positions section
    if (line.match(/^#?\d+\./) && line.includes('?')) {
      inPositionsSection = true;
    }

    // Skip non-market rows
    if (inPositionsSection) {
      if (
        lowerLine.includes('total balance') ||
        lowerLine.includes('view profile') ||
        lowerLine.includes('polygonscan') ||
        lowerLine.startsWith('• invested:') ||
        (lowerLine.startsWith('invested:') && !line.includes('?')) ||
        lowerLine.includes('polymarket may have') ||
        lowerLine.includes('delayed price data') ||
        lowerLine.includes('manual trades') ||
        lowerLine.includes('copy trades') ||
        line.match(/^•\s*(Invested|invested)/) ||
        line.trim() === '' ||
        (line.length < 10 && !line.includes('?') && !line.match(/^#?\d+\./))
      ) {
        continue;
      }

      const isNumberedMarket = line.match(/^#?\d+\./) && (line.includes('?') || line.length > 20);
      const isMarketQuestion = line.includes('?') && line.length > 15 && line.match(/^#?\d+\./);

      if (isNumberedMarket || isMarketQuestion) {
        if (currentPosition && currentPosition.marketQuestion) {
          positions.push(currentPosition as PositionParsed);
        }

        let marketText = line.replace(/^#?\d+\.\s*/, '').trim();
        marketText = marketText.replace(/^[✓✔✅]\s*/, '').trim();

        currentPosition = {
          marketQuestion: marketText,
          side: 'Yes',
          entryPrice: 0,
          invested: 0,
          shares: 0,
          value: 0,
          pnlUsd: 0,
          pnlPct: 0,
          expiryTimestamp: null,
          copiedFrom: null,
        };

        if (lowerLine.includes('no') || lowerLine.includes('short')) {
          currentPosition.side = 'No';
        }
      } else if (currentPosition) {
        if (lowerLine.includes('side:') || lowerLine.includes('position:')) {
          if (lowerLine.includes('no') || lowerLine.includes('short')) {
            currentPosition.side = 'No';
          } else {
            currentPosition.side = 'Yes';
          }
        } else if (lowerLine.includes('entry') || lowerLine.includes('entry price')) {
          currentPosition.entryPrice = extractNumber(line) || 0;
        } else if (lowerLine.includes('invested') && !lowerLine.includes('shares')) {
          currentPosition.invested = extractNumber(line) || 0;
        } else if (lowerLine.includes('shares')) {
          currentPosition.shares = extractNumber(line) || 0;
        } else if (lowerLine.includes('value') && !lowerLine.includes('pnl')) {
          currentPosition.value = extractNumber(line) || 0;
        } else if (lowerLine.includes('pnl') || lowerLine.includes('profit')) {
          const pnlMatch = line.match(/([+-]?[\d,]+\.?\d*)\s*\$?\s*\(([+-]?[\d,]+\.?\d*)%\)/);
          if (pnlMatch) {
            currentPosition.pnlUsd = parseFloat(pnlMatch[1].replace(/,/g, '') || '0');
            currentPosition.pnlPct = parseFloat(pnlMatch[2].replace(/,/g, '') || '0');
          } else {
            currentPosition.pnlUsd = extractNumber(line) || 0;
          }
        } else if (lowerLine.includes('expiry') || lowerLine.includes('expires')) {
          currentPosition.expiryTimestamp = extractDate(line) || null;
        } else if (lowerLine.includes('copied') || lowerLine.includes('from') || lowerLine.includes('copy trade by')) {
          currentPosition.copiedFrom = extractTextAfter(line, /copied|from|copy trade by/i) || null;
        }
      }
    }
  }

  // Save last position
  if (currentPosition && currentPosition.marketQuestion) {
    positions.push(currentPosition as PositionParsed);
  }

  return { snapshot, positions };
}

function extractNumber(text: string): number | null {
  const match = text.match(/([+-]?[\d,]+\.?\d*)/);
  if (match) {
    return parseFloat(match[1].replace(/,/g, '')) || null;
  }
  return null;
}

function extractDate(text: string): string | null {
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    return isoMatch[0];
  }

  const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})|(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return dateMatch[0];
  }

  return null;
}

function extractTextAfter(text: string, pattern: RegExp): string | null {
  const match = text.match(new RegExp(pattern.source + '\\s*:?\\s*(.+)', 'i'));
  return match ? match[1].trim() : null;
}
