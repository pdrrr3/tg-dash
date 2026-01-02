'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PhoneStep } from './phone-step';
import { CodeStep } from './code-step';
import { PasswordStep } from './password-step';

type AuthStep = 'phone' | 'code' | 'password' | 'complete';

export function AuthForm() {
  const [step, setStep] = useState<AuthStep>('phone');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePhoneSubmit = async (phone: string) => {
    setError(null);

    try {
      // Start auth session
      const startRes = await fetch('/api/auth/start', { method: 'POST' });
      const startData = await startRes.json();

      if (!startData.success) {
        throw new Error(startData.error || 'Failed to start authentication');
      }

      setSessionId(startData.sessionId);

      // Submit phone number
      const phoneRes = await fetch('/api/auth/phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: startData.sessionId, phoneNumber: phone }),
      });
      const phoneData = await phoneRes.json();

      if (!phoneData.success) {
        throw new Error(phoneData.error || 'Failed to send verification code');
      }

      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleCodeSubmit = async (code: string) => {
    if (!sessionId) {
      setError('Session expired. Please start over.');
      setStep('phone');
      return;
    }

    setError(null);

    try {
      const res = await fetch('/api/auth/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, code }),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Invalid verification code');
      }

      if (data.needsPassword) {
        setStep('password');
      } else {
        setStep('complete');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (!sessionId) {
      setError('Session expired. Please start over.');
      setStep('phone');
      return;
    }

    setError(null);

    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, password }),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Invalid password');
      }

      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  if (step === 'complete') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-center text-green-600">
            Authentication Complete
          </CardTitle>
          <CardDescription className="text-center">
            You have successfully authenticated with Telegram.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <a
            href="/"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Go to Dashboard
          </a>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Telegram Authentication</CardTitle>
        <CardDescription>
          {step === 'phone' && 'Enter your phone number to receive a verification code.'}
          {step === 'code' && 'Enter the verification code sent to your Telegram app.'}
          {step === 'password' && 'Enter your 2FA password to complete authentication.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 'phone' && <PhoneStep onSubmit={handlePhoneSubmit} />}
        {step === 'code' && <CodeStep onSubmit={handleCodeSubmit} />}
        {step === 'password' && <PasswordStep onSubmit={handlePasswordSubmit} />}
      </CardContent>
    </Card>
  );
}
