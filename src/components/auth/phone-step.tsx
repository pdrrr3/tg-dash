'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PhoneStepProps {
  onSubmit: (phone: string) => Promise<void>;
}

export function PhoneStep({ onSubmit }: PhoneStepProps) {
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;

    setIsLoading(true);
    try {
      await onSubmit(phone);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="+1234567890"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={isLoading}
          autoFocus
        />
        <p className="text-sm text-muted-foreground">
          Include country code (e.g., +1 for US)
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading || !phone.trim()}>
        {isLoading ? 'Sending...' : 'Send Code'}
      </Button>
    </form>
  );
}
