export async function register() {
  // Only run on the Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[INSTRUMENTATION] Initializing server-side services...');

    try {
      // Import dynamically to avoid issues with edge runtime
      const { initializeTelegramClient } = await import('./lib/telegram');
      const { startScheduler } = await import('./lib/scheduler');

      // Initialize Telegram client
      const client = await initializeTelegramClient();

      if (client) {
        console.log('[INSTRUMENTATION] Telegram client initialized');

        // Start the scheduler for auto-refresh and health checks
        startScheduler();
        console.log('[INSTRUMENTATION] Scheduler started');
      } else {
        console.log(
          '[INSTRUMENTATION] Telegram client not initialized (missing credentials)'
        );
      }
    } catch (error) {
      console.error('[INSTRUMENTATION] Error during initialization:', error);
    }
  }
}
