'use client';

import { XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const uiText = useTranslations('automations');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const email = draft.trim().replace(/,+$/, '');
    if (!email) return;
    if (!emailSchema.safeParse(email).success) {
      setError(uiText('m_12095702d6', { email }));
      return;
    }
    if (value.some((existing) => existing.toLowerCase() === email.toLowerCase())) {
      setDraft('');
      setError(null);
      return;
    }
    if (value.length >= max) {
      setError(uiText('m_9052b457a7', { count: max }));
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
                aria-label={uiText('m_00491f2a45', { email })}
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
        placeholder={uiText('stakeholder_company_com_press_enter_to_add_df25b3f')}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        aria-label={uiText('add_external_recipient_email_74b893e')}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
