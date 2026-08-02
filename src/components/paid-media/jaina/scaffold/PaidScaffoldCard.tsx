'use client';

import type {
  JainaToolApprovalRequiredPayload,
  JainaToolApprovalResolvedPayload,
  JainaToolOutputDeniedPayload,
} from '@continuum/contracts';
import * as React from 'react';
import {
  AgentCardBody,
  AgentCardEyebrow,
  AgentCardSummary,
  AgentDecisionCard,
  ApproveRejectActions,
  StatusLabel,
} from '@/components/shared/agent-cards/agentCardKit';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import type { JainaScaffoldState } from '@/lib/jaina/stream';
import { ScaffoldAdSetTable } from './ScaffoldAdSetTable';
import { ScaffoldTreeCanvas } from './ScaffoldTreeCanvas';
import { usePaidScaffoldTree } from './usePaidScaffoldTree';

/**
 * One proposed campaign scaffold, with its approval gate.
 *
 * Read + approve/deny only. There is no edit path here by design: a name, a
 * targeting spec and a billing event are all DERIVED from the version a human
 * approved, so changing an ad set means changing its angle or audience and letting
 * the name recompute — not typing over the name. Revising is "ask Jaina to propose
 * again", which bumps the version and re-hashes the manifest.
 */

export type ScaffoldDecision = 'approve' | 'deny';

/** The three gates read back from the tool name, so the label is never hardcoded. */
const GATE_BY_TOOL_NAME: Record<
  string,
  { gate: 'build' | 'populate' | 'activate'; label: string }
> = {
  paid_scaffold_build: { gate: 'build', label: 'Approve & create (paused)' },
  paid_scaffold_populate: { gate: 'populate', label: 'Approve & add creatives' },
  paid_scaffold_activate: { gate: 'activate', label: 'Approve & activate' },
};

const summaryLine = (scaffold: JainaScaffoldState): string => {
  const campaigns = scaffold.summary?.campaigns ?? 0;
  const adSets = scaffold.summary?.adSets ?? 0;
  const ads = scaffold.summary?.ads ?? 0;
  const parts = [
    `${campaigns} campaign${campaigns === 1 ? '' : 's'}`,
    `${adSets} ad set${adSets === 1 ? '' : 's'}`,
    `${ads} ad${ads === 1 ? '' : 's'}`,
  ];
  return `${parts.join(' · ')} — everything is created paused.`;
};

export function PaidScaffoldCard({
  scaffold,
  approval,
  resolution,
  denial,
  optimisticDecision,
  isStreaming,
  onDecide,
}: {
  scaffold: JainaScaffoldState;
  approval: JainaToolApprovalRequiredPayload | null;
  resolution: JainaToolApprovalResolvedPayload | null;
  denial: JainaToolOutputDeniedPayload | null;
  optimisticDecision: ScaffoldDecision | null;
  isStreaming: boolean;
  onDecide?: (approval: JainaToolApprovalRequiredPayload, decision: ScaffoldDecision) => void;
}) {
  const [canvasOpen, setCanvasOpen] = React.useState(false);
  const [selectedPathKey, setSelectedPathKey] = React.useState<string | null>(null);

  const { tree, isLoading, isError, error } = usePaidScaffoldTree({
    scaffoldVersionId: scaffold.scaffoldId,
    overlay: scaffold.progressByNode,
    settledAt: scaffold.receipt?.completedAt ?? null,
  });

  const gate = approval ? GATE_BY_TOOL_NAME[approval.toolName] : undefined;
  const expired = approval ? Date.parse(approval.expiresAt) < Date.now() : false;
  const decided = optimisticDecision ?? (resolution ? resolution.decision : null);
  const showActions = Boolean(approval && gate && !decided && !expired && onDecide);

  const progressTotal = scaffold.lastProgress?.total ?? 0;
  const progressDone = Object.values(scaffold.progressByNode).filter(
    (entry) => entry.status === 'succeeded' || entry.status === 'skipped',
  ).length;

  return (
    <>
      <AgentDecisionCard>
        <AgentCardEyebrow
          label="Paid campaign scaffold"
          right={<ScaffoldStatus decided={decided} receipt={scaffold.receipt} expired={expired} />}
        />
        <AgentCardBody>
          <AgentCardSummary>{summaryLine(scaffold)}</AgentCardSummary>

          {progressTotal > 0 && !scaffold.receipt ? (
            <div className="flex flex-col gap-1">
              <Progress value={(progressDone / progressTotal) * 100} className="h-1.5" />
              <span className="text-muted-foreground text-xs tabular-nums">
                {progressDone} of {progressTotal} created
              </span>
            </div>
          ) : null}

          <ScaffoldReceiptNotice scaffold={scaffold} />

          {isError ? (
            <p className="text-destructive text-sm">
              {error?.message ?? 'Could not load the scaffold.'}
            </p>
          ) : (
            <ScaffoldAdSetTable
              tree={tree}
              isLoading={isLoading}
              onOpenCanvas={tree ? () => setCanvasOpen(true) : undefined}
            />
          )}

          {denial?.reason ? (
            <p className="text-muted-foreground text-sm">Reason: {denial.reason}</p>
          ) : null}

          {expired && !decided ? (
            <p className="text-muted-foreground text-sm">
              This approval expired, so nothing was created. Ask Jaina to propose the scaffold
              again.
            </p>
          ) : null}
        </AgentCardBody>

        {showActions && approval && gate ? (
          <ApproveRejectActions
            locked={isStreaming}
            approveLabel={gate.label}
            onApprove={() => onDecide?.(approval, 'approve')}
            onReject={() => onDecide?.(approval, 'deny')}
          />
        ) : null}
      </AgentDecisionCard>

      <Dialog open={canvasOpen} onOpenChange={setCanvasOpen}>
        <DialogContent className="flex h-[88vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-sm">Campaign scaffold — tree view</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            {tree ? (
              <ScaffoldTreeCanvas
                tree={tree}
                selectedPathKey={selectedPathKey}
                onSelect={setSelectedPathKey}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ScaffoldStatus({
  decided,
  receipt,
  expired,
}: {
  decided: ScaffoldDecision | 'approved' | 'denied' | null;
  receipt: JainaScaffoldState['receipt'];
  expired: boolean;
}) {
  if (receipt) {
    const tone =
      receipt.status === 'completed' ? 'done' : receipt.status === 'partial' ? 'running' : 'failed';
    return <StatusLabel tone={tone}>{receipt.status}</StatusLabel>;
  }
  if (decided === 'deny' || decided === 'denied') {
    return <StatusLabel tone="neutral">Declined — nothing created</StatusLabel>;
  }
  if (decided === 'approve' || decided === 'approved') {
    return <StatusLabel tone="running">Approved</StatusLabel>;
  }
  if (expired) return <StatusLabel tone="neutral">Expired</StatusLabel>;
  return <StatusLabel tone="neutral">Awaiting your approval</StatusLabel>;
}

/**
 * Unrecorded Meta ids are the highest-priority line in any receipt: they are objects
 * that may exist without a record, so a retry would duplicate them. Surfaced above
 * everything else rather than buried in an error list.
 */
function ScaffoldReceiptNotice({ scaffold }: { scaffold: JainaScaffoldState }) {
  const receipt = scaffold.receipt as
    | (Record<string, unknown> & { errors?: { message: string }[] })
    | null;
  if (!receipt) return null;
  const unrecorded = Array.isArray(receipt.unrecordedMetaObjectIds)
    ? (receipt.unrecordedMetaObjectIds as string[])
    : [];

  if (unrecorded.length > 0) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-sm">
        <p className="font-medium">
          {unrecorded.length} object{unrecorded.length === 1 ? '' : 's'} may exist on Meta without a
          record.
        </p>
        <p className="text-muted-foreground">
          Do not retry this gate — read the ad account first, or the retry will create duplicates.
        </p>
      </div>
    );
  }

  const firstError = receipt.errors?.[0]?.message;
  return firstError ? <p className="text-destructive text-sm">{firstError}</p> : null;
}
