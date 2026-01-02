import { NextResponse } from 'next/server';
import { getTelegramClient } from '@/lib/telegram';

export async function GET() {
  try {
    const apiId = process.env.TELEGRAM_API_ID;
    const apiHash = process.env.TELEGRAM_API_HASH;
    const session = process.env.TELEGRAM_SESSION;
    const botUsername = process.env.TARGET_BOT_USERNAME;

    const configured = !!(apiId && apiHash && session && botUsername);
    const client = getTelegramClient();
    const connected = client ? await client.checkConnection() : false;

    return NextResponse.json({
      configured,
      connected,
      hasApiCredentials: !!(apiId && apiHash),
      hasSession: !!session,
      hasBotUsername: !!botUsername,
    });
  } catch (error) {
    console.error('[AUTH] Error checking status:', error);
    return NextResponse.json(
      { error: 'Failed to check auth status' },
      { status: 500 }
    );
  }
}
