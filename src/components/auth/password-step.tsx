'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PasswordStepProps {
  onSubmit: (password: string) => Promise<void>;
}

export function PasswordStep({ onSubmit }: PasswordStepProps) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoading(true);
    try {
      await onSubmit(password);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">2FA Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="Enter your 2FA password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          autoFocus
        />
        <p className="text-sm text-muted-foreground">
          Enter your Telegram 2-factor authentication password
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading || !password.trim()}>
        {isLoading ? 'Authenticating...' : 'Submit Password'}
      </Button>
    </form>
  );
}
