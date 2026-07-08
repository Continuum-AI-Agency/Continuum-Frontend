'use client';

// Shown when the optimizer backend can't be reached (a read errored or timed
// out). Keeps the surface honest — a clear "offline" signal with a retry, rather
// than an infinite skeleton or a misleading empty state. Common on a local stack
// where the optimizer edge functions aren't wired. Composes the shared
// ErrorRetryState so the offline look matches every other error surface.

import { ServerCrashIcon } from 'lucide-react';

import { ErrorRetryState } from '@/components/shared/state/ErrorRetryState';

type OptimizerOfflineProps = {
  onRetry: () => void;
};

export function OptimizerOffline({ onRetry }: OptimizerOfflineProps) {
  return (
    <div className="mx-auto max-w-md p-2">
      <ErrorRetryState
        title="Optimizer service is offline"
        message="We couldn't reach the optimizer backend, so portfolios and cycle data can't load right now. This is expected on a local stack where the optimizer edge functions aren't wired — it populates once the service is reachable."
        media={<ServerCrashIcon aria-hidden="true" />}
        onRetry={onRetry}
        retryLabel="Retry"
      />
    </div>
  );
}
