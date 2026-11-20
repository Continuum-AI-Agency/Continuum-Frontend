'use client';

import { Rocket } from 'lucide-react';
import { useTranslations } from 'next-intl';

// Jaina Setup Concierge (FEAT-004) — GUIDED UI ONLY. When Jaina has no ad
// account it can't run (the chat contract hard-requires adAccountId), so instead
// of a dead "Select an Ad Account" wall we walk the user through connecting and
// assigning one. This is presentation over the shared PaidSetupDiagnostics
// checklist; it does NOT change the Jaina chat contract and never runs Jaina
// without an ad account.

import { PaidSetupDiagnostics } from '@/components/paid-media/PaidSetupDiagnostics';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';

type JainaSetupConciergeProps = {
  brandId: string;
  platform?: PaidMediaPlatform;
};

export function JainaSetupConcierge({ brandId, platform = 'meta' }: JainaSetupConciergeProps) {
  const uiText = useTranslations('scale');
  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto p-4">
      <div className="w-full max-w-xl space-y-4">
        <div className="space-y-2 text-center">
          <Rocket className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {uiText('let_s_connect_jaina_to_your_paid_data_d12c18c')}
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {uiText('jaina_reads_campaign_spend_creative_performan_668066c')}
          </p>
        </div>

        <PaidSetupDiagnostics brandId={brandId} platform={platform} />
      </div>
    </div>
  );
}
