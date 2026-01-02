import { NextResponse } from 'next/server';
import { createAuthSession } from '@/lib/auth-sessions';
import { randomUUID } from 'crypto';

export async function POST() {
  try {
    const apiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
    const apiHash = process.env.TELEGRAM_API_HASH || '';

    if (!apiId || !apiHash) {
      return NextResponse.json(
        {
          success: false,
          error:
            'TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in environment variables. Get them from https://my.telegram.org/apps',
        },
        { status: 400 }
      );
    }

    const sessionId = randomUUID();

    try {
      createAuthSession(sessionId, apiId, apiHash);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create auth session',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      sessionId,
      nextStep: 'phone',
    });
  } catch (error) {
    console.error('[AUTH] Error starting auth:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start auth',
      },
      { status: 500 }
    );
  }
}
