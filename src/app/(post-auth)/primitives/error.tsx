'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function PrimitivesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[primitives] route error:', error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        Something went wrong
      </h2>
      <p className="max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
        Primitives encountered an error. Your data is safe.
      </p>
      <Button onClick={reset} size="lg">
        Try again
      </Button>
    </div>
  );
}
