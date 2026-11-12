'use client';

import { useTranslations as useUiTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function AIStudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const translateUi = useUiTranslations('studio');

  useEffect(() => {
    console.error('[ai-studio] route error:', error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {' '}
        {translateUi('something_went_wrong_ab827e3f')}{' '}
      </h2>
      <p className="max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
        {' '}
        {translateUi('ai_studio_encountered_an_error_your_fd5e3927')}{' '}
      </p>
      <Button onClick={reset} size="lg">
        {' '}
        {translateUi('try_again_d8b8392e')}{' '}
      </Button>
    </div>
  );
}
