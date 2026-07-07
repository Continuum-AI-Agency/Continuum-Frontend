'use client';

import type { BrandReportResult } from '@continuum/contracts';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Pill } from '@/components/kibo-ui/pill';
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

// Maps a 0-100 score to the semantic bar fill token.
function scoreBarClass(score: number): string {
  if (score >= 75) return 'bg-success';
  if (score >= 50) return 'bg-warning';
  if (score >= 1) return 'bg-destructive';
  return 'bg-muted-foreground';
}

type Props = {
  result: BrandReportResult;
  // When provided, exposes a Recalculate action that re-scores the effective
  // brand.md via the Flash-Lite scorer, then refreshes the surface.
  brandId?: string;
};

// Inline read-only scorecard: overall readiness + per-dimension bars and the
// single strategy audit score. Derived entirely from the composite; no fetching.
export function BrandScorecard({ result, brandId }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [isRecalculating, startRecalculate] = useTransition();

  const onRecalculate = () => {
    if (!brandId) return;
    startRecalculate(async () => {
      try {
        await recomputeReadiness(brandId);
        show({ title: 'Readiness recalculated', variant: 'success' });
        router.refresh();
      } catch {
        show({ title: 'Could not recalculate readiness', variant: 'error' });
      }
    });
  };

  const readiness = result.readiness;
  if (!readiness) return null;

  const overall = readiness.overall_score;
  const dimensions = Object.entries(readiness.dimensions ?? {}) as [
    string,
    { score: number; rationale: string },
  ][];

  const strategyAudit = result.audits?.strategy;

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">Brand Readiness</span>
        <Pill variant={scorePillVariant(overall)}>{overall} / 100</Pill>
        {strategyAudit ? (
          <Pill variant={scorePillVariant(strategyAudit.score)}>
            Strategy {strategyAudit.score}
          </Pill>
        ) : null}
        {brandId ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={onRecalculate}
            disabled={isRecalculating}
          >
            {isRecalculating ? 'Recalculating…' : 'Recalculate'}
          </Button>
        ) : null}
      </div>

      {dimensions.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {dimensions.map(([key, dim]) => (
            <DimensionBar
              key={key}
              label={dimensionLabel(key)}
              score={dim.score}
              rationale={dim.rationale}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DimensionBar({
  label,
  score,
  rationale,
}: {
  label: string;
  score: number;
  rationale: string;
}) {
  return (
    <div className="space-y-1" title={rationale}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <span className="shrink-0 text-xs font-medium text-foreground">{score}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-muted">
        <div
          className={`h-1 rounded-full ${scoreBarClass(score)} transition-all`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  );
}

function dimensionLabel(key: string): string {
  const labels: Record<string, string> = {
    value_proposition: 'Value prop',
    icp_clarity: 'ICP clarity',
    customer_pains: 'Customer pains',
    success_metrics: 'Success metrics',
    positioning: 'Positioning',
    messaging_coherence: 'Messaging',
    brand_identity: 'Identity',
  };
  return labels[key] ?? key.replace(/_/g, ' ');
}
