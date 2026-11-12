'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function CopyBrandIdButton({ brandId }: { brandId: string }) {
  const tUi = useTranslations('settings');

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyBrandId = async () => {
    await navigator.clipboard.writeText(brandId);
    setCopied(true);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
      onClick={() => void copyBrandId()}
      aria-label={copied ? tUi('m_0c6560310a') : tUi('m_1fd38dc522')}
    >
      {copied ? (
        <Check className="h-3 w-3" aria-hidden />
      ) : (
        <Copy className="h-3 w-3" aria-hidden />
      )}
      <span aria-live="polite">{copied ? tUi('m_8e3df45a49') : tUi('m_c44623f31d')}</span>
    </Button>
  );
}
