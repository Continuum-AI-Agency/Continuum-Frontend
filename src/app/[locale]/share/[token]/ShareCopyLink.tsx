'use client';

import { useTranslations } from 'next-intl';
import { CopyButton } from '@/components/arc/copy-button/copy-button';

export function ShareCopyLink({ href }: { href: string }) {
  const uiText = useTranslations('public');
  const tCommon = useTranslations('common');
  // The value is only read on click, so the server's relative href never reaches the clipboard.
  const absolute =
    href.startsWith('http') || typeof window === 'undefined'
      ? href
      : `${window.location.origin}${href}`;

  return (
    <CopyButton
      copiedLabel={uiText('copied_8d525e5')}
      failedLabel={tCommon('failed_031a8f0')}
      label={uiText('copy_link_dbf362d')}
      value={absolute}
      variant="plain"
    />
  );
}
