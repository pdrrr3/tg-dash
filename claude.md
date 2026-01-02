# tg-dash

Telegram Portfolio Dashboard - A web-based monitoring tool for Polymarket copy-trading positions via Telegram.

## Quick Reference

```bash
npm run dev      # Development server with hot reload (port 3001)
npm run build    # Compile TypeScript to dist/
npm start        # Production server from dist/
```

## Project Overview

This app connects to Telegram as a **user account** (not a bot) using gramjs, sends `/positions` to a target bot, parses the response, stores snapshots in SQLite, and displays data through a web dashboard with charts.

**Key characteristics:**
- Read-only monitoring (no trade execution)
- Auto-refresh every 5 minutes with 2-minute health checks
- Copy-trading change detection (alerts when traders added/removed)
- Historical data backfill from Telegram chat history
- Dual views: authenticated dashboard (/) and shareable read-only view (/view)

## Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript 5.3 (strict mode)
- **Server:** Express 4.18
- **Database:** SQLite3 (file-based, persistent)
- **Telegram:** gramjs (telegram package) - user account authentication
- **Frontend:** Vanilla JS + Chart.js 4.4 (CDN)

## Architecture

```
src/
├── index.ts      # Express server, API routes, auto-refresh scheduler
├── telegram.ts   # TelegramPortfolioClient - gramjs wrapper
├── parser.ts     # parsePortfolioResponse - defensive text parser
├── db.ts         # SQLite operations, schema, CRUD
├── auth-web.ts   # Multi-step web auth flow (phone→code→password)
├── auth.ts       # CLI auth helper (one-time setup)
└── types.ts      # TypeScript interfaces

public/
├── index.html    # Main dashboard (with auth controls)
├── view.html     # Read-only view (safe to share)
└── auth.html     # Authentication page
```

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point. Express routes, auto-refresh logic, copy-trading detection |
| `src/telegram.ts` | `TelegramPortfolioClient` class. Connection management, message sending/fetching |
| `src/parser.ts` | `parsePortfolioResponse()`. Extracts balances, positions, P&L from bot text |
| `src/db.ts` | Database layer. Schema init, snapshot/position CRUD, trader tracking |
| `src/types.ts` | `PortfolioSnapshot`, `Position`, `CopyTradingEvent` interfaces |

## API Endpoints

```
GET  /api/portfolio/latest     # Most recent snapshot with positions
GET  /api/portfolio/history    # Historical snapshots (24h default)
GET  /api/balance/history      # Balance history for charts
POST /api/refresh              # Force portfolio refresh from Telegram
POST /api/fetch-historical     # Backfill from Telegram chat history

# Authentication
GET  /api/auth/status          # Check auth state
POST /api/auth/start           # Start auth (phone number)
POST /api/auth/code            # Submit verification code
POST /api/auth/password        # Submit 2FA password
POST /api/auth/cancel          # Cancel auth flow
```

## Database Schema

Three tables in `portfolio.db`:

- **portfolio_snapshots** - Portfolio state at a point in time (balances, P&L, timestamp)
- **positions** - Individual positions linked to snapshots (market, side, entry, value, copied_from)
- **copy_trading_events** - Tracks when copy-trading sources change

## Environment Variables

Required in `.env`:
```env
TELEGRAM_API_ID=<from my.telegram.org/apps>
TELEGRAM_API_HASH=<from my.telegram.org/apps>
TELEGRAM_SESSION=<generated after authentication>
TARGET_BOT_USERNAME=<bot to query, @ optional>
```

Optional:
```env
PORT=3001                    # Server port (default: 3001)
DATABASE_PATH=./portfolio.db # SQLite file path
```

## Coding Conventions

- **Strict TypeScript** - All code must pass `strict: true`
- **Async/await** - Use throughout, no raw callbacks
- **Naming:** PascalCase classes, camelCase functions/variables
- **Logging:** Use prefixes like `[TELEGRAM]`, `[AUTH]`, `[AUTO-REFRESH]`
- **Error handling:** Try-catch with graceful degradation, always log errors

### Parser Guidelines

The parser in `parser.ts` must be **defensive**:
- Handle multiple text formats from the bot
- Use fallback patterns when primary regex fails
- Never throw on parse failure - return partial data with defaults
- Log first 1000 chars of responses for debugging

### Database Guidelines

- All database functions return Promises (wrapped callbacks)
- Use parameterized queries to prevent SQL injection
- Check for duplicates using timestamp tolerance (5-minute window)
- Initialize schema on startup via `initializeDatabase()`

## Testing

No automated tests currently. Manual testing:
- Dashboard: http://localhost:3001
- Read-only view: http://localhost:3001/view
- Auth flow: http://localhost:3001/auth.html

## Deployment

Supported platforms: Railway (recommended), Render, Fly.io, DigitalOcean

**Critical:** Database must be on persistent storage. Set `DATABASE_PATH` to persistent volume path.

Config files:
- `render.yaml` - Render deployment
- `railway.json` - Railway deployment

## Common Tasks

### Adding a new API endpoint
1. Add route in `src/index.ts`
2. Add any new types to `src/types.ts`
3. Add database operations to `src/db.ts` if needed

### Modifying the parser
1. Test with actual bot responses (check logs for format)
2. Add fallback patterns, don't replace existing ones
3. Handle missing fields gracefully with defaults

### Adding database fields
1. Update schema in `db.ts` `initializeDatabase()`
2. Update relevant interfaces in `types.ts`
3. Update save/get functions in `db.ts`
4. Note: SQLite doesn't support easy migrations - may need to drop/recreate tables in dev

## Important Notes

- **User account, not bot:** This connects as a Telegram user, not a bot. The session is sensitive - never commit `.env`
- **Rate limits:** Telegram has strict rate limits. The app detects FLOOD errors and shows wait times
- **Connection health:** Auto-refresh includes health checks to prevent connection drops
- **Graceful startup:** Server starts even without credentials, allowing auth via web UI later
