import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { submitCode, getAuthSession } from '@/lib/auth-sessions';
import { saveTelegramSession } from '@/lib/db';
import { initializeTelegramClient } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, code } = body;

    if (!sessionId || !code) {
      return NextResponse.json(
        { success: false, error: 'Session ID and code are required' },
        { status: 400 }
      );
    }

    const session = getAuthSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found. Please start over.' },
        { status: 404 }
      );
    }

    const result = await submitCode(sessionId, code);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    // If authentication is complete, save session and initialize client
    if (result.sessionString) {
      await saveTelegramSession(result.sessionString);

      // Update environment variable for this process
      process.env.TELEGRAM_SESSION = result.sessionString;

      // Initialize the Telegram client
      await initializeTelegramClient();

      console.log('[AUTH] Authentication complete, session saved');
    }

    // Don't expose session string to frontend
    const { sessionString, ...safeResult } = result;
    return NextResponse.json(safeResult);
  } catch (error) {
    console.error('[AUTH] Error submitting code:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit code',
      },
      { status: 500 }
    );
  }
}
