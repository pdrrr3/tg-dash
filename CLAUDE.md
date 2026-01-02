# tg-dash

Telegram Portfolio Dashboard - A web-based monitoring tool for Polymarket copy-trading positions via Telegram.

## Quick Reference

```bash
npm run dev              # Development server (port 3000)
npm run build            # Production build
npm start                # Production server
npm run fetch-historical # Backfill data from Telegram history
```

## Project Overview

This app connects to Telegram as a **user account** (not a bot) using gramjs, sends `/positions` to a target bot, parses the response, stores snapshots in SQLite via Prisma, and displays data through a React dashboard with charts.

**Key characteristics:**
- Read-only monitoring (no trade execution)
- Auto-refresh every 5 minutes with 2-minute health checks
- Copy-trading change detection (alerts when traders added/removed)
- Historical data backfill from Telegram chat history

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript 5 (strict mode)
- **UI:** React 19 + shadcn/ui + Tailwind CSS v4
- **Database:** SQLite via Prisma 7 ORM (better-sqlite3 adapter)
- **Data Fetching:** React Query (@tanstack/react-query)
- **Charts:** Chart.js 4 + react-chartjs-2
- **Telegram:** gramjs (telegram package) - user account authentication

## Architecture

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout with providers
│   ├── page.tsx                  # Dashboard page
│   ├── auth/page.tsx             # Authentication page
│   └── api/                      # API Route Handlers
│       ├── auth/                 # Auth endpoints (start, phone, code, password, status)
│       ├── portfolio/            # Portfolio endpoints (latest, history, balance-history)
│       ├── refresh/route.ts      # Force refresh from Telegram
│       └── historical/route.ts   # Backfill from chat history
├── components/
│   ├── dashboard/                # Dashboard components
│   │   ├── header.tsx            # Title, status, links
│   │   ├── balance-cards.tsx     # Balance summary cards
│   │   ├── balance-chart.tsx     # Line chart with time range
│   │   └── positions-table.tsx   # Positions data table
│   ├── auth/                     # Auth flow components
│   │   ├── auth-form.tsx         # Multi-step form wrapper
│   │   ├── phone-step.tsx        # Phone number input
│   │   ├── code-step.tsx         # Verification code input
│   │   └── password-step.tsx     # 2FA password input
│   └── ui/                       # shadcn/ui components
├── lib/
│   ├── db.ts                     # Prisma client & database operations
│   ├── telegram.ts               # TelegramPortfolioClient singleton
│   ├── parser.ts                 # Portfolio response parser
│   ├── auth-sessions.ts          # In-memory auth session management
│   ├── scheduler.ts              # Auto-refresh & health check intervals
│   ├── types.ts                  # TypeScript interfaces
│   └── utils.ts                  # Utility functions (cn, etc.)
├── hooks/
│   ├── use-portfolio.ts          # React Query hook for portfolio data
│   └── use-balance-history.ts    # React Query hook for chart data
├── providers/
│   └── query-provider.tsx        # React Query provider
├── instrumentation.ts            # Server startup (Telegram init, scheduler)
└── generated/prisma/             # Generated Prisma client
```

### Key Files

| File | Purpose |
|------|---------|
| `src/instrumentation.ts` | Server startup hook - initializes Telegram client and scheduler |
| `src/lib/telegram.ts` | `TelegramPortfolioClient` class, connection management, message fetching |
| `src/lib/parser.ts` | `parsePortfolioResponse()` - extracts balances, positions, P&L from bot text |
| `src/lib/db.ts` | Prisma client singleton, all database CRUD operations |
| `src/lib/scheduler.ts` | Background auto-refresh (5min) and health checks (2min) |
| `src/lib/auth-sessions.ts` | In-memory auth session Map with cleanup (persists across hot reload) |

## API Endpoints

```
GET  /api/portfolio/latest          # Most recent snapshot with positions
GET  /api/portfolio/history         # Historical snapshots
GET  /api/portfolio/balance-history # Balance history for charts (supports ?range=24h|48h|3d|7d|all)
POST /api/refresh                   # Force portfolio refresh from Telegram
POST /api/historical                # Backfill from Telegram chat history

# Authentication
GET  /api/auth/status               # Check auth state
POST /api/auth/start                # Start auth flow (creates session)
POST /api/auth/phone                # Submit phone number
POST /api/auth/code                 # Submit verification code
POST /api/auth/password             # Submit 2FA password
```

## Database Schema (Prisma)

Defined in `prisma/schema.prisma`:

- **PortfolioSnapshot** - Portfolio state at a point in time (balances, P&L, timestamp)
- **Position** - Individual positions linked to snapshots (market, side, entry, value, copiedFrom)
- **CopyTradingEvent** - Tracks when copy-trading sources change
- **AppSetting** - Key-value store for app settings (Telegram session, etc.)

```bash
npx prisma generate      # Regenerate client after schema changes
npx prisma db push       # Push schema to database
npx prisma studio        # Open database GUI
```

## Environment Variables

Required in `.env` or `.env.local`:
```env
TELEGRAM_API_ID=<from my.telegram.org/apps>
TELEGRAM_API_HASH=<from my.telegram.org/apps>
TELEGRAM_SESSION=<generated after authentication, also saved to DB>
TARGET_BOT_USERNAME=<bot to query, @ optional>
DATABASE_URL=file:./portfolio.db
```

## Coding Conventions

- **Strict TypeScript** - All code must pass `strict: true`
- **Async/await** - Use throughout, no raw callbacks
- **Naming:** PascalCase components/classes, camelCase functions/variables
- **Logging:** Use prefixes like `[TELEGRAM]`, `[AUTH]`, `[SCHEDULER]`
- **Components:** Use shadcn/ui primitives, extend with Tailwind classes

### Parser Guidelines

The parser in `src/lib/parser.ts` must be **defensive**:
- Handle multiple text formats from the bot
- Use fallback patterns when primary regex fails
- Never throw on parse failure - return partial data with defaults
- Log first 1000 chars of responses for debugging

### Database Guidelines

- Use Prisma client from `src/lib/db.ts` (singleton pattern)
- All operations are async
- Check for duplicates using `snapshotExistsNearTimestamp()` (5-minute window)
- App settings (like Telegram session) stored in `AppSetting` table

### Auth Session Guidelines

- Auth sessions stored in memory Map (persists via `globalThis` in dev)
- Sessions timeout after 10 minutes
- Cleanup runs every 2 minutes
- After successful auth, session saved to both DB and `process.env`

## Common Tasks

### Adding a new API endpoint
1. Create route file in `src/app/api/[endpoint]/route.ts`
2. Export async `GET`, `POST`, etc. functions
3. Use `NextResponse.json()` for responses
4. Add types to `src/lib/types.ts` if needed

### Adding a new UI component
1. For primitives: `npx shadcn@latest add [component]`
2. For custom: Create in `src/components/[feature]/`
3. Use `cn()` utility for conditional classes

### Modifying the parser
1. Test with actual bot responses (check server logs for format)
2. Add fallback patterns, don't replace existing ones
3. Handle missing fields gracefully with defaults

### Adding database fields
1. Update `prisma/schema.prisma`
2. Run `npx prisma db push` (dev) or migrate (prod)
3. Run `npx prisma generate`
4. Update types in `src/lib/types.ts` if needed

## Background Jobs

The scheduler runs via `src/instrumentation.ts` on server startup:

- **Auto-refresh:** Every 5 minutes, fetches latest portfolio from Telegram
- **Health check:** Every 2 minutes, verifies Telegram connection is alive

This works on platforms with persistent Node.js processes (Railway, Render, etc.).

## Important Notes

- **User account, not bot:** This connects as a Telegram user, not a bot. The session is sensitive - never commit `.env`
- **Rate limits:** Telegram has strict rate limits. The app detects FLOOD errors and shows wait times
- **Connection health:** Auto-refresh includes health checks to prevent connection drops
- **Hot reload safety:** Auth sessions and Prisma client use `globalThis` to persist across Next.js hot reloads
- **AUTH_KEY_DUPLICATED:** If you see this error, another instance is using the same session. Stop it and re-authenticate.
