'use client';

import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { ComputedInsight, InsightSeverity } from '@/lib/paid-media/account-insights.types';
import { cn } from '@/lib/utils';

type InsightCategoryCardProps = {
  title: string;
  icon: LucideIcon;
  insights: ComputedInsight[];
  accentColor: string;
};

const severityClasses: Record<InsightSeverity, string> = {
  positive: 'bg-emerald-500',
  negative: 'bg-destructive',
  neutral: 'bg-primary',
};

const severityTextClasses: Record<InsightSeverity, string> = {
  positive: 'text-emerald-500',
  negative: 'text-destructive',
  neutral: 'text-primary-ink',
};

export function InsightCategoryCard({
  title,
  icon: Icon,
  insights,
  accentColor,
}: InsightCategoryCardProps) {
  const uiText = useTranslations('scale');
  const METRIC_LABELS: Record<string, string> = useMemo(
    () => ({
      roas: uiText('roas_b81bd97'),
      conversions: uiText('dashboardConv'),
      ctr: uiText('ctr_07fce34'),
      cpc: 'CPC',
      cpa: 'CPA',
      clicks: uiText('clicks_921fc98'),
      spend_efficiency: uiText('efficiency_87b180c'),
      spend: uiText('spend_85f3d55'),
      frequency: uiText('dashboardFrequency'),
      spend_concentration: uiText('dashboardConcentration'),
      pace: uiText('dashboardPace'),
    }),
    [uiText],
  );

  return (
    <div className="rounded-lg border border-border/70 bg-card p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <div
          className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', accentColor)}
        >
          <Icon className="size-3 text-white" />
        </div>
        <span className="text-xs font-medium">{title}</span>
      </div>

      {insights.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {uiText('not_enough_data_to_surface_insights_7faa9ad')}
        </p>
      ) : (
        <ul className="space-y-2">
          {insights.map((insight, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span
                className={cn(
                  'mt-1.5 size-1.5 shrink-0 rounded-full',
                  severityClasses[insight.severity],
                )}
              />
              <div className="min-w-0 space-y-1">
                <div className="flex items-baseline gap-1.5">
                  {insight.metric && (
                    <span className="shrink-0 rounded bg-muted px-1 py-px text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                      {METRIC_LABELS[insight.metric] ?? insight.metric}
                    </span>
                  )}
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    <InsightText text={insight.text} severity={insight.severity} />
                  </span>
                </div>
                {insight.recommendation && (
                  <p className="text-xs leading-snug text-muted-foreground/70">
                    {insight.recommendation}
                    {insight.estimated_impact && (
                      <span className="ml-1 font-medium text-foreground/60">
                        ({insight.estimated_impact})
                      </span>
                    )}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InsightText({ text, severity }: { text: string; severity: InsightSeverity }) {
  const parts = text.split(/(\d+(?:,\d{3})*(?:\.\d+)?[%x]?)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\d+(?:,\d{3})*(?:\.\d+)?[%x]?$/.test(part) ? (
          <span key={i} className={cn('font-semibold', severityTextClasses[severity])}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
