'use client';

// The companion canvas when Jaina proposes an edit to a LIVE campaign: the campaign as Meta
// has it, in columns, with the pending change marked (amber changed, green new and paused, red
// paused, the rest dimmed) and only the branches that change unfolded. Read-only — the
// approval stays on the chat card beside it.

import type { LiveChangePreviewPayload } from '@continuum/contracts';
import { ReactFlowProvider } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { columnMapFromLiveChange } from '@/lib/campaign-canvas/columnMap';
import { type LiveChangeDecision, liveChangeSummaryOf } from '@/lib/campaign-canvas/liveChange';
import { cn } from '@/lib/utils';
import { ColumnMapFlow } from './columnMap/ColumnMapFlow';

const DECISION_LABEL_KEY = {
  pending: 'preview_approve_in_chat_1205a28',
  approved: 'approved_in_chat_110b458',
  denied: 'denied_nothing_changed_c28a4af',
  proposal: 'projection_nothing_applied_5dbee29',
} as const satisfies Record<LiveChangeDecision, string>;

/** Where the approval stands; the companion's header shows it in both views. */
export function LiveChangeDecisionPill({ decision }: { decision: LiveChangeDecision }) {
  const uiText = useTranslations('scale');
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px]',
        (decision === 'pending' || decision === 'proposal') && 'border-primary text-primary-ink',
        decision === 'approved' && 'border-[color:var(--success)] text-[color:var(--success)]',
        decision === 'denied' && 'border-border text-muted-foreground',
      )}
      data-testid="live-change-decision"
    >
      {uiText(DECISION_LABEL_KEY[decision])}
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
  const uiText = useTranslations('scale');
  const model = React.useMemo(() => columnMapFromLiveChange(preview), [preview]);
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background [background-image:radial-gradient(color-mix(in_srgb,var(--primary)_12%,transparent)_1px,transparent_1px)] [background-size:16px_16px]"
      data-testid="live-change-canvas"
    >
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 text-xs">
          <span className="min-w-0 break-words text-muted-foreground">
            {preview.subject ?? uiText('pending_change_64b979c')}
          </span>
          <LiveChangeDecisionPill decision={decision} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <ColumnMapFlow
            key={preview.partId}
            model={model}
            testIdPrefix="live-change-node-"
            header={
              <span className="flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
                <span className="font-semibold">{liveChangeSummaryOf(preview)}</span>
                {preview.truncated ? (
                  <span className="text-muted-foreground">
                    {uiText('large_campaign_only_the_first_items_are_shown_1f1bda5')}
                  </span>
                ) : null}
              </span>
            }
          />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
