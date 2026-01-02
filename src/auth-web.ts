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
}

const authSessions = new Map<string, AuthSession>();

export function createAuthSession(sessionId: string, apiId: number, apiHash: string): void {
  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
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
    // This will be updated when password is submitted
    return new Promise((resolve) => {
      resolvers.password = resolve;
    });
  };

  authSessions.set(sessionId, {
    client,
    step: 'phone',
    handlers,
    resolvers,
  });
}

export async function submitPhoneNumber(sessionId: string, phoneNumber: string): Promise<{ success: boolean; error?: string; nextStep?: string }> {
  const authSession = authSessions.get(sessionId);
  if (!authSession) {
    return { success: false, error: 'Session not found' };
  }

  try {
    authSession.phoneNumber = phoneNumber;
    
    // Connect the client first
    await authSession.client.connect();
    console.log('Client connected, starting authentication for:', phoneNumber);
    
    // Set up handlers - these will be called by client.start()
    authSession.handlers.phoneNumber = async () => {
      console.log('Phone number handler called by client.start()');
      return phoneNumber;
    };
    
    authSession.handlers.phoneCode = async () => {
      console.log('Phone code handler called - waiting for code to be provided...');
      // This will be resolved when submitCode is called
      return new Promise((resolve) => {
        authSession.resolvers.phoneCode = resolve;
      });
    };
    
    authSession.handlers.password = async () => {
      console.log('Password handler called - waiting for password to be provided...');
      // This will be resolved when submitPassword is called
      return new Promise((resolve) => {
        authSession.resolvers.password = resolve;
      });
    };
    
    // Start the client - this will:
    // 1. Call phoneNumber handler to get the number
    // 2. Send verification code to Telegram
    // 3. Wait for phoneCode handler to be called
    // 4. Wait for password handler if 2FA is enabled
    authSession.startPromise = authSession.client.start({
      phoneNumber: authSession.handlers.phoneNumber!,
      phoneCode: authSession.handlers.phoneCode!,
      password: authSession.handlers.password,
      onError: (err: any) => {
        console.error('Auth error in client.start():', err);
        authSession.authError = err;
      },
    }).catch((err) => {
      console.error('Auth start failed:', err);
      authSession.authError = err;
      throw err;
    });

    // Give it a moment for the code to be sent
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if there was a flood wait error
    if (authSession.authError) {
      const error: any = authSession.authError;
      if (error.errorMessage === 'FLOOD' || error.code === 420) {
        const waitSeconds = error.seconds || 300;
        const waitMinutes = Math.ceil(waitSeconds / 60);
        return { 
          success: false, 
          error: `Too many code requests. Please wait ${waitMinutes} minutes before trying again. Telegram rate-limits code requests to prevent spam.` 
        };
      }
      return { 
        success: false, 
        error: error.errorMessage || error.message || 'Failed to send code. Please try again.' 
      };
    }
    
    console.log('Code should be sent by now. Check your Telegram.');

    authSession.step = 'code';
    return { success: true, nextStep: 'code' };
  } catch (error) {
    console.error('Error in submitPhoneNumber:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send code' };
  }
}

export async function submitCode(sessionId: string, code: string): Promise<{ success: boolean; error?: string; nextStep?: string; needsPassword?: boolean; sessionString?: string }> {
  const authSession = authSessions.get(sessionId);
  if (!authSession) {
    return { success: false, error: 'Session not found' };
  }

  try {
    console.log('Submitting code:', code);
    
    // Resolve the phoneCode promise - this will make the handler return the code
    if (authSession.resolvers.phoneCode) {
      console.log('Resolving phoneCode promise with code');
      authSession.resolvers.phoneCode(code);
    } else {
      // Fallback: update handler directly
      authSession.handlers.phoneCode = async () => {
        console.log('Phone code handler called by client.start()');
        return code;
      };
    }

    // Wait for the start promise to resolve or check authorization status
    // The client.start() promise will complete when authentication finishes
    let authComplete = false;
    let needsPassword = false;
    let authError: any = null;

    // Set up a promise that resolves when authorization is checked
    const checkAuth = async () => {
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          if (await authSession.client.checkAuthorization()) {
            authComplete = true;
            return;
          }
        } catch (err) {
          // Might need password
        }
        
        // Check if startPromise has resolved/rejected
        try {
          await Promise.race([
            authSession.startPromise!,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 100))
          ]);
          // If we get here, startPromise resolved
          break;
        } catch (err: any) {
          const errMsg = err?.errorMessage || err?.message || String(err);
          if (errMsg.includes('PASSWORD') || errMsg.includes('password')) {
            needsPassword = true;
            return;
          }
          if (!errMsg.includes('timeout')) {
            authError = err;
            return;
          }
        }
      }
    };

    await checkAuth();

    // Check results
    if (authComplete) {
      const sessionString = (authSession.client.session as StringSession).save() as string;
      authSession.step = 'complete';
      await authSession.client.disconnect();
      authSessions.delete(sessionId);
      console.log('Authentication successful!');
      return { success: true, nextStep: 'complete', sessionString };
    }

    if (needsPassword || authError?.errorMessage?.includes('PASSWORD')) {
      authSession.step = 'password';
      console.log('Password required');
      return { success: true, nextStep: 'password', needsPassword: true };
    }

    if (authError) {
      const errorMsg = authError?.errorMessage || authError?.message || String(authError);
      if (errorMsg.includes('PHONE_CODE') || errorMsg.includes('code') || errorMsg.includes('CODE')) {
        return { success: false, error: 'Invalid verification code. Please try again.' };
      }
      return { success: false, error: errorMsg || 'Authentication failed' };
    }

    // Final check
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (await authSession.client.checkAuthorization()) {
      const sessionString = (authSession.client.session as StringSession).save() as string;
      authSession.step = 'complete';
      await authSession.client.disconnect();
      authSessions.delete(sessionId);
      return { success: true, nextStep: 'complete', sessionString };
    }

    // If still not authorized, might need password
    authSession.step = 'password';
    return { success: true, nextStep: 'password', needsPassword: true };
  } catch (error: any) {
    console.error('Error in submitCode:', error);
    const errorMsg = error?.errorMessage || error?.message || 'Invalid code';
    
    // Check if password is needed
    if (errorMsg.includes('PASSWORD') || errorMsg.includes('password')) {
      authSession.step = 'password';
      return { success: true, nextStep: 'password', needsPassword: true };
    }
    
    return { success: false, error: errorMsg };
  }
}

export async function submitPassword(sessionId: string, password: string): Promise<{ success: boolean; error?: string; sessionString?: string }> {
  const authSession = authSessions.get(sessionId);
  if (!authSession) {
    return { success: false, error: 'Session not found' };
  }

  try {
    console.log('[AUTH] Submitting password (length:', password.length, ')...');
    console.log('[AUTH] Session state - step:', authSession.step, 'hasResolver:', !!authSession.resolvers.password, 'hasHandler:', !!authSession.handlers.password);
    
    // Resolve the password promise - this will make the handler return the password
    // The client.start() promise is already waiting for this
    if (authSession.resolvers.password) {
      console.log('[AUTH] Resolving password promise with provided password');
      authSession.resolvers.password(password);
      console.log('[AUTH] Password resolver called successfully');
    } else {
      // If resolver doesn't exist, update the handler directly
      console.log('[AUTH] WARNING: No password resolver found, updating handler directly');
      authSession.handlers.password = async () => {
        console.log('[AUTH] Password handler called directly, returning password');
        return password;
      };
      // Also create a new resolver for future use
      authSession.resolvers.password = () => {};
    }

    // Wait for the startPromise to complete (this will resolve when auth finishes)
    try {
      console.log('Waiting for client.start() to complete (max 20s)...');
      const result = await Promise.race([
        authSession.startPromise!,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 20000)
        )
      ]);
      console.log('client.start() completed successfully');
    } catch (error: any) {
      console.error('Start promise error:', error);
      const errorMsg = error?.errorMessage || error?.message || String(error);
      
      // If it's a password error, give specific feedback
      if (errorMsg.includes('PASSWORD') || errorMsg.includes('password') || 
          error?.errorMessage === 'PASSWORD_HASH_INVALID') {
        return { success: false, error: 'Invalid 2FA password. Please check and try again.' };
      }
      
      // If it's a timeout, continue to check authorization anyway
      if (!errorMsg.includes('Timeout') && !errorMsg.includes('timeout')) {
        // Real error, but continue to check auth status
        console.log('Non-timeout error, but continuing to check auth...');
      }
    }

    // Check authorization status
    console.log('Checking authorization...');
    for (let i = 0; i < 15; i++) {
      try {
        const isAuthorized = await authSession.client.checkAuthorization();
        if (isAuthorized) {
          const sessionString = (authSession.client.session as StringSession).save() as string;
          authSession.step = 'complete';
          await authSession.client.disconnect();
          authSessions.delete(sessionId);
          console.log('✅ Authentication successful!');
          return { success: true, sessionString };
        }
      } catch (err) {
        // Not authorized yet
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Final check
    if (await authSession.client.checkAuthorization()) {
      const sessionString = (authSession.client.session as StringSession).save() as string;
      authSession.step = 'complete';
      await authSession.client.disconnect();
      authSessions.delete(sessionId);
      return { success: true, sessionString };
    }

    return { success: false, error: 'Authentication failed. Please verify your 2FA password is correct.' };
  } catch (error: any) {
    console.error('Error in submitPassword:', error);
    const errorMsg = error?.errorMessage || error?.message || 'Invalid password';
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
