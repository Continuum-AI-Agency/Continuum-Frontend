'use client';

import type { JainaToolAction, JainaToolApprovalRequiredPayload } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import {
  AgentCardBody,
  AgentCardEyebrow,
  AgentCardSummary,
  AgentCardTitle,
  AgentDecisionCard,
  ApproveRejectActions,
  StatusLabel,
} from '@/components/shared/agent-cards/agentCardKit';
import { fetchAudienceGroupVersionSummary } from '@/lib/paid-media/audience-group-client';

/**
 * One pending `tool.approval_required` for any gated tool that is NOT a paid scaffold.
 *
 * The scaffold keeps its own card because it has a tree to render and three ordered
 * gates; everything else is answered from the arguments alone. This card therefore
 * shows the EXACT proposed input rather than a prose summary — a summary is a second
 * description of the call that can disagree with the one that will actually run, which
 * is the whole failure mode an approval gate exists to stop.
 *
 * There is no resolved/denied state here on purpose: the reducer drops an approval
 * from `pendingToolApprovals` the moment it resolves, so a decided card disappears and
 * the resumed turn's prose reports what happened. `optimisticDecision` covers only the
 * window between the click and that frame.
 */

export type ToolApprovalDecision = JainaToolAction['decision'];

/** Tool name → what the human is actually being asked to allow. */
const TOOL_LABELS: Record<string, string> = {
  audience_group_publish: 'Publish audience group to Meta',
  pipeline_run: 'Run pipeline',
  approve_optimizer_recommendation: 'Approve optimizer recommendations',
  request_optimizer_budget_apply: 'Request budget apply',
  apply_approved_optimizer_pauses: 'Apply approved pauses',
  paid_creative_slate: 'Generate creative slate',
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Scalars read inline; anything else as compact JSON, never truncated into a lie. */
const formatValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return '—';
  return JSON.stringify(value);
};

function ProposedInput({ input }: { input: unknown }) {
  const record = asRecord(input);
  const entries = record ? Object.entries(record) : [];

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {record ? 'This call takes no arguments.' : formatValue(input)}
      </p>
    );
  }

  return (
    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
      {entries.map(([key, value]) => (
        <React.Fragment key={key}>
          <dt className="font-mono text-muted-foreground text-xs leading-5">{key}</dt>
          <dd className="min-w-0 break-words font-mono text-xs leading-5">{formatValue(value)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/**
 * The audience group's human-readable identity, read under RLS.
 *
 * `group_version_id` is a uuid; approving one is approving nothing you can read. The
 * read is best-effort by design — a refusal leaves the definition list standing rather
 * than blocking the gate.
 */
function AudienceGroupSummary({ groupVersionId }: { groupVersionId: string }) {
  const { data } = useQuery({
    queryKey: ['audience-group-version-summary', groupVersionId] as const,
    queryFn: () => fetchAudienceGroupVersionSummary({ groupVersionId }),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (!data) return null;
  return (
    <AgentCardSummary>
      {data.name} — {data.memberCount} audience{data.memberCount === 1 ? '' : 's'}
    </AgentCardSummary>
  );
}

export function JainaToolApprovalCard({
  approval,
  optimisticDecision,
  isStreaming,
  onDecide,
}: {
  approval: JainaToolApprovalRequiredPayload;
  /** Set between the click and the `tool.approval_resolved` frame that answers it. */
  optimisticDecision: ToolApprovalDecision | null;
  isStreaming: boolean;
  onDecide?: (approval: JainaToolApprovalRequiredPayload, decision: ToolApprovalDecision) => void;
}) {
  const title = TOOL_LABELS[approval.toolName] ?? approval.toolName;
  const expired = Date.parse(approval.expiresAt) < Date.now();
  const groupVersionId =
    approval.toolName === 'audience_group_publish'
      ? ((asRecord(approval.input)?.group_version_id as string | undefined) ?? null)
      : null;

  return (
    <AgentDecisionCard>
      <AgentCardEyebrow
        label="Approval required"
        right={<ApprovalStatus decided={optimisticDecision} expired={expired} />}
      />
      <AgentCardBody>
        <AgentCardTitle>{title}</AgentCardTitle>

        {groupVersionId ? <AudienceGroupSummary groupVersionId={groupVersionId} /> : null}

        <div className="mt-3 rounded-md border border-border/50 bg-muted/20 px-3 py-2.5">
          <ProposedInput input={approval.input} />
        </div>

        {expired && !optimisticDecision ? (
          <p className="mt-2 text-muted-foreground text-sm">
            This approval expired, so nothing ran. Ask Jaina to propose it again.
          </p>
        ) : null}
      </AgentCardBody>

      {!optimisticDecision && !expired && onDecide ? (
        <ApproveRejectActions
          locked={isStreaming}
          approveLabel="Approve"
          rejectLabel="Deny"
          onApprove={() => onDecide(approval, 'approve')}
          onReject={() => onDecide(approval, 'deny')}
        />
      ) : null}
    </AgentDecisionCard>
  );
}

function ApprovalStatus({
  decided,
  expired,
}: {
  decided: ToolApprovalDecision | null;
  expired: boolean;
}) {
  if (decided === 'deny') return <StatusLabel tone="neutral">Declined — nothing ran</StatusLabel>;
  if (decided === 'approve') return <StatusLabel tone="running">Approved</StatusLabel>;
  if (expired) return <StatusLabel tone="neutral">Expired</StatusLabel>;
  return <StatusLabel tone="waiting">Awaiting your approval</StatusLabel>;
}
