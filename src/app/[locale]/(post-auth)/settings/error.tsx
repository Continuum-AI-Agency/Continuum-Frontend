'use client';
import { useTranslations } from 'next-intl';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const tUi = useTranslations('settings');

  useEffect(() => {
    console.error('[settings] route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {tUi('m_8d886c0ba6')}
      </h2>
      <p className="max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
        {tUi('m_3fc05c9051')}
      </p>
      <Button onClick={reset} size="lg">
        {tUi('m_042c862e44')}
      </Button>
    </div>
  );
}
