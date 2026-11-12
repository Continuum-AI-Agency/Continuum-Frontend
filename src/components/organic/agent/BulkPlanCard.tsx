'use client';

import { useFormatter, useTranslations } from 'next-intl';
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
import { conceptFormatLabel } from './conceptLabels';
import type { BulkContentPlan } from './types';

function formatMix(
  plan: BulkContentPlan,
  translate: ReturnType<typeof useTranslations<'organic'>>,
  formatter: ReturnType<typeof useFormatter>,
): string[] {
  const mix = plan.strategyBrief.mix;
  const total = mix.reduce((sum, m) => sum + m.weight, 0) || 1;
  return mix.map(
    (m) =>
      `${conceptFormatLabel(m.format, translate)} ${formatter.number(Math.round((m.weight / total) * 100) / 100, { style: 'percent', maximumFractionDigits: 0 })}`,
  );
}

type Props = {
  plan: BulkContentPlan;
  onApproveAction: () => void;
  onRejectAction: () => void;
};

export function BulkPlanCard({ plan, onApproveAction, onRejectAction }: Props) {
  const uiText = useTranslations('organic');
  const formatter = useFormatter();
  const [decided, setDecided] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { strategyBrief, schedule, placements } = plan;

  function decide(action: () => void) {
    if (decided) return;
    setDecided(true);
    action();
  }

  return (
    <AgentDecisionCard className="p-4" data-testid="bulk-plan-card">
      <AgentCardEyebrow
        label={uiText('bulk_plan_b04d06e')}
        right={
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {uiText.rich('sentence_a75c38010050', {
              pieces: placements.length,
              weeks: schedule.horizonWeeks,
            })}
          </span>
        }
      />
      <AgentCardTitle>{plan.title}</AgentCardTitle>
      <AgentCardSummary>{strategyBrief.summary}</AgentCardSummary>

      <div className="mt-3.5 space-y-2">
        <MetaRow items={strategyBrief.pillars.map((p) => p.name)} />
        <MetaRow items={formatMix(plan, uiText, formatter)} />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {uiText.rich('sentence_308f35960e90', {
              count: schedule.postsPerDayPerPlatform,
            })}
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
        {uiText.rich('sentence_3801e75b630b', {
          action: () => (expanded ? uiText('hide_ac20a57') : uiText('show_0df6f1c')),
          count: placements.length,
        })}
      </button>

      {expanded && (
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
          {placements.map((spec) => (
            <div key={spec.specId} className="space-y-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <PlatformTag platform={spec.platform} />
                <MetaRow
                  items={[
                    conceptFormatLabel(spec.format, uiText),
                    spec.dayId ?? uiText('plannerNoDate'),
                  ]}
                />
              </div>
              <p className="truncate text-sm text-foreground/80">{spec.angle}</p>
            </div>
          ))}
        </div>
      )}

      <ApproveRejectActions
        locked={decided}
        approveLabel={uiText('bulkApproveGenerate')}
        approveTestId="bulk-plan-approve"
        onApprove={() => decide(onApproveAction)}
        onReject={() => decide(onRejectAction)}
      />
    </AgentDecisionCard>
  );
}
