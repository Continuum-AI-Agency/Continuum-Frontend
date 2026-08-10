'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';

export default function AutomationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[automations] route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Something went wrong
      </h2>
      <p className="max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
        We could not load your automations. Your workflows are safe and unchanged.
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
