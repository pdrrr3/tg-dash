# tg-dash

Telegram Portfolio Dashboard for monitoring Polymarket copy-trading positions.

## Features

- Real-time portfolio monitoring via Telegram bot
- Balance history charts with per-trader breakdown
- Auto-refresh every 5 minutes
- Historical data backfill
- Copy-trading change detection

## Tech Stack

- Next.js 16 + React 19
- shadcn/ui + Tailwind CSS v4
- Prisma 7 + SQLite
- React Query
- Chart.js

## Setup

1. **Get Telegram API credentials** from [my.telegram.org/apps](https://my.telegram.org/apps)

2. **Create `.env.local`:**
   ```env
   TELEGRAM_API_ID=your_api_id
   TELEGRAM_API_HASH=your_api_hash
   TARGET_BOT_USERNAME=your_bot_username
   DATABASE_URL=file:./portfolio.db
   ```

3. **Install and run:**
   ```bash
   npm install
   npx prisma generate
   npx prisma db push
   npm run dev
   ```

4. **Authenticate** at [localhost:3000/auth](http://localhost:3000/auth)

## Scripts

```bash
npm run dev              # Development server
npm run build            # Production build
npm run fetch-historical # Backfill from Telegram history
```

## Deployment

Requires a platform with persistent Node.js process (Railway, Render, etc.) for background refresh. Not suitable for serverless (Vercel) due to Telegram connection requirements.

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation.
