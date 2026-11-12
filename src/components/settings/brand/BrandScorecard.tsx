'use client';

import type { BrandReportResult } from '@continuum/contracts';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { Pill } from '@/components/kibo-ui/pill';
import { ReadinessHero } from '@/components/onboarding/v2/readiness/ReadinessHero';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/ToastProvider';
import { recomputeReadiness } from '@/lib/api/brandBook.client';

// Maps a 0-100 score to a semantic Pill tone.
function scorePillVariant(score: number): 'success' | 'warning' | 'destructive' | 'muted' {
  if (score >= 75) return 'success';
  if (score >= 50) return 'warning';
  if (score >= 1) return 'destructive';
  return 'muted';
}

type Props = {
  result: BrandReportResult;
  // When provided, exposes a Recalculate action that re-scores the effective
  // brand.md via the Flash-Lite scorer, then refreshes the surface.
  brandId?: string;
};

// Settings → Brand Book → Readiness: the same radar-led hero as onboarding, with
// the strategy audit score and Recalculate in its header. Derived entirely from
// the composite; no fetching.
export function BrandScorecard({ result, brandId }: Props) {
  const tUi = useTranslations('settings');

  const router = useRouter();
  const { show } = useToast();
  const [isRecalculating, startRecalculate] = useTransition();

  const onRecalculate = () => {
    if (!brandId) return;
    startRecalculate(async () => {
      try {
        await recomputeReadiness(brandId);
        show({ title: tUi('m_d3157b08c4'), variant: 'success' });
        router.refresh();
      } catch {
        show({ title: tUi('m_f3f6c5d2bd'), variant: 'error' });
      }
    });
  };

  const readiness = result.readiness;
  if (!readiness) return null;

  const strategyAudit = result.audits?.strategy;

  return (
    <ReadinessHero
      readiness={readiness}
      status="settled"
      legacyHint={brandId ? 'Recalculate to see what earned each score.' : undefined}
      action={
        <>
          {strategyAudit ? (
            <Pill variant={scorePillVariant(strategyAudit.score)}>
              {tUi('m_57201e6ec2')}
              {strategyAudit.score}
            </Pill>
          ) : null}
          {brandId ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onRecalculate}
              disabled={isRecalculating}
            >
              {isRecalculating ? tUi('m_fb72d121e2') : tUi('m_3298e1d394')}
            </Button>
          ) : null}
        </>
      }
    />
  );
}
