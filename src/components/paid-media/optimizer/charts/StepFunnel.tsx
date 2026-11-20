'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { localizeOptimizationMetricDefinition } from '@/lib/paid-media/optimizationMetricPresentation';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';

// A conversion funnel scaled by RATE, not by volume.
//
// The volume-scaled funnel this replaces was unreadable on any real ad account, because a
// real funnel is not gently tapered — it collapses by orders of magnitude. On a live
// portfolio (244,341 impressions → 1,277 clicks → 316 leads) stages two and three were 0.5%
// and 0.1% of the first bar: a solid block followed by a hairline. Every number a reader
// wants — how well does impressions→clicks convert, where is the worst hand-off — was
// rendered as visually identical slivers.
//
// So the bar length here is the STEP conversion rate (this stage ÷ the previous one), which
// is bounded 0–100% and therefore actually comparable between stages. The top stage is the
// baseline at 100%. Absolute counts stay on every row, right-aligned and tabular, because
// the rate alone cannot tell you whether 25% is 25 leads or 2. The drop-off is spelled out
// rather than left as a subtraction for the reader to do.
//
// Height is intrinsic (one row per stage) instead of a guessed h-40 — a 3-stage lead funnel
// and a 4-stage purchase funnel both fit exactly.

import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { useChartFormatters } from '@/components/charts/use-chart-formatters';
import type { UiLocale } from '@/i18n/config';
import { cn } from '@/lib/utils';
import { ChartEmpty } from './ChartStates';
import { buildConversionFunnel, type FunnelStageOut, type FunnelWindow } from './vizData';

const FUNNEL_LABEL_KEYS = {
  Impressions: 'optimizer_metricImpressions',
  Clicks: 'optimizer_metricClicks',
  'Add to cart': 'funnel_add_cart',
  Purchases: 'optimizer_metricPurchases',
  Leads: 'optimizer_metricLeads',
  'Sign-ups': 'optimizer_metricSignUps',
  Installs: 'optimizer_metricInstalls',
  'Landing views': 'funnel_landing_views',
  Reach: 'funnel_reach',
  Conversations: 'optimizer_metricConversations',
  'Link clicks': 'optimizer_metricLinkClicks',
  ThruPlays: 'optimizer_metricThruPlays',
  Engagements: 'optimizer_metricEngagements',
} as const;

type StepFunnelProps = {
  window: FunnelWindow | null | undefined;
  objective: string | null | undefined;
};

/** Sub-1% rates round to "0%" and read as "nothing converted", which is wrong and alarming.
 *  Below 1% we show a decimal; above it, whole percents keep the column scannable. */
const RATE_FORMATTERS = new Map<
  UiLocale,
  { precise: Intl.NumberFormat; rounded: Intl.NumberFormat }
>();
function formatRate(rate: number, locale: UiLocale): string {
  let formatters = RATE_FORMATTERS.get(locale);
  if (!formatters) {
    formatters = {
      precise: new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }),
      rounded: new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }),
    };
    RATE_FORMATTERS.set(locale, formatters);
  }
  return rate > 0 && rate < 0.01
    ? formatters.precise.format(rate)
    : formatters.rounded.format(rate);
}

function StageRow({ stage, isFirst }: { stage: FunnelStageOut; isFirst: boolean }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const { intFmt } = useChartFormatters();
  // The baseline stage has no prior to rate against, so it anchors the scale at 100%.
  const rate = isFirst ? 1 : (stage.stepPct ?? 0);
  const widthPct = Math.max(rate * 100, rate > 0 ? 1.5 : 0);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-xs text-foreground">{stage.label}</span>
        <span className="shrink-0 font-data text-xs text-foreground tabular-nums">
          {stage.displayValue}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-[width]')}
            style={{
              width: `${widthPct}%`,
              background: isFirst ? 'var(--chart-1)' : (stage.color ?? 'var(--chart-1)'),
            }}
          />
        </div>
        <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {isFirst ? '—' : formatRate(rate, uiLocale)}
        </span>
      </div>
      {!isFirst && stage.dropOff != null && stage.dropOff > 0 ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          {uiText.rich('sentence_bde730ed8703', { v0: intFmt(stage.dropOff) })}
        </p>
      ) : null}
    </div>
  );
}

export function StepFunnel({ window, objective }: StepFunnelProps) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  const { intFmt } = useChartFormatters();
  const stages = window
    ? buildConversionFunnel(window, objective, uiLocale, (label) =>
        uiText(FUNNEL_LABEL_KEYS[label as keyof typeof FUNNEL_LABEL_KEYS]),
      )
    : [];

  if (stages.length === 0 || stages.every((stage) => stage.value === 0)) {
    return <ChartEmpty message={uiText('the_conversion_funnel_appears_once_this_portf_3a07fd8')} />;
  }

  const metric = localizeOptimizationMetricDefinition(
    getOptimizationMetricDefinition(objective),
    optimizerText,
  );
  const terminal = stages.at(-1);

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {stages.map((stage, index) => (
          <StageRow isFirst={index === 0} key={stage.label} stage={stage} />
        ))}
      </div>

      <p className="border-border/60 border-t pt-2 text-xs text-muted-foreground tabular-nums">
        {terminal ? (
          <>
            {uiText.rich('sentence_527564221e72', {
              v0: () => (
                <span className="text-foreground">{formatRate(terminal.overallPct, uiLocale)}</span>
              ),
              v1: stages[0].label.toLowerCase(),
              v2: metric.resultLabel.toLowerCase(),
            })}
          </>
        ) : null}
        <span className="ml-1">{uiText('bars_show_step_conversion_not_volume_4158626')}</span>
      </p>
    </div>
  );
}
