import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { submitPassword, getAuthSession } from '@/lib/auth-sessions';
import { saveTelegramSession } from '@/lib/db';
import { initializeTelegramClient } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, password } = body;

    if (!sessionId || !password) {
      return NextResponse.json(
        { success: false, error: 'Session ID and password are required' },
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

    const result = await submitPassword(sessionId, password);

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
    console.error('[AUTH] Error submitting password:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit password',
      },
      { status: 500 }
    );
  }
}
