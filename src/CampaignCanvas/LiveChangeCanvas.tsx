'use client';

// The companion canvas when Jaina proposes an edit to a LIVE campaign: the campaign as Meta
// has it, in columns, with the pending change marked (amber changed, green new and paused, red
// paused, the rest dimmed) and only the branches that change unfolded. Read-only — the
// approval stays on the chat card beside it.

import type { LiveChangePreviewPayload } from '@continuum/contracts';
import { ReactFlowProvider } from '@xyflow/react';
import * as React from 'react';
import { columnMapFromLiveChange } from '@/lib/campaign-canvas/columnMap';
import { type LiveChangeDecision, liveChangeSummaryOf } from '@/lib/campaign-canvas/liveChange';
import { cn } from '@/lib/utils';
import { ColumnMapFlow } from './columnMap/ColumnMapFlow';

const DECISION_LABEL: Record<LiveChangeDecision, string> = {
  pending: 'Preview · approve in chat',
  approved: 'Approved in chat',
  denied: 'Denied · nothing changed',
};

/** Where the approval stands; the companion's header shows it in both views. */
export function LiveChangeDecisionPill({ decision }: { decision: LiveChangeDecision }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px]',
        decision === 'pending' && 'border-primary text-primary-ink',
        decision === 'approved' && 'border-[color:var(--success)] text-[color:var(--success)]',
        decision === 'denied' && 'border-border text-muted-foreground',
      )}
      data-testid="live-change-decision"
    >
      {DECISION_LABEL[decision]}
    </span>
  );
}

export function LiveChangeCanvas({
  preview,
  decision,
  showHeader = true,
}: {
  preview: LiveChangePreviewPayload;
  decision: LiveChangeDecision;
  /** False when a host draws the subject and the decision above it. */
  showHeader?: boolean;
}) {
  const model = React.useMemo(() => columnMapFromLiveChange(preview), [preview]);
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background [background-image:radial-gradient(color-mix(in_srgb,var(--primary)_12%,transparent)_1px,transparent_1px)] [background-size:16px_16px]"
      data-testid="live-change-canvas"
    >
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 text-xs">
          <span className="min-w-0 break-words text-muted-foreground">
            {preview.subject ?? 'Pending change'}
          </span>
          <LiveChangeDecisionPill decision={decision} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-border bg-card/70 px-3 py-2 text-xs tabular-nums">
        <span className="font-semibold">{liveChangeSummaryOf(preview)}</span>
        {preview.truncated ? (
          <span className="text-muted-foreground">
            Large campaign: only the first items are shown
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <ColumnMapFlow key={preview.partId} model={model} testIdPrefix="live-change-node-" />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
