'use client';

// The "What's Working" body as a dense, sortable data table (one row per mined
// creative insight). Each row surfaces its confidence + average measured metric
// and a "Top creatives" cell of the actual top performers — ranked, metric-
// labeled, hover-previewable, and click-through to the live post. Expanding a
// row reveals the full rationale, audience, and the complete creative set.

import type { CreativeInsight } from '@continuum/contracts';
import { type ReactNode, useMemo } from 'react';
import {
  InsightActionsDropdown,
  InsightContextActions,
} from '@/components/dashboard/briefing/insightActions';
import {
  type InsightColumn,
  InsightDataTable,
} from '@/components/dashboard/datatable/InsightDataTable';
import { creativeInsightToMentionSuggestion } from '@/lib/agent/kpi-mentions';
import { type InsightRowView, toInsightRows } from '@/lib/organic/creative-strategy-rows';
import { ExemplarThumb } from './ExemplarThumb';

const MAX_THUMBS = 4;

function KindBadge({ kind }: { kind: string }) {
  return (
    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-accent">
      {kind}
    </span>
  );
}

// Interacting with a thumbnail (hover-card link, focus) must not also toggle the
// row's expand handler — swallow the event before it bubbles to the row.
function stopBubble(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

function CreativesCell({ row }: { row: InsightRowView }) {
  if (row.exemplars.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const shown = row.exemplars.slice(0, MAX_THUMBS);
  const overflow = row.exemplars.length - shown.length;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: wrapper only stops row-expand bubbling; the interactive elements are the thumbnails within
    <div className="flex items-start gap-1.5" onClick={stopBubble} onKeyDown={stopBubble}>
      {shown.map((exemplar) => (
        <ExemplarThumb key={exemplar.refId} exemplar={exemplar} seed={row.label} />
      ))}
      {overflow > 0 ? (
        <span className="self-center text-2xs text-muted-foreground tabular-nums">+{overflow}</span>
      ) : null}
    </div>
  );
}

function ExpandedInsight({ row }: { row: InsightRowView }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-secondary leading-snug">{row.description}</p>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground">{row.recommendation}</span>
        {row.audienceNote ? <span className="text-accent">{row.audienceNote}</span> : null}
      </div>
      {row.exemplars.length ? (
        <div className="flex flex-wrap gap-2">
          {row.exemplars.map((exemplar) => (
            <ExemplarThumb key={exemplar.refId} exemplar={exemplar} seed={row.label} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CreativeStrategyTable({ insights }: { insights: CreativeInsight[] }) {
  const rows = useMemo(() => toInsightRows(insights), [insights]);
  // Cluster ids can collide (kind-archetype); keep list index so pin keys stay unique.
  const insightByRowId = useMemo(() => {
    const map = new Map<string, { insight: CreativeInsight; index: number }>();
    insights.forEach((insight, index) => {
      // Prefer first occurrence for id collisions so table row id still resolves.
      if (!map.has(insight.id)) map.set(insight.id, { insight, index });
      // Also index by disambiguated row id used when rows share an insight.id.
      map.set(`${insight.id}#${index}`, { insight, index });
    });
    return map;
  }, [insights]);

  const columns = useMemo<InsightColumn<InsightRowView>[]>(
    () => [
      {
        id: 'kind',
        header: 'Type',
        cellClassName: 'w-16',
        cell: (row) => <KindBadge kind={row.kind} />,
      },
      {
        id: 'insight',
        header: 'Insight',
        cellClassName: 'min-w-52 max-w-72',
        cell: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.label}</p>
            <p className="truncate text-xs text-muted-foreground">{row.recommendation}</p>
          </div>
        ),
      },
      {
        id: 'surface',
        header: 'Surface',
        cellClassName: 'w-16 text-2xs uppercase tracking-wide text-muted-foreground',
        cell: (row) => row.surface,
      },
      {
        id: 'confidence',
        header: 'Confidence',
        align: 'right',
        sortValue: (row) => row.confidence,
        cell: (row) => `${Math.round(row.confidence * 100)}%`,
      },
      {
        id: 'metric',
        header: 'Avg metric',
        align: 'right',
        sortValue: (row) => row.avgMetricValue ?? -1,
        cell: (row) =>
          row.avgMetricLabel ? (
            <span className="inline-flex flex-col items-end leading-tight">
              <span className="tabular-nums">{row.avgMetricLabel}</span>
              {row.metricName ? (
                <span className="text-2xs capitalize text-muted-foreground">{row.metricName}</span>
              ) : null}
            </span>
          ) : (
            '—'
          ),
      },
      {
        id: 'creatives',
        header: 'Top creatives',
        cellClassName: 'min-w-40',
        cell: (row): ReactNode => <CreativesCell row={row} />,
      },
    ],
    [],
  );

  return (
    <InsightDataTable
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      defaultSort={{ columnId: 'confidence', direction: 'desc' }}
      expandedContent={(row) => <ExpandedInsight row={row} />}
      contextMenu={(row) => {
        const entry = insightByRowId.get(row.id);
        return (
          <InsightContextActions
            permalink={row.topPermalink ?? undefined}
            agentSuggestion={
              entry
                ? creativeInsightToMentionSuggestion(entry.insight, { index: entry.index })
                : null
            }
          />
        );
      }}
      rowActions={(row) => {
        const entry = insightByRowId.get(row.id);
        return (
          <InsightActionsDropdown
            permalink={row.topPermalink ?? undefined}
            agentSuggestion={
              entry
                ? creativeInsightToMentionSuggestion(entry.insight, { index: entry.index })
                : null
            }
          />
        );
      }}
    />
  );
}
