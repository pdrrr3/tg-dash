import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

interface AuthSession {
  client: TelegramClient;
  phoneNumber?: string;
  step: 'phone' | 'code' | 'password' | 'complete';
  handlers: {
    phoneNumber?: () => Promise<string>;
    phoneCode?: () => Promise<string>;
    password?: () => Promise<string>;
  };
  resolvers: {
    phoneNumber?: (value: string) => void;
    phoneCode?: (value: string) => void;
    password?: (value: string) => void;
  };
  startPromise?: Promise<void>;
  authError?: Error;
  createdAt: number;
}

// Session timeout: 10 minutes
const AUTH_SESSION_TIMEOUT_MS = 10 * 60 * 1000;

const authSessions = new Map<string, AuthSession>();

// Cleanup stale auth sessions
function cleanupStaleSessions(): void {
  const now = Date.now();
  for (const [sessionId, session] of authSessions.entries()) {
    if (now - session.createdAt > AUTH_SESSION_TIMEOUT_MS) {
      console.log(`[AUTH] Cleaning up stale session: ${sessionId}`);
      session.client.disconnect().catch(() => {});
      authSessions.delete(sessionId);
    }
  }
}

// Run cleanup every 2 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupStaleSessions, 2 * 60 * 1000);
}

export function createAuthSession(
  sessionId: string,
  apiId: number,
  apiHash: string
): void {
  if (!apiId || apiId === 0) {
    throw new Error(
      'TELEGRAM_API_ID is missing or invalid. Please add it to your .env file. Get it from https://my.telegram.org/apps'
    );
  }

  if (!apiHash || typeof apiHash !== 'string' || apiHash.trim() === '') {
    throw new Error(
      'TELEGRAM_API_HASH is missing or invalid. Please add it to your .env file. Get it from https://my.telegram.org/apps'
    );
  }

  console.log(
    '[AUTH] Creating TelegramClient with API_ID:',
    apiId,
    'API_HASH:',
    apiHash.substring(0, 4) + '...'
  );

  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    requestRetries: 5,
    floodSleepThreshold: 60,
    retryDelay: 2000,
  });

  const handlers: AuthSession['handlers'] = {};
  const resolvers: AuthSession['resolvers'] = {};

  handlers.phoneNumber = () => {
    return new Promise((resolve) => {
      resolvers.phoneNumber = resolve;
    });
  };

  handlers.phoneCode = () => {
    return new Promise((resolve) => {
      resolvers.phoneCode = resolve;
    });
  };

  handlers.password = async () => {
    return new Promise((resolve) => {
      resolvers.password = resolve;
    });
  };

  authSessions.set(sessionId, {
    client,
    step: 'phone',
    handlers,
    resolvers,
    createdAt: Date.now(),
  });
}

export async function submitPhoneNumber(
  sessionId: string,
  phoneNumber: string
): Promise<{ success: boolean; error?: string; nextStep?: string }> {
  const authSession = authSessions.get(sessionId);
  if (!authSession) {
    return {
      success: false,
      error: 'Session not found. Please refresh the page and try again.',
    };
  }

  try {
    authSession.phoneNumber = phoneNumber;

    console.log('[AUTH] Connecting to Telegram...');
    await authSession.client.connect();
    console.log('[AUTH] Client connected, starting authentication for:', phoneNumber);

    authSession.handlers.phoneNumber = async () => {
      console.log(
        '[AUTH] Phone number handler called by client.start(), returning:',
        phoneNumber
      );
      return phoneNumber;
    };

    authSession.handlers.phoneCode = async () => {
      console.log('[AUTH] Phone code handler called - code was sent!');
      return new Promise((resolve) => {
        authSession.resolvers.phoneCode = resolve;
      });
    };

    authSession.handlers.password = async () => {
      console.log('Password handler called - waiting for password...');
      return new Promise((resolve) => {
        authSession.resolvers.password = resolve;
      });
    };

    let startError: Error | null = null;

    authSession.startPromise = authSession.client
      .start({
        phoneNumber: authSession.handlers.phoneNumber!,
        phoneCode: authSession.handlers.phoneCode!,
        password: authSession.handlers.password,
        onError: (err: Error) => {
          console.error('Auth error in client.start():', err);
          authSession.authError = err;
          startError = err;
        },
      })
      .catch((err) => {
        console.error('Auth start failed:', err);
        authSession.authError = err;
        startError = err;
        throw err;
      });

    console.log('[AUTH] Starting authentication flow...');

    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (authSession.authError || startError) {
        const error = authSession.authError || startError;
        console.error('[AUTH] Error detected:', error);

        const errorMessage =
          (error as { errorMessage?: string }).errorMessage || error?.message || '';
        const errorCode = (error as { code?: number }).code;

        if (
          errorMessage === 'FLOOD' ||
          errorCode === 420 ||
          errorMessage.includes('FLOOD')
        ) {
          const waitSeconds = (error as { seconds?: number }).seconds || 300;
          const waitMinutes = Math.ceil(waitSeconds / 60);
          return {
            success: false,
            error: `Too many code requests. Please wait ${waitMinutes} minutes before trying again.`,
          };
        }

        return {
          success: false,
          error: errorMessage || 'Failed to send code. Please check your phone number.',
        };
      }

      if (i >= 3) {
        console.log('[AUTH] Code should have been sent by now');
        break;
      }
    }

    console.log('[AUTH] Code should be sent. Check your Telegram app.');

    authSession.step = 'code';
    return { success: true, nextStep: 'code' };
  } catch (error) {
    console.error('Error in submitPhoneNumber:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send code',
    };
  }
}

export async function submitCode(
  sessionId: string,
  code: string
): Promise<{
  success: boolean;
  error?: string;
  nextStep?: string;
  needsPassword?: boolean;
  sessionString?: string;
}> {
  const authSession = authSessions.get(sessionId);
  if (!authSession) {
    return { success: false, error: 'Session not found' };
  }

  try {
    console.log('Submitting code:', code);

    if (authSession.resolvers.phoneCode) {
      console.log('Resolving phoneCode promise with code');
      authSession.resolvers.phoneCode(code);
    } else {
      authSession.handlers.phoneCode = async () => code;
    }

    let authComplete = false;
    let needsPassword = false;
    let authError: Error | null = null;

    const checkAuth = async () => {
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));

        try {
          if (await authSession.client.checkAuthorization()) {
            authComplete = true;
            return;
          }
        } catch {
          // Might need password
        }

        try {
          await Promise.race([
            authSession.startPromise!,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 100)),
          ]);
          break;
        } catch (err) {
          const errMsg =
            (err as { errorMessage?: string }).errorMessage ||
            (err as Error).message ||
            String(err);
          if (errMsg.includes('PASSWORD') || errMsg.includes('password')) {
            needsPassword = true;
            return;
          }
          if (!errMsg.includes('timeout')) {
            authError = err as Error;
            return;
          }
        }
      }
    };

    await checkAuth();

    if (authComplete) {
      const sessionString = (authSession.client.session as StringSession).save() as string;
      authSession.step = 'complete';
      await authSession.client.disconnect();
      authSessions.delete(sessionId);
      console.log('Authentication successful!');
      return { success: true, nextStep: 'complete', sessionString };
    }

    if (
      needsPassword ||
      (authError && (authError as { errorMessage?: string }).errorMessage?.includes('PASSWORD'))
    ) {
      authSession.step = 'password';
      console.log('Password required');
      return { success: true, nextStep: 'password', needsPassword: true };
    }

    if (authError) {
      const errorMsg =
        (authError as { errorMessage?: string }).errorMessage ||
        (authError as Error).message ||
        String(authError);
      if (
        errorMsg.includes('PHONE_CODE') ||
        errorMsg.includes('code') ||
        errorMsg.includes('CODE')
      ) {
        return { success: false, error: 'Invalid verification code. Please try again.' };
      }
      return { success: false, error: errorMsg || 'Authentication failed' };
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await authSession.client.checkAuthorization()) {
      const sessionString = (authSession.client.session as StringSession).save() as string;
      authSession.step = 'complete';
      await authSession.client.disconnect();
      authSessions.delete(sessionId);
      return { success: true, nextStep: 'complete', sessionString };
    }

    authSession.step = 'password';
    return { success: true, nextStep: 'password', needsPassword: true };
  } catch (error) {
    console.error('Error in submitCode:', error);
    const errorMsg =
      (error as { errorMessage?: string }).errorMessage ||
      (error as Error).message ||
      'Invalid code';

    if (errorMsg.includes('PASSWORD') || errorMsg.includes('password')) {
      authSession.step = 'password';
      return { success: true, nextStep: 'password', needsPassword: true };
    }

    return { success: false, error: errorMsg };
  }
}

export async function submitPassword(
  sessionId: string,
  password: string
): Promise<{ success: boolean; error?: string; sessionString?: string }> {
  const authSession = authSessions.get(sessionId);
  if (!authSession) {
    return { success: false, error: 'Session not found' };
  }

  try {
    console.log('[AUTH] Submitting password (length:', password.length, ')...');

    if (authSession.resolvers.password) {
      console.log('[AUTH] Resolving password promise');
      authSession.resolvers.password(password);
    } else {
      console.log('[AUTH] WARNING: No password resolver found');
      authSession.handlers.password = async () => password;
      authSession.resolvers.password = () => {};
    }

    try {
      console.log('Waiting for client.start() to complete (max 20s)...');
      await Promise.race([
        authSession.startPromise!,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20000)),
      ]);
      console.log('client.start() completed successfully');
    } catch (error) {
      console.error('Start promise error:', error);
      const errorMsg =
        (error as { errorMessage?: string }).errorMessage ||
        (error as Error).message ||
        String(error);

      if (
        errorMsg.includes('PASSWORD') ||
        errorMsg.includes('password') ||
        (error as { errorMessage?: string }).errorMessage === 'PASSWORD_HASH_INVALID'
      ) {
        return { success: false, error: 'Invalid 2FA password. Please check and try again.' };
      }

      if (!errorMsg.includes('Timeout') && !errorMsg.includes('timeout')) {
        console.log('Non-timeout error, but continuing to check auth...');
      }
    }

    console.log('Checking authorization...');
    for (let i = 0; i < 15; i++) {
      try {
        const isAuthorized = await authSession.client.checkAuthorization();
        if (isAuthorized) {
          const sessionString = (authSession.client.session as StringSession).save() as string;
          authSession.step = 'complete';
          await authSession.client.disconnect();
          authSessions.delete(sessionId);
          console.log('Authentication successful!');
          return { success: true, sessionString };
        }
      } catch {
        // Not authorized yet
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (await authSession.client.checkAuthorization()) {
      const sessionString = (authSession.client.session as StringSession).save() as string;
      authSession.step = 'complete';
      await authSession.client.disconnect();
      authSessions.delete(sessionId);
      return { success: true, sessionString };
    }

    return {
      success: false,
      error: 'Authentication failed. Please verify your 2FA password is correct.',
    };
  } catch (error) {
    console.error('Error in submitPassword:', error);
    const errorMsg =
      (error as { errorMessage?: string }).errorMessage ||
      (error as Error).message ||
      'Invalid password';
    return { success: false, error: errorMsg };
  }
}

export function getAuthSession(sessionId: string): AuthSession | undefined {
  return authSessions.get(sessionId);
}

export function cleanupAuthSession(sessionId: string): void {
  const authSession = authSessions.get(sessionId);
  if (authSession) {
    authSession.client.disconnect().catch(() => {});
    authSessions.delete(sessionId);
  }
}
