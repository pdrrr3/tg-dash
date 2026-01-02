# Telegram Portfolio Dashboard

A minimal web dashboard that reads your Polymarket copy-trading portfolio by acting as a Telegram user account (not a bot).

## Features

- Sends `/positions` command to a Telegram bot automatically
- Parses portfolio data (balances, positions, PnL)
- Stores snapshots in SQLite database
- Simple web dashboard with refresh button
- Read-only (no trade execution)

## Prerequisites

1. **Get Telegram API credentials:**
   - Go to https://my.telegram.org/apps
   - Create an application
   - Note your `api_id` and `api_hash`

2. **Know your bot username:**
   - The username of the bot you want to query (without @)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```

3. **Add your API credentials to `.env`:**
   ```env
   TELEGRAM_API_ID=your_api_id
   TELEGRAM_API_HASH=your_api_hash
   TARGET_BOT_USERNAME=your_bot_username
   PORT=3000
   ```

4. **Authenticate with Telegram (one-time setup):**
   ```bash
   npx ts-node src/auth.ts
   ```
   
   This will:
   - Ask for your phone number
   - Send you a code via Telegram
   - Ask for the code
   - Ask for 2FA password if enabled
   - Generate a session string

5. **Add the session string to `.env`:**
   ```env
   TELEGRAM_SESSION=your_session_string_here
   ```

6. **Build and run:**
   ```bash
   npm run build
   npm start
   ```

   Or for development:
   ```bash
   npm run dev
   ```

7. **Open your browser:**
   ```
   http://localhost:3000
   ```
   
   For a read-only view (no auth controls), use:
   ```
   http://localhost:3000/view
   ```

## Usage

1. Click "Refresh Portfolio" to fetch the latest positions from the bot
2. View balances, total PnL, and all positions
3. Data is automatically stored in SQLite (`portfolio.db`)

## API Endpoints

- `POST /api/refresh` - Fetch latest portfolio from Telegram bot
- `GET /api/portfolio/latest` - Get the most recent portfolio snapshot
- `GET /api/portfolio/history?limit=50` - Get portfolio history

## File Structure

```
tg-dash/
├── src/
│   ├── index.ts          # Express server and API routes
│   ├── telegram.ts       # Telegram client using gramjs
│   ├── parser.ts         # Portfolio response parser
│   ├── db.ts             # SQLite database operations
│   ├── types.ts          # TypeScript interfaces
│   └── auth.ts           # One-time authentication helper
├── public/
│   └── index.html        # Dashboard UI
├── package.json
├── tsconfig.json
└── README.md
```

## Database Schema

**portfolio_snapshots:**
- id, total_balance, available_balance, invested, value, total_pnl_usd, total_pnl_pct, timestamp

**positions:**
- id, snapshot_id, market_question, side, entry_price, invested, shares, value, pnl_usd, pnl_pct, expiry_timestamp, copied_from

## Notes

- The parser is defensive and tries to handle various response formats
- Session is persisted in environment variable (no file-based session storage)
- Single user, no authentication required for the web interface
- Read-only operations only

## Troubleshooting

**"Not authorized" error:**
- Run the authentication script again to get a new session string

**Bot not responding:**
- Make sure the bot username is correct (without @)
- Check that you've sent `/positions` manually at least once before
- The bot must be in your chats

**Parser issues:**
- The parser tries to be flexible, but if the bot's response format changes significantly, you may need to update `src/parser.ts`

