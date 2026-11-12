'use client';

import { Check, Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ShareCopyLink({ href }: { href: string }) {
  const uiText = useTranslations('public');
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground"
      onClick={() => {
        const absolute = href.startsWith('http') ? href : `${window.location.origin}${href}`;
        void navigator.clipboard.writeText(absolute).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="size-3" /> : <Link2 className="size-3" />}
      {copied ? uiText('copied_8d525e5') : uiText('copy_link_dbf362d')}
    </button>
  );
}
