# Deployment Guide

This guide covers deploying the Telegram Portfolio Dashboard to various platforms.

## Prerequisites

1. Ensure your `.env` file has all required variables:
   - `TELEGRAM_API_ID`
   - `TELEGRAM_API_HASH`
   - `TELEGRAM_SESSION`
   - `TARGET_BOT_USERNAME`
   - `PORT` (optional, defaults to 3000)

2. Build the project locally to ensure it compiles:
   ```bash
   npm run build
   ```

## Deployment Options

### Option 1: Railway (Recommended)

Railway is the easiest option with persistent storage support.

1. **Sign up at [railway.app](https://railway.app)**

2. **Create a new project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo" (or upload the code)

3. **Add environment variables:**
   - Go to your project → Variables
   - Add all variables from your `.env` file:
     - `TELEGRAM_API_ID`
     - `TELEGRAM_API_HASH`
     - `TELEGRAM_SESSION`
     - `TARGET_BOT_USERNAME`
     - `PORT` (optional)

4. **Deploy:**
   - Railway will automatically detect the Node.js app
   - It will run `npm run build` and `npm start`
   - Your app will be live at `https://your-app-name.up.railway.app`

5. **Persistent storage:**
   - Railway provides persistent storage by default
   - Your `portfolio.db` file will persist across deployments

6. **Access your view page:**
   - Main dashboard: `https://your-app-name.up.railway.app`
   - View-only page: `https://your-app-name.up.railway.app/view`

### Option 2: Render

1. **Sign up at [render.com](https://render.com)**

2. **Create a new Web Service:**
   - Connect your GitHub repository
   - Select "Node" as the environment
   - Build Command: `npm run build`
   - Start Command: `npm start`

3. **Add environment variables:**
   - Go to Environment → Environment Variables
   - Add all variables from your `.env` file

4. **Add persistent disk (for database):**
   - Go to Settings → Persistent Disk
   - Create a disk (1GB is enough)
   - Mount path: `/opt/render/project/src`

5. **Deploy:**
   - Render will build and deploy automatically
   - Your app will be live at `https://your-app-name.onrender.com`

### Option 3: Fly.io

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login:**
   ```bash
   fly auth login
   ```

3. **Create app:**
   ```bash
   fly launch
   ```

4. **Set environment variables:**
   ```bash
   fly secrets set TELEGRAM_API_ID=your_id
   fly secrets set TELEGRAM_API_HASH=your_hash
   fly secrets set TELEGRAM_SESSION=your_session
   fly secrets set TARGET_BOT_USERNAME=your_bot
   ```

5. **Deploy:**
   ```bash
   fly deploy
   ```

### Option 4: DigitalOcean App Platform

1. **Sign up at [digitalocean.com](https://digitalocean.com)**

2. **Create a new App:**
   - Connect your GitHub repository
   - Select Node.js
   - Build Command: `npm run build`
   - Run Command: `npm start`

3. **Add environment variables:**
   - Add all variables from your `.env` file

4. **Deploy:**
   - DigitalOcean will build and deploy automatically

## Important Notes

- **Database persistence:** Make sure your hosting platform supports persistent storage for the SQLite database file (`portfolio.db`)
- **Port binding:** The app uses `process.env.PORT` or defaults to 3000. Most platforms set `PORT` automatically.
- **View page:** Accessible at `/view` route on your deployed domain
- **Auto-refresh:** The app auto-refreshes every 5 minutes, so it needs to stay running

## Post-Deployment

1. **Test the view page:**
   - Visit `https://your-domain.com/view`
   - It should load without authentication

2. **Monitor logs:**
   - Check platform logs for any errors
   - Ensure Telegram connection is working

3. **Share the view URL:**
   - The `/view` route is read-only and safe to share
   - It doesn't expose authentication controls

## Troubleshooting

**Database not persisting:**
- Ensure your platform supports persistent volumes/disks
- Check that the database file path is writable

**Telegram connection fails:**
- Verify environment variables are set correctly
- Check that `TELEGRAM_SESSION` is valid
- Review platform logs for connection errors

**Port errors:**
- Most platforms set `PORT` automatically
- If not, set `PORT=10000` (or your platform's required port)

