'use client';

import { useTranslations } from 'next-intl';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function OrganicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const uiText = useTranslations('organic');
  useEffect(() => {
    console.error('[organic] route error:', error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {uiText('something_went_wrong_ab827e3')}
      </h2>
      <p className="max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
        {uiText('the_organic_planner_encountered_an_error_your_3299901')}
      </p>
      <Button onClick={reset} size="lg">
        {uiText('try_again_d8b8392')}
      </Button>
    </div>
  );
}
