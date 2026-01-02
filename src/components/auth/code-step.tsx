'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CodeStepProps {
  onSubmit: (code: string) => Promise<void>;
}

export function CodeStep({ onSubmit }: CodeStepProps) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setIsLoading(true);
    try {
      await onSubmit(code);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="code">Verification Code</Label>
        <Input
          id="code"
          type="text"
          placeholder="12345"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={isLoading}
          maxLength={10}
          autoFocus
        />
        <p className="text-sm text-muted-foreground">
          Check your Telegram app for the code
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading || !code.trim()}>
        {isLoading ? 'Verifying...' : 'Verify Code'}
      </Button>
    </form>
  );
}
