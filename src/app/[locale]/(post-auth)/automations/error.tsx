'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function AutomationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const uiText = useTranslations('automations');
  useEffect(() => {
    console.error('[automations] route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {uiText('something_went_wrong_ab827e3')}
      </h2>
      <p className="max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
        {uiText('we_could_not_load_your_automations_your_workf_a73f893')}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={reset}>
          {uiText('try_again_d8b8392')}
        </Button>
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>
          {uiText('back_to_dashboard_b59e0c1')}
        </Link>
      </div>
    </div>
  );
}
