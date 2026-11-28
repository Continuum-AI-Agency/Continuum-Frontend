'use client';

import { useTranslations } from 'next-intl';
import { CopyButton } from '@/components/arc/copy-button/copy-button';

export function CopyBrandIdButton({ brandId }: { brandId: string }) {
  const tUi = useTranslations('settings');
  const tCommon = useTranslations('common');

  return (
    <CopyButton
      ariaLabel={tUi('m_1fd38dc522')}
      copiedLabel={tUi('m_8e3df45a49')}
      failedLabel={tCommon('failed_031a8f0')}
      label={tUi('m_c44623f31d')}
      value={brandId}
      variant="plain"
    />
  );
}
