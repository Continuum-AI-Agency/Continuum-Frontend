'use client';

import { Loader2, RefreshCw } from 'lucide-react';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { regenerateBrandGuidelineAction } from '@/app/[locale]/(post-auth)/settings/actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { useUiErrorMessage } from '@/i18n/errors';

type RegenerateGuidelineButtonProps = {
  brandId: string;
  disabled?: boolean;
  blockReason?: string | null;
};

export function RegenerateGuidelineButton({
  brandId,
  disabled,
  blockReason,
}: RegenerateGuidelineButtonProps) {
  const uiErrorMessage = useUiErrorMessage();

  const tUi = useTranslations('settings');

  const [pending, startTransition] = useTransition();
  const [, setLastError] = useState<string | null>(null);
  const { show } = useToast();

  const handleClick = () => {
    startTransition(async () => {
      try {
        const result = await regenerateBrandGuidelineAction(brandId);
        if (result.skipped) {
          show({
            title: tUi('m_832c03df3e'),
            description: tUi('m_1f88c1b3aa'),
            variant: 'success',
          });
        } else {
          show({
            title: tUi('m_f09643aa08'),
            description: result.version
              ? tUi('m_8d1392ca2b', { v0: String(result.version) })
              : tUi('m_e2bcda84fa'),
            variant: 'success',
          });
        }
      } catch (err) {
        const message = err instanceof Error ? uiErrorMessage(err) : tUi('m_46c644c7b9');
        setLastError(message);
        show({
          title: tUi('m_5818a33758'),
          description: message,
          variant: 'error',
        });
      }
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || pending}
      onClick={handleClick}
      title={blockReason ?? tUi('m_68fe20d9d8')}
    >
      {pending ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
      )}
      {tUi('m_b04c991e58')}
    </Button>
  );
}
