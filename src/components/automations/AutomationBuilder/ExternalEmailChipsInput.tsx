'use client';

import { XIcon } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const emailSchema = z.string().email();

type ExternalEmailChipsInputProps = {
  value: string[];
  onChange: (emails: string[]) => void;
  max?: number;
};

export function ExternalEmailChipsInput({
  value,
  onChange,
  max = 20,
}: ExternalEmailChipsInputProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const email = draft.trim().replace(/,+$/, '');
    if (!email) return;
    if (!emailSchema.safeParse(email).success) {
      setError(`"${email}" is not a valid email`);
      return;
    }
    if (value.some((existing) => existing.toLowerCase() === email.toLowerCase())) {
      setDraft('');
      setError(null);
      return;
    }
    if (value.length >= max) {
      setError(`At most ${max} external recipients`);
      return;
    }
    onChange([...value, email]);
    setDraft('');
    setError(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((email) => (
            <Badge key={email} variant="secondary" className="gap-1 pr-1 font-normal">
              {email}
              <button
                type="button"
                aria-label={`Remove ${email}`}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                onClick={() => onChange(value.filter((existing) => existing !== email))}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        type="email"
        inputMode="email"
        placeholder="stakeholder@company.com — press Enter to add"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        aria-label="Add external recipient email"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
