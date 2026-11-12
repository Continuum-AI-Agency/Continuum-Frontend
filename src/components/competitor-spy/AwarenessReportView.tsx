'use client';

import type { AwarenessBlock, AwarenessReportPayload } from '@continuum/contracts';
import { Radar } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { formatCompetitorNumber } from '@/components/competitor-spy/brandVisuals';
import { MetricStrip } from '@/components/shared/MetricStrip';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { EmptyState } from '@/components/shared/state';
import { competitorStateLabel } from '@/i18n/competitorCopy';

interface Metric {
  label: string;
  value: number;
}
interface CountItem {
  label: string;
  count: number;
}
interface FeedRow {
  sourceAdId: string;
  eventType: string;
  eventAt: string;
  competitorId: string;
}

function MetricGrid({ metrics }: { metrics: Metric[] }) {
  const uiLocale = useLocale();
  return (
    <MetricStrip
      items={metrics.map((m) => ({
        label: m.label,
        value:
          typeof m.value === 'number'
            ? new Intl.NumberFormat(uiLocale, { maximumSignificantDigits: 21 }).format(m.value)
            : String(m.value),
      }))}
    />
  );
}

export function CountList({ items }: { items: CountItem[] }) {
  const uiLocale = useLocale();

  const uiText = useTranslations('competitor');
  if (items.length === 0)
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        {uiText('no_data_yet_bddd837')}
      </p>
    );
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span className="w-40 shrink-0 truncate text-xs capitalize">
            {item.label.replace(/_/g, ' ')}
          </span>
          <span
            className="h-2 rounded-full bg-primary/70"
            style={{ width: `${(item.count / max) * 100}%` }}
          />
          <span className="text-xs text-muted-foreground">
            {formatCompetitorNumber(item.count, uiLocale)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Feed({ rows }: { rows: FeedRow[] }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('competitor');
  if (rows.length === 0)
    return <p className="text-xs text-muted-foreground">{uiText('no_recent_activity_44b67bb')}</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.slice(0, 20).map((row, i) => (
        <li
          key={`${row.sourceAdId}-${i}`}
          className="flex items-center justify-between py-1.5 text-xs"
        >
          <span className="capitalize">{competitorStateLabel(row.eventType, uiText)}</span>
          <span className="text-muted-foreground">
            {new Date(row.eventAt).toLocaleDateString(uiLocale)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function BlockCard({ block }: { block: AwarenessBlock }) {
  const data = (block.data ?? {}) as Record<string, unknown>;
  return (
    <section className="rounded-lg border border-border bg-card">
      <SectionHeader title={block.title} />
      <div className="p-4">
        {block.category === 'summary' ? (
          <MetricGrid metrics={(data.metrics as Metric[]) ?? []} />
        ) : block.category === 'lifecycle_feed' ? (
          <Feed rows={(data.rows as FeedRow[]) ?? []} />
        ) : (
          <CountList items={(data.items as CountItem[]) ?? []} />
        )}
      </div>
    </section>
  );
}

export function AwarenessReportView({ report }: { report: AwarenessReportPayload | null }) {
  const uiLocale = useLocale();
  const uiText = useTranslations('competitor');
  if (!report) {
    return (
      <EmptyState
        className="rounded-lg border border-dashed border-border p-10"
        media={<Radar aria-hidden="true" className="size-5" />}
        headline={uiText('m_0d10fc04cc')}
        description={uiText('run_a_sync_to_generate_competitor_awareness_s_9ffbdf9')}
      />
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {uiText.rich('sentence_f4610391e0a9', {
          v0: () => new Date(report.windowStart).toLocaleDateString(uiLocale),
          v1: () => new Date(report.windowEnd).toLocaleDateString(uiLocale),
        })}
      </p>
      {report.blocks.map((block, i) => (
        <BlockCard key={`${block.category}-${i}`} block={block} />
      ))}
    </div>
  );
}
