'use client';

// Jaina Setup Concierge (FEAT-004) — GUIDED UI ONLY. When Jaina has no ad
// account it can't run (the chat contract hard-requires adAccountId), so instead
// of a dead "Select an Ad Account" wall we walk the user through connecting and
// assigning one. This is presentation over the shared PaidSetupDiagnostics
// checklist; it does NOT change the Jaina chat contract and never runs Jaina
// without an ad account.

import { RocketIcon } from '@radix-ui/react-icons';

import { PaidSetupDiagnostics } from '@/components/paid-media/PaidSetupDiagnostics';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';

type JainaSetupConciergeProps = {
  brandId: string;
  platform?: PaidMediaPlatform;
};

export function JainaSetupConcierge({ brandId, platform = 'meta' }: JainaSetupConciergeProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto p-4">
      <div className="w-full max-w-xl space-y-4">
        <div className="space-y-2 text-center">
          <RocketIcon className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Let&apos;s connect Jaina to your paid data
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Jaina reads campaign spend, creative performance, and budget pacing to give you a
            decision-ready brief. Finish the steps below to unlock it.
          </p>
        </div>

        <PaidSetupDiagnostics brandId={brandId} platform={platform} />
      </div>
    </div>
  );
}
