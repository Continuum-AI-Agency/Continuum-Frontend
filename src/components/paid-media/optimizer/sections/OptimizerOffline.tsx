'use client';

// Shown when the optimizer backend can't be reached (a read errored or timed
// out). Keeps the surface honest — a clear "offline" signal with a retry, rather
// than an infinite skeleton or a misleading empty state. Common on a local stack
// where the optimizer edge functions aren't wired.

import { RefreshCwIcon, ServerCrashIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

type OptimizerOfflineProps = {
  onRetry: () => void;
  retrying?: boolean;
};

export function OptimizerOffline({ onRetry, retrying }: OptimizerOfflineProps) {
  return (
    <div className="mx-auto max-w-md p-2">
      <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-amber-500/40 bg-card text-amber-600 dark:text-amber-400">
          <ServerCrashIcon className="size-5" />
        </div>
        <h2 className="mt-3 text-base font-semibold tracking-tight">
          Optimizer service is offline
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          We couldn&rsquo;t reach the optimizer backend, so portfolios and cycle data can&rsquo;t
          load right now. This is expected on a local stack where the optimizer edge functions
          aren&rsquo;t wired — it&rsquo;ll populate once the service is reachable.
        </p>
        <div className="mt-4 flex justify-center">
          <Button type="button" variant="secondary" className="gap-1.5" onClick={onRetry}>
            <RefreshCwIcon className={retrying ? 'size-4 animate-spin' : 'size-4'} />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}
