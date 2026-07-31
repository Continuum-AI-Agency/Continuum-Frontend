'use client';

import { useState } from 'react';
import {
  AgentCardEyebrow,
  AgentCardSummary,
  AgentCardTitle,
  AgentDecisionCard,
  ApproveRejectActions,
  MetaRow,
  PlatformTag,
} from '@/components/shared/agent-cards/agentCardKit';
import type { BulkContentPlan } from './types';

function formatMix(plan: BulkContentPlan): string[] {
  const mix = plan.strategyBrief.mix;
  const total = mix.reduce((sum, m) => sum + m.weight, 0) || 1;
  return mix.map((m) => `${m.format} ${Math.round((m.weight / total) * 100)}%`);
}

type Props = {
  plan: BulkContentPlan;
  onApproveAction: () => void;
  onRejectAction: () => void;
};

export function BulkPlanCard({ plan, onApproveAction, onRejectAction }: Props) {
  const [decided, setDecided] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { strategyBrief, schedule, placements } = plan;

  function decide(action: () => void) {
    if (decided) return;
    setDecided(true);
    action();
  }

  return (
    <AgentDecisionCard className="p-4">
      <AgentCardEyebrow
        label="Bulk plan"
        right={
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {placements.length} pieces · {schedule.horizonWeeks} wks
          </span>
        }
      />
      <AgentCardTitle>{plan.title}</AgentCardTitle>
      <AgentCardSummary>{strategyBrief.summary}</AgentCardSummary>

      <div className="mt-3.5 space-y-2">
        <MetaRow items={strategyBrief.pillars.map((p) => p.name)} />
        <MetaRow items={formatMix(plan)} />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            ~{schedule.postsPerDayPerPlatform}/day/platform
          </span>
          {strategyBrief.platformSplit.map((s) => (
            <PlatformTag key={s.platform} platform={s.platform} />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {expanded ? 'Hide' : 'Show'} {placements.length} scheduled pieces
      </button>

      {expanded && (
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
          {placements.map((spec) => (
            <div key={spec.specId} className="space-y-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <PlatformTag platform={spec.platform} />
                <MetaRow items={[spec.format, spec.dayId ?? 'unscheduled']} />
              </div>
              <p className="truncate text-sm text-foreground/80">{spec.angle}</p>
            </div>
          ))}
        </div>
      )}

      <ApproveRejectActions
        locked={decided}
        approveLabel="Approve & generate"
        onApprove={() => decide(onApproveAction)}
        onReject={() => decide(onRejectAction)}
      />
    </AgentDecisionCard>
  );
}
