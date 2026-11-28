'use client';

import { useTranslations } from 'next-intl';

// Shown when the optimizer backend can't be reached (a read errored or timed
// out). Keeps the surface honest — a clear "offline" signal with a retry, rather
// than an infinite skeleton or a misleading empty state. Composes the shared
// ErrorRetryState so the offline look matches every other error surface.
//
// The message deliberately says nothing about local stacks or edge-function
// wiring. That copy shipped to production, where a paying media buyer has no
// local stack and reads it as "this product is broken and nobody noticed". What
// they actually need to know is whether their money is at risk while it's down.

import { ServerCrashIcon } from 'lucide-react';

import { ErrorRetryState } from '@/components/shared/state/ErrorRetryState';

type OptimizerOfflineProps = {
  onRetry: () => void;
};

export function OptimizerOffline({ onRetry }: OptimizerOfflineProps) {
  const uiText = useTranslations('scale');
  return (
    <div className="mx-auto max-w-md p-2">
      <ErrorRetryState
        title={uiText('can_t_reach_the_optimizer_7a9e477')}
        message={uiText('your_portfolios_and_cycle_data_can_t_load_rig_77be253')}
        media={<ServerCrashIcon aria-hidden="true" />}
        onRetry={onRetry}
        retryLabel={uiText('retry_942087c')}
      />
    </div>
  );
}
