'use client';

// The companion canvas when Jaina proposes an edit to a LIVE campaign: the campaign as Meta
// has it, with the pending change marked (amber changed, green new and paused, red paused,
// the rest dimmed). Read-only — the approval stays on the chat card beside it.

import type { LiveChangeNode, LiveChangePreviewPayload } from '@continuum/contracts';
import {
  adStopsWithParent,
  type LiveChangeDecision,
  liveChangeBudgetText,
  liveChangeFieldLabel,
  liveChangeSummaryOf,
  liveChangeTreeOf,
  liveChangeValueText,
} from '@/lib/campaign-canvas/liveChange';
import { cn } from '@/lib/utils';

const MARK_CLASS: Record<LiveChangeNode['mark'], string> = {
  changed: 'border-[color:var(--warning)] ring-2 ring-[color:var(--warning)]/20',
  added: 'border-[color:var(--success)] bg-[color:var(--success)]/8',
  paused: 'border-[color:var(--destructive)] bg-[color:var(--destructive)]/8',
  unchanged: 'border-border opacity-60',
};

const MARK_LABEL: Record<LiveChangeNode['mark'], string | null> = {
  changed: 'Changes',
  added: 'New · paused',
  paused: 'Pauses',
  unchanged: null,
};

const MARK_TAG_CLASS: Record<LiveChangeNode['mark'], string> = {
  changed: 'bg-[color:var(--warning)]/15 text-[color:var(--warning)]',
  added: 'bg-[color:var(--success)] text-white',
  paused: 'bg-[color:var(--destructive)] text-white',
  unchanged: '',
};

const DECISION_LABEL: Record<LiveChangeDecision, string> = {
  pending: 'Preview · approve in chat',
  approved: 'Approved in chat',
  denied: 'Denied · nothing changed',
};

const LEVEL_LABEL: Record<LiveChangeNode['level'], string> = {
  campaign: 'Campaign',
  adset: 'Ad set',
  ad: 'Ad',
};

function NodeBox({
  node,
  currency,
  note,
  basedOnName,
  compact = false,
}: {
  node: LiveChangeNode;
  currency: string | null;
  note?: string | null;
  basedOnName?: string | null;
  compact?: boolean;
}) {
  const label = MARK_LABEL[node.mark];
  const budget = liveChangeBudgetText(node, currency);
  const dimmed = note ? 'opacity-60' : '';
  return (
    <div
      className={cn(
        'min-w-0 rounded-lg border-[1.5px] bg-card px-2.5 py-1.5 text-xs',
        MARK_CLASS[node.mark],
        dimmed,
      )}
      data-testid={`live-change-node-${node.id}`}
      data-mark={node.mark}
    >
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{LEVEL_LABEL[node.level]}</span>
        {label ? (
          <span className={cn('rounded-full px-1.5 normal-case', MARK_TAG_CLASS[node.mark])}>
            {label}
          </span>
        ) : null}
      </div>
      {basedOnName ? (
        <div className="font-mono text-[10px] text-[color:var(--success)]">
          copy of {basedOnName}
        </div>
      ) : null}
      <div className={cn('break-words font-semibold', compact ? 'text-xs' : 'text-[13px]')}>
        {node.name}
      </div>
      {node.changes.map((row, index) => (
        <div key={`${row.field}-${index}`} className="tabular-nums">
          <span className="text-muted-foreground">{liveChangeFieldLabel(row.field)}: </span>
          <span className="text-muted-foreground line-through">
            {liveChangeValueText(row, 'before', currency)}
          </span>
          <span className="px-1 text-muted-foreground">→</span>
          <span className="font-semibold">{liveChangeValueText(row, 'after', currency)}</span>
        </div>
      ))}
      {budget || node.status || note ? (
        <div className="tabular-nums text-muted-foreground">
          {[node.status, budget, note].filter(Boolean).join(' · ')}
        </div>
      ) : null}
    </div>
  );
}

export function LiveChangeCanvas({
  preview,
  decision,
}: {
  preview: LiveChangePreviewPayload;
  decision: LiveChangeDecision;
}) {
  const tree = liveChangeTreeOf(preview);
  const nameOf = new Map(preview.nodes.map((node) => [node.id, node.name]));
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background [background-image:radial-gradient(color-mix(in_srgb,var(--primary)_12%,transparent)_1px,transparent_1px)] [background-size:16px_16px]"
      data-testid="live-change-canvas"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 text-xs">
        <span className="min-w-0 break-words text-muted-foreground">
          {preview.subject ?? 'Pending change'}
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px]',
            decision === 'pending' && 'border-primary text-primary',
            decision === 'approved' && 'border-[color:var(--success)] text-[color:var(--success)]',
            decision === 'denied' && 'border-border text-muted-foreground',
          )}
          data-testid="live-change-decision"
        >
          {DECISION_LABEL[decision]}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-border bg-card/70 px-3 py-2 text-xs tabular-nums">
        <span className="font-semibold">{liveChangeSummaryOf(preview)}</span>
        {preview.truncated ? (
          <span className="text-muted-foreground">
            Large campaign: only the first items are shown
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid min-w-[560px] gap-6">
          {tree.map((campaign) => (
            <div
              key={campaign.node.id}
              className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-x-6"
            >
              <NodeBox node={campaign.node} currency={preview.currency} />
              <div className="grid gap-3 border-l-[1.5px] border-border pl-4">
                {campaign.adSets.map((adSet) => (
                  <div
                    key={adSet.node.id}
                    className="grid grid-cols-[200px_minmax(0,1fr)] items-start gap-x-5"
                  >
                    <NodeBox
                      node={adSet.node}
                      currency={preview.currency}
                      note={adSet.stopsWithParent ? 'stops with its campaign' : null}
                      basedOnName={adSet.node.basedOnId ? nameOf.get(adSet.node.basedOnId) : null}
                    />
                    <div className="grid gap-1.5 border-l border-dotted border-border pl-3">
                      {adSet.ads.map((ad) => (
                        <NodeBox
                          key={ad.id}
                          node={ad}
                          currency={preview.currency}
                          compact
                          note={adStopsWithParent(adSet, ad) ? 'stops with its ad set' : null}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
