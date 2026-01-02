import { ParsedPortfolio, PortfolioSnapshot, Position } from './types';

export function parsePortfolioResponse(text: string, timestamp?: Date): ParsedPortfolio {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const snapshot: PortfolioSnapshot = {
    total_balance: 0,
    available_balance: 0,
    invested: 0,
    value: 0,
    total_pnl_usd: 0,
    total_pnl_pct: 0,
    timestamp: timestamp ? timestamp.toISOString() : new Date().toISOString(),
    total_positions: 0,
  };

  const positions: Position[] = [];
  let currentPosition: Partial<Position> | null = null;
  let inPositionsSection = false;
  let foundFirstPosition = false;

  // Extract total positions count from header (e.g., "Manage your Positions(11)")
  const headerMatch = text.match(/Positions\s*\((\d+)\)/i);
  if (headerMatch) {
    snapshot.total_positions = parseInt(headerMatch[1], 10);
  }

  // First pass: Extract summary/balance information from the top (before positions)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Stop when we hit the first position
    if (line.match(/^#?\d+\./) && line.includes('?')) {
      foundFirstPosition = true;
      break;
    }

    // Parse balances from summary section (before positions start)
    // Look for patterns like "Total Balance: $90.2" or "Total Balance $90.2"
    if (lowerLine.includes('total balance')) {
      const balance = extractNumber(line);
      if (balance !== null && balance >= 0) {
        snapshot.total_balance = balance;
      }
    } else if (lowerLine.includes('available balance') || (lowerLine.includes('available') && lowerLine.includes('balance'))) {
      const available = extractNumber(line);
      if (available !== null && available >= 0) {
        snapshot.available_balance = available;
      }
    } else if (lowerLine.includes('invested') && !lowerLine.includes('shares') && !line.match(/^#?\d+\./) && !line.startsWith('•') && !line.match(/^#\s*\d+$/)) {
      // Only parse standalone "Invested:" lines, not position details or summary rows
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
        snapshot.total_pnl_usd = sign * parseFloat(pnlMatch[2].replace(/,/g, '') || '0');
        const pctSign = pnlMatch[3] === '-' ? -1 : 1;
        snapshot.total_pnl_pct = pctSign * parseFloat(pnlMatch[4].replace(/,/g, '') || '0');
      } else {
        // Fallback: try to extract just the number (will handle negative signs)
        const pnl = extractNumber(line);
        if (pnl !== null) {
          snapshot.total_pnl_usd = pnl;
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
      line.match(/^#\s*\d+$/) // Pagination buttons like "# 1", "# 2"
    )) {
      break; // We've hit the bottom controls, stop parsing
    }

    // Detect positions section - look for numbered positions (#1., #2., etc.)
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
        continue; // Skip this row, it's not a market
      }

      // Check if this line starts a new position (numbered with # or number, contains question mark)
      const isNumberedMarket = line.match(/^#?\d+\./) && (line.includes('?') || line.length > 20);
      const isMarketQuestion = line.includes('?') && line.length > 15 && line.match(/^#?\d+\./);
      
      if (isNumberedMarket || isMarketQuestion) {
        // Save previous position if exists
        if (currentPosition && currentPosition.market_question) {
          positions.push(currentPosition as Position);
        }
        
        // Clean up the market question (remove checkmarks, numbers, etc.)
        let marketText = line.replace(/^#?\d+\.\s*/, '').trim();
        marketText = marketText.replace(/^[✓✔✅]\s*/, '').trim(); // Remove checkmarks
        
        // Start new position
        currentPosition = {
          market_question: marketText,
          side: 'Yes',
          entry_price: 0,
          invested: 0,
          shares: 0,
          value: 0,
          pnl_usd: 0,
          pnl_pct: 0,
          expiry_timestamp: null,
          copied_from: null,
        };

        // Try to extract side from the line
        if (lowerLine.includes('no') || lowerLine.includes('short')) {
          currentPosition.side = 'No';
        }
      } else if (currentPosition) {
        // Parse position details
        if (lowerLine.includes('side:') || lowerLine.includes('position:')) {
          if (lowerLine.includes('no') || lowerLine.includes('short')) {
            currentPosition.side = 'No';
          } else {
            currentPosition.side = 'Yes';
          }
        } else if (lowerLine.includes('entry') || lowerLine.includes('entry price')) {
          currentPosition.entry_price = extractNumber(line) || 0;
        } else if (lowerLine.includes('invested') && !lowerLine.includes('shares')) {
          currentPosition.invested = extractNumber(line) || 0;
        } else if (lowerLine.includes('shares')) {
          currentPosition.shares = extractNumber(line) || 0;
        } else if (lowerLine.includes('value') && !lowerLine.includes('pnl')) {
          currentPosition.value = extractNumber(line) || 0;
        } else if (lowerLine.includes('pnl') || lowerLine.includes('profit')) {
          const pnlMatch = line.match(/([+-]?[\d,]+\.?\d*)\s*\$?\s*\(([+-]?[\d,]+\.?\d*)%\)/);
          if (pnlMatch) {
            currentPosition.pnl_usd = parseFloat(pnlMatch[1].replace(/,/g, '') || '0');
            currentPosition.pnl_pct = parseFloat(pnlMatch[2].replace(/,/g, '') || '0');
          } else {
            currentPosition.pnl_usd = extractNumber(line) || 0;
          }
        } else if (lowerLine.includes('expiry') || lowerLine.includes('expires')) {
          currentPosition.expiry_timestamp = extractDate(line) || null;
        } else if (lowerLine.includes('copied') || lowerLine.includes('from') || lowerLine.includes('copy trade by')) {
          currentPosition.copied_from = extractTextAfter(line, /copied|from|copy trade by/i) || null;
        }
      }
    }
  }

  // Save last position
  if (currentPosition && currentPosition.market_question) {
    positions.push(currentPosition as Position);
  }

  return { snapshot, positions };
}

function extractNumber(text: string): number | null {
  // Match numbers with optional commas and decimals, optionally with $ sign
  const match = text.match(/([+-]?[\d,]+\.?\d*)/);
  if (match) {
    return parseFloat(match[1].replace(/,/g, '')) || null;
  }
  return null;
}

function extractDate(text: string): string | null {
  // Try to extract ISO date or common date formats
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    return isoMatch[0];
  }
  
  // Try other formats
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
