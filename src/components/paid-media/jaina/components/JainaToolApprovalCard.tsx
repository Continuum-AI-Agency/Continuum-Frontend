'use client';

import type { JainaToolAction, JainaToolApprovalRequiredPayload } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useMemo } from 'react';
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
import { ApprovalChangeTable } from './ApprovalChangeTable';

/**
 * One pending `tool.approval_required` for any gated tool that is NOT a paid scaffold.
 *
 * The scaffold keeps its own card because it has a tree to render and three ordered
 * gates; everything else is answered from the arguments alone. This card therefore
 * shows the EXACT proposed input rather than a prose summary — a summary is a second
 * description of the call that can disagree with the one that will actually run, which
 * is the whole failure mode an approval gate exists to stop.
 *
 * A tool that declares a `previewOf` also gets a before -> after table above that list
 * (`ApprovalChangeTable`) — a person approving a budget change reads the budget, not a
 * uuid — and the list collapses behind a disclosure rather than disappearing.
 *
 * ai-elements `Confirmation` is deliberately NOT used here: it renders an `Alert`
 * (`role="alert"`, its own `rounded-lg border bg-card`) which nests a second bordered
 * card inside AgentDecisionCard and announces every pending approval as an alert, and
 * its `ConfirmationActions` are bare shadcn Buttons rather than the kit's AgentButton.
 * It fights agentCardKit on both the framing and the actions row, so the kit wins.
 *
 * There is no resolved/denied state here on purpose: the reducer drops an approval
 * from `pendingToolApprovals` the moment it resolves, so a decided card disappears and
 * the resumed turn's prose reports what happened. `optimisticDecision` covers only the
 * window between the click and that frame.
 */

export type ToolApprovalDecision = JainaToolAction['decision'];

/**
 * An approval asks for a decision, so it is the answer's decision module: the primary tint,
 * no border, no shadow. The actions row keeps the module's inset, and the secondary action
 * sits on white beside the primary purple one.
 */
const DECISION_MODULE =
  'rounded-xl border-0 bg-primary/10 pb-4 [&>[data-slot=card-footer]]:px-4 [&>[data-slot=card-footer]>button:first-child]:bg-background';

/** A panel of exact values inside the decision module: white, borderless. */
const VALUES_PANEL = 'rounded-lg bg-background/80';

/** Tool name → what the human is actually being asked to allow. */

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
  const uiText = useTranslations('scale');
  const record = asRecord(input);
  const entries = record ? Object.entries(record) : [];

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {record ? uiText('this_call_takes_no_arguments_750f018') : formatValue(input)}
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
  const uiText = useTranslations('scale');
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
      {uiText.rich('sentence_55e9859b5a8f', { name: data.name, count: data.memberCount })}
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
  const uiText = useTranslations('scale');
  const TOOL_LABELS: Record<string, string> = useMemo(
    () => ({
      audience_group_publish: uiText('jainaApproval_audience_group_publish'),
      pipeline_run: uiText('run_pipeline_c415e40'),
      approve_optimizer_recommendation: uiText('jainaApproval_approve_optimizer_recommendation'),
      request_optimizer_budget_apply: uiText('jainaApproval_request_optimizer_budget_apply'),
      apply_approved_optimizer_pauses: uiText('jainaApproval_apply_approved_optimizer_pauses'),
      paid_creative_slate: uiText('jainaApproval_paid_creative_slate'),
      pause_meta_entity: uiText('jainaApproval_pause_meta_entity'),
      rename_meta_entity: uiText('jainaApproval_rename_meta_entity'),
      activate_meta_entity: uiText('jainaApproval_activate_meta_entity'),
      archive_meta_entity: uiText('jainaApproval_archive_meta_entity'),
      duplicate_meta_entity: uiText('jainaApproval_duplicate_meta_entity'),
    }),
    [uiText],
  );

  const title = TOOL_LABELS[approval.toolName] ?? uiText('jainaUnknownTool');
  const expired = Date.parse(approval.expiresAt) < Date.now();
  const groupVersionId =
    approval.toolName === 'audience_group_publish'
      ? ((asRecord(approval.input)?.group_version_id as string | undefined) ?? null)
      : null;
  // Absent for every tool that declares no `previewOf`; those cards render as before.
  const preview = approval.preview?.rows.length ? approval.preview : null;

  return (
    <AgentDecisionCard className={DECISION_MODULE}>
      <div className="px-4 pt-4">
        <AgentCardEyebrow
          label={uiText('approval_required_ef677f5')}
          right={<ApprovalStatus decided={optimisticDecision} expired={expired} />}
        />
      </div>
      <AgentCardBody>
        <AgentCardTitle>{title}</AgentCardTitle>

        {groupVersionId ? <AudienceGroupSummary groupVersionId={groupVersionId} /> : null}

        {preview ? (
          <div className={`mt-3 px-1 py-1.5 ${VALUES_PANEL}`}>
            <ApprovalChangeTable preview={preview} />
          </div>
        ) : null}

        {/*
         * The table summarises; this list IS the call. It therefore never leaves the
         * card — a preview only collapses it, because the exact arguments are what an
         * approval actually authorises and a summary that disagrees with them is the
         * failure mode this gate exists to stop.
         */}
        {preview ? (
          <details className={`mt-2 px-3 py-2 ${VALUES_PANEL}`}>
            <summary className="cursor-pointer text-muted-foreground text-xs">
              {uiText('exact_input_e583d6e')}
            </summary>
            <div className="mt-2">
              <p className="mb-1 font-mono text-xs text-muted-foreground">{approval.toolName}</p>
              <ProposedInput input={approval.input} />
            </div>
          </details>
        ) : (
          <div className={`mt-3 px-3 py-2.5 ${VALUES_PANEL}`}>
            <p className="mb-1 font-mono text-xs text-muted-foreground">{approval.toolName}</p>
            <ProposedInput input={approval.input} />
          </div>
        )}

        {expired && !optimisticDecision ? (
          <p className="mt-2 text-muted-foreground text-sm">
            {uiText('this_approval_expired_so_nothing_ran_ask_jain_43257f7')}
          </p>
        ) : null}
      </AgentCardBody>

      {!optimisticDecision && !expired && onDecide ? (
        <ApproveRejectActions
          locked={isStreaming}
          approveLabel={uiText('optimizer_approve')}
          rejectLabel={uiText('deny_05a2d73')}
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
  const uiText = useTranslations('scale');
  if (decided === 'deny')
    return <StatusLabel tone="neutral">{uiText('declined_nothing_ran_b457168')}</StatusLabel>;
  if (decided === 'approve')
    return <StatusLabel tone="running">{uiText('approved_87b42e4')}</StatusLabel>;
  if (expired) return <StatusLabel tone="neutral">{uiText('expired_424a255')}</StatusLabel>;
  return <StatusLabel tone="waiting">{uiText('awaiting_your_approval_9f09488')}</StatusLabel>;
}
