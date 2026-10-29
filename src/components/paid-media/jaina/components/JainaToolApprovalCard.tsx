'use client';

import {
  approvalVariantsOf,
  type ChangeMetaBudgetBidInput,
  changeMetaBudgetBidInputSchema,
  type JainaApprovalPreview,
  type JainaApprovalVariant,
  type JainaApprovalVariantOption,
  type JainaPublicationMode,
  type JainaToolAction,
  type JainaToolApprovalRequiredPayload,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import {
  AgentActions,
  AgentButton,
  AgentCardBody,
  AgentCardEyebrow,
  AgentCardSummary,
  AgentCardTitle,
  AgentDecisionCard,
  ApproveRejectActions,
  StatusLabel,
} from '@/components/shared/agent-cards/agentCardKit';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchAudienceGroupVersionSummary } from '@/lib/paid-media/audience-group-client';
import { cn } from '@/lib/utils';
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
 * A tool that declares a CHOICE of approval (contracts `JAINA_APPROVAL_VARIANTS_BY_TOOL` —
 * today only `change_meta_budget_bid`, Ramiro's no-cap rule) gets a confirmation instead: a
 * plain sentence of what is about to change, a table of entity, before → after and the
 * difference, the ad sets a pause would stop, and one button per declared approval plus
 * Reject. Each button sends an ordinary approve carrying its `approval_variant`.
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
const TOOL_LABELS: Record<string, string> = {
  audience_group_publish: 'Publish audience group to Meta',
  pipeline_run: 'Run pipeline',
  approve_optimizer_recommendation: 'Approve optimizer recommendations',
  request_optimizer_budget_apply: 'Request budget apply',
  apply_approved_optimizer_pauses: 'Apply approved pauses',
  paid_creative_slate: 'Generate creative slate',
  pause_meta_entity: 'Pause campaign / ad set / ad',
  rename_meta_entity: 'Rename campaign / ad set / ad',
  activate_meta_entity: 'Unpause a paused campaign / ad set / ad',
  archive_meta_entity: 'Archive ad set / ad',
  duplicate_meta_entity: 'Duplicate as a paused copy',
  apply_audience_to_meta_adset: 'Apply an audience as a new paused ad set',
  meta_batch_change: 'Change several ads at once',
  change_meta_budget_bid: 'Change budgets and bids',
  change_meta_placements: 'Copy an ad set with new placements (paused)',
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

/** "budgets", "bids" or "budgets and bids" — the noun the confirmation sentence counts. */
const changeNounOf = (input: ChangeMetaBudgetBidInput): string => {
  const count = input.changes.length;
  const bids = input.changes.filter((change) => change.field === 'bid_amount').length;
  if (bids === 0) return count === 1 ? 'budget' : 'budgets';
  if (bids === count) return count === 1 ? 'bid' : 'bids';
  return 'budgets and bids';
};

const formatPct = (pct: number): string => `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;

/**
 * The confirmation a choice-of-approval card shows. The rows are the gated tool's own
 * `previewOf` over the signed input, so every amount here is the one the write refuses to
 * diverge from; the input itself is parsed through the shared contract only to count the
 * changes and name the ad sets a pause would stop.
 */
function ChoiceConfirmation({
  input,
  preview,
}: {
  input: ChangeMetaBudgetBidInput | null;
  preview: JainaApprovalPreview | null;
}) {
  return (
    <div className="mt-3 space-y-3">
      {input ? (
        <AgentCardSummary>
          You are about to change {input.changes.length} {changeNounOf(input)}. Nothing changes
          until you choose below.
        </AgentCardSummary>
      ) : null}
      {preview ? (
        <div className={`px-1 py-1.5 ${VALUES_PANEL}`}>
          <Table>
            <TableHeader>
              <TableRow className="border-foreground/5 hover:bg-transparent">
                <TableHead className="h-8 px-2 text-xs font-medium">Entity</TableHead>
                <TableHead className="h-8 px-2 text-xs font-medium">Before</TableHead>
                <TableHead className="h-8 px-2 text-xs font-medium">After</TableHead>
                <TableHead className="h-8 px-2 text-right text-xs font-medium">
                  Difference
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((row) => (
                <TableRow key={row.field} className="border-foreground/5 hover:bg-transparent">
                  <TableCell className="px-2 py-1.5 text-xs">{row.field}</TableCell>
                  <TableCell className="px-2 py-1.5 text-muted-foreground text-xs tabular-nums">
                    {formatValue(row.before)}
                  </TableCell>
                  <TableCell className="px-2 py-1.5 font-medium text-xs tabular-nums">
                    {formatValue(row.after)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'px-2 py-1.5 text-right text-xs tabular-nums',
                      typeof row.changePct === 'number' && row.changePct < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400',
                    )}
                  >
                    {`${row.difference ?? '—'}${typeof row.changePct === 'number' ? ` (${formatPct(row.changePct)})` : ''}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {input ? (
        <div className={`px-3 py-2.5 text-sm ${VALUES_PANEL}`}>
          <p className="text-muted-foreground text-xs">
            Pausing for review changes no budget or bid. It pauses these ad sets:
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {input.affected_adset_ids_for_review.map((adset) => (
              <li key={adset.adset_id} className="text-xs">
                {adset.name}
                {adset.expected_status === 'PAUSED' ? (
                  <span className="text-muted-foreground"> — already paused, left as it is</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Reject on the left, then every declared approval, the first (apply) as the primary. */
function ChoiceActions({
  options,
  locked,
  onChoose,
  onReject,
}: {
  options: readonly JainaApprovalVariantOption[];
  locked: boolean;
  onChoose: (variant: JainaApprovalVariant) => void;
  onReject: () => void;
}) {
  const [primary, ...others] = options;
  return (
    <AgentActions className="flex-wrap px-4">
      <AgentButton variant="ghost" disabled={locked} onClick={onReject}>
        Reject
      </AgentButton>
      {others.map((option) => (
        <AgentButton
          key={option.variant}
          variant="ghost"
          className="bg-background text-foreground"
          disabled={locked}
          title={option.description}
          onClick={() => onChoose(option.variant)}
        >
          {option.label}
        </AgentButton>
      ))}
      {primary ? (
        <AgentButton
          variant="primary"
          disabled={locked}
          title={primary.description}
          onClick={() => onChoose(primary.variant)}
        >
          {primary.label}
        </AgentButton>
      ) : null}
    </AgentActions>
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
  onDecide?: (
    approval: JainaToolApprovalRequiredPayload,
    decision: ToolApprovalDecision,
    publicationMode?: JainaPublicationMode,
    approvalVariant?: JainaApprovalVariant,
  ) => void;
}) {
  const title = TOOL_LABELS[approval.toolName] ?? approval.toolName;
  const expired = Date.parse(approval.expiresAt) < Date.now();
  const groupVersionId =
    approval.toolName === 'audience_group_publish'
      ? ((asRecord(approval.input)?.group_version_id as string | undefined) ?? null)
      : null;
  // Absent for every tool that declares no `previewOf`; those cards render as before.
  const preview = approval.preview?.rows.length ? approval.preview : null;
  // The tool would refuse this call after the click, so the card says why and offers no approve.
  const blocked = approval.preview?.blocked ?? null;
  const choices = approvalVariantsOf(approval.toolName);
  const choiceInput = choices ? changeMetaBudgetBidInputSchema.safeParse(approval.input) : null;

  return (
    <AgentDecisionCard className={DECISION_MODULE}>
      <div className="px-4 pt-4">
        <AgentCardEyebrow
          label="Approval required"
          right={<ApprovalStatus decided={optimisticDecision} expired={expired} />}
        />
      </div>
      <AgentCardBody>
        <AgentCardTitle>{title}</AgentCardTitle>

        {groupVersionId ? <AudienceGroupSummary groupVersionId={groupVersionId} /> : null}

        {choices ? (
          <ChoiceConfirmation
            input={choiceInput?.success ? choiceInput.data : null}
            preview={preview}
          />
        ) : preview ? (
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
            <summary className="cursor-pointer text-muted-foreground text-xs">Exact input</summary>
            <div className="mt-2">
              <ProposedInput input={approval.input} />
            </div>
          </details>
        ) : (
          <div className={`mt-3 px-3 py-2.5 ${VALUES_PANEL}`}>
            <ProposedInput input={approval.input} />
          </div>
        )}

        {blocked ? (
          <p className="mt-3 text-foreground text-sm" role="note">
            {blocked}
          </p>
        ) : null}

        {expired && !optimisticDecision ? (
          <p className="mt-2 text-muted-foreground text-sm">
            This approval expired, so nothing ran. Ask Jaina to propose it again.
          </p>
        ) : null}
      </AgentCardBody>

      {!optimisticDecision && !expired && onDecide && blocked ? (
        <AgentActions className="px-4">
          <AgentButton
            variant="ghost"
            disabled={isStreaming}
            onClick={() => onDecide(approval, 'deny')}
          >
            Dismiss
          </AgentButton>
        </AgentActions>
      ) : null}
      {!optimisticDecision && !expired && onDecide && !blocked && choices ? (
        <ChoiceActions
          options={choices}
          locked={isStreaming}
          onChoose={(variant) => onDecide(approval, 'approve', undefined, variant)}
          onReject={() => onDecide(approval, 'deny')}
        />
      ) : null}
      {!optimisticDecision && !expired && onDecide && !blocked && !choices ? (
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
