'use client';

import type { AwarenessBlock, AwarenessReportPayload } from '@continuum/contracts';
import { Radar } from 'lucide-react';
import { MetricStrip } from '@/components/shared/MetricStrip';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { EmptyState } from '@/components/shared/state';

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
  return <MetricStrip items={metrics.map((m) => ({ label: m.label, value: String(m.value) }))} />;
}

export function CountList({ items }: { items: CountItem[] }) {
  if (items.length === 0)
    return <p className="py-4 text-center text-xs text-muted-foreground">No data yet.</p>;
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
          <span className="text-xs text-muted-foreground">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}

function Feed({ rows }: { rows: FeedRow[] }) {
  if (rows.length === 0)
    return <p className="text-xs text-muted-foreground">No recent activity.</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.slice(0, 20).map((row, i) => (
        <li
          key={`${row.sourceAdId}-${i}`}
          className="flex items-center justify-between py-1.5 text-xs"
        >
          <span className="capitalize">{row.eventType.replace(/_/g, ' ')}</span>
          <span className="text-muted-foreground">
            {new Date(row.eventAt).toLocaleDateString()}
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
  if (!report) {
    return (
      <EmptyState
        className="rounded-lg border border-dashed border-border p-10"
        media={<Radar aria-hidden="true" className="size-5" />}
        headline="No awareness report yet"
        description="Run a sync to generate competitor awareness signals."
      />
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Window: {new Date(report.windowStart).toLocaleDateString()} –{' '}
        {new Date(report.windowEnd).toLocaleDateString()}
      </p>
      {report.blocks.map((block, i) => (
        <BlockCard key={`${block.category}-${i}`} block={block} />
      ))}
    </div>
  );
}
