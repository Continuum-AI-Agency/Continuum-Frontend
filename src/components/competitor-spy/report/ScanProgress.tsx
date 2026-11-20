'use client';

import { useLocale, useTranslations } from 'next-intl';
import { localizeCompetitorCopy } from '@/i18n/competitorCopy';
import { useUiErrorMessage } from '@/i18n/errors';
import { scanCountLabel } from './scanCountPresentation';

// Live staged checklist for a running scan, driven purely by scanReducer state.
// A run_error renders inline (the pipeline degrades per-competitor) instead of
// killing the layout.

import type { CompetitorScanStage } from '@continuum/contracts';
import { Check, Loader2, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { humanize } from './gapPresentation';
import type { CompetitorScanState, ScanStageState } from './scanReducer';

const STAGE_ORDER: CompetitorScanStage[] = [
  'ensure_competitors',
  'resolve_pages',
  'sync',
  'analyze',
  'variant_families',
  'aggregate',
  'gap',
  'awareness',
];

const STAGE_LABEL: Record<CompetitorScanStage, string> = {
  ensure_competitors: 'Discover competitors',
  resolve_pages: 'Resolve Meta pages',
  sync: 'Pull ads',
  analyze: 'Analyze creatives',
  variant_families: 'Group variants',
  aggregate: 'Map angles',
  gap: 'Build gap report',
  awareness: 'Update activity',
};

function StageIcon({ stage }: { stage: ScanStageState | undefined }) {
  if (!stage) {
    return <span aria-hidden="true" className="size-2 rounded-full bg-border" />;
  }
  if (stage.status === 'started') {
    return <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-primary" />;
  }
  if (stage.status === 'skipped') {
    return <Minus aria-hidden="true" className="size-3.5 text-muted-foreground/60" />;
  }
  return <Check aria-hidden="true" className="size-3.5 text-emerald-600 dark:text-emerald-400" />;
}

function stageCountsLabel(
  stage: ScanStageState | undefined,
  t: ReturnType<typeof useTranslations<'competitor'>>,
  locale: string,
): string | null {
  if (!stage?.counts) return null;
  const entries = Object.entries(stage.counts);
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => scanCountLabel(key, value, t, locale)).join(' · ');
}

export function ScanProgress({ scan }: { scan: CompetitorScanState }) {
  const uiText = useTranslations('competitor');
  const uiLocale = useLocale();
  const formatUiError = useUiErrorMessage();
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {uiText('scanning_your_competitors_a7da334')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {uiText('this_keeps_running_on_our_side_even_if_you_le_71a6ad9')}
        </p>
      </div>

      <ul className="space-y-2">
        {STAGE_ORDER.map((stageId) => {
          const stage = scan.stages[stageId];
          const counts = stageCountsLabel(stage, uiText, uiLocale);
          return (
            <li className="flex items-center gap-2.5 text-sm" key={stageId}>
              <span className="grid w-4 place-items-center">
                <StageIcon stage={stage} />
              </span>
              <span
                className={cn(
                  stage ? 'text-foreground' : 'text-muted-foreground',
                  stage?.status === 'skipped' && 'text-muted-foreground line-through',
                )}
              >
                {localizeCompetitorCopy(STAGE_LABEL[stageId], uiText)}
              </span>
              {counts ? (
                <span className="text-xs tabular-nums text-muted-foreground">{counts}</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {scan.error ? (
        <p className="text-xs text-destructive" role="alert">
          {formatUiError(scan.transportError ?? { code: scan.error })}
        </p>
      ) : null}

      {scan.analyzedCreatives.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            {uiText('freshly_analyzed_81fd39b')}
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {scan.analyzedCreatives.map((creative) => (
              <div
                className="flex shrink-0 flex-wrap items-center gap-1 rounded-lg border border-border/60 bg-background/60 px-2 py-1.5"
                key={creative.snapshotId}
              >
                {creative.hookArchetype ? (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-3xs text-primary">
                    {humanize(creative.hookArchetype)}
                  </span>
                ) : null}
                {creative.primaryTheme ? (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground">
                    {humanize(creative.primaryTheme)}
                  </span>
                ) : null}
                {!creative.hookArchetype && !creative.primaryTheme ? (
                  <span className="text-3xs text-muted-foreground">
                    {uiText('analyzed_8db7255')}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
