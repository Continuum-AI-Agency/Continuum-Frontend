'use client';

import { AlertTriangleIcon, SparklesIcon, TargetIcon, ZapIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDecimal } from '@/lib/format/decimal';
import { formatMetric, getMetric, localizeHeatmapLabel } from '@/lib/paid-media/heatmap';
import type { GeneratedCampaignInsight } from '@/lib/paid-media/insight-data-points';
import type { CampaignPerformanceMetricKey } from '@/lib/paid-media/performance-types';
import { cn } from '@/lib/utils';

type CampaignInsightEvidencePanelProps = {
  insights: GeneratedCampaignInsight[];
};

type Severity = GeneratedCampaignInsight['severity'];

const SEVERITY_BORDER: Record<Severity, string> = {
  opportunity: 'border-l-emerald-500',
  critical: 'border-l-rose-500',
  warning: 'border-l-amber-500',
  info: 'border-l-sky-500',
};

const SEVERITY_TEXT: Record<Severity, string> = {
  opportunity: 'text-emerald-700 dark:text-emerald-300',
  critical: 'text-rose-700 dark:text-rose-300',
  warning: 'text-amber-700 dark:text-amber-300',
  info: 'text-sky-700 dark:text-sky-300',
};

const severityKeys = {
  opportunity: 'heatmapOpportunity',
  critical: 'heatmapRisk',
  warning: 'heatmapWatch',
  info: 'heatmapNote',
} as const satisfies Record<Severity, string>;

function severityIcon(severity: Severity) {
  if (severity === 'opportunity') return <SparklesIcon className="h-3.5 w-3.5" aria-hidden />;
  if (severity === 'critical') return <ZapIcon className="h-3.5 w-3.5" aria-hidden />;
  if (severity === 'warning') return <AlertTriangleIcon className="h-3.5 w-3.5" aria-hidden />;
  return <TargetIcon className="h-3.5 w-3.5" aria-hidden />;
}

export function CampaignInsightEvidencePanel({ insights }: CampaignInsightEvidencePanelProps) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card">
      <header className="border-b border-border/70 bg-muted/15 px-3 py-2">
        <h3 className="text-sm font-semibold tracking-tight">{uiText('insights_2a932f9')}</h3>
        <p className="text-xs text-muted-foreground">
          {uiText('generated_from_normalized_matrix_and_pacing_d_aaf6f98')}
        </p>
      </header>

      {insights.length === 0 ? (
        <div className="grid min-h-[18rem] place-items-center p-6 text-center text-xs text-muted-foreground">
          {uiText('evidence_will_appear_once_campaigns_have_enou_c6047cf')}
        </div>
      ) : (
        <ScrollArea className="h-[min(58svh,620px)]">
          <div className="divide-y divide-border/60">
            {insights.map((insight) => (
              <article
                key={insight.id}
                className={cn(
                  'border-l-2 bg-card px-3 py-2.5 transition-colors hover:bg-muted/20',
                  SEVERITY_BORDER[insight.severity],
                )}
              >
                <div className="flex items-start gap-2">
                  <span className={cn('mt-0.5 flex-shrink-0', SEVERITY_TEXT[insight.severity])}>
                    {severityIcon(insight.severity)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'font-mono text-3xs uppercase tracking-[0.1em]',
                          SEVERITY_TEXT[insight.severity],
                        )}
                      >
                        {uiText(severityKeys[insight.severity])}
                      </span>
                      <span className="h-px flex-1 bg-border/60" aria-hidden />
                    </div>
                    <div className="mt-1 text-sm font-semibold leading-tight">{insight.title}</div>
                    <p className="mt-1 text-xs leading-[1.45] text-muted-foreground">
                      {insight.summary}
                    </p>
                  </div>
                </div>

                {insight.evidence.length > 0 ? (
                  <ul className="mt-2 divide-y divide-border/40 rounded-md border border-border/50 bg-muted/10">
                    {insight.evidence.map((point) => {
                      const metricMeta =
                        point.metric === 'pace'
                          ? null
                          : getMetric(point.metric as CampaignPerformanceMetricKey, (source) =>
                              localizeHeatmapLabel(source, uiText),
                            );
                      const displayValue =
                        metricMeta && typeof point.currentValue === 'number'
                          ? formatMetric(
                              point.metric as CampaignPerformanceMetricKey,
                              point.currentValue,
                              uiLocale,
                            )
                          : point.metric === 'pace'
                            ? `${formatDecimal(point.currentValue, 0, uiLocale)}%`
                            : '—';

                      return (
                        <li
                          key={`${insight.id}:${point.metric}:${point.campaignId}`}
                          className="flex items-center justify-between gap-3 px-2 py-1.5"
                        >
                          <span className="font-mono text-3xs uppercase tracking-[0.1em] text-muted-foreground">
                            {point.metric}
                          </span>
                          <span className="flex items-baseline gap-1.5 font-mono text-xs tabular-nums">
                            <span className="font-medium text-foreground">{displayValue}</span>
                            <span className="text-muted-foreground">
                              {uiText.rich('sentence_577374b549b6', {
                                percentile: Math.round(point.percentileRank * 100),
                              })}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}
