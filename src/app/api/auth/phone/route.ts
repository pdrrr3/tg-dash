import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { submitPhoneNumber, getAuthSession } from '@/lib/auth-sessions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, phoneNumber } = body;

    if (!sessionId || !phoneNumber) {
      return NextResponse.json(
        { success: false, error: 'Session ID and phone number are required' },
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

    const result = await submitPhoneNumber(sessionId, phoneNumber);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[AUTH] Error submitting phone:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit phone number',
      },
      { status: 500 }
    );
  }
}
