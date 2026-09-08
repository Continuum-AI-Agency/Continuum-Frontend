'use client';

import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Separator } from '@/components/ui/separator';
import type { CanvasGateStatus } from '@/lib/paid-media/jaina-activity-client';
import type { BaseCampaignNodeData } from '../types';

/**
 * The footer a HYDRATED node grows: which approval stands between it and Meta, who
 * signed it, and what it is doing on Meta if it got there.
 *
 * One component rather than the same block copied into five node files — a gate that
 * read "Approved" on an ad set and "approved" on an ad would be two vocabularies for
 * one fact. Draft nodes render nothing at all, which is how the two kinds of node stay
 * visually distinguishable without a badge announcing it.
 *
 * The pill vocabulary is deliberately the SAME one `ScaffoldStatusPill` uses on the
 * scaffold card, for the same reason: a reader moving between the two surfaces should
 * not have to relearn what a colour means.
 */

type Tone = 'success' | 'error' | 'warning' | 'info';

const GATE_PRESENTATION: Record<CanvasGateStatus, { tone: Tone; label: string; pulse: boolean }> = {
  proposed: { tone: 'info', label: 'Proposed', pulse: false },
  awaiting_approval: { tone: 'warning', label: 'Awaiting approval', pulse: true },
  approved: { tone: 'success', label: 'Approved', pulse: false },
  denied: { tone: 'error', label: 'Denied', pulse: false },
  expired: { tone: 'warning', label: 'Expired', pulse: false },
  consumed: { tone: 'success', label: 'Approval used', pulse: false },
};

/** Short and absolute. A relative time on a record of an approval invites re-reading it. */
const formatApprovedAt = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export function NodeProvenance({ data }: { data: BaseCampaignNodeData }) {
  const provenance = data.provenance;
  if (!provenance) return null;

  const gate = provenance.gate;
  const presentation = GATE_PRESENTATION[gate?.status ?? 'proposed'];
  const approver = gate?.approvedBy;
  const approvedAt = gate?.approvedAt;

  return (
    <>
      <Separator className="my-2" />
      <div className="flex flex-col gap-1.5" data-testid="canvas-node-provenance">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill className="gap-1.5 whitespace-nowrap" data-testid="canvas-node-gate">
            <PillIndicator variant={presentation.tone} pulse={presentation.pulse} />
            {presentation.label}
          </Pill>
          {provenance.metaStatus ? (
            <Pill
              className="gap-1.5 whitespace-nowrap"
              data-testid="canvas-node-meta-status"
              title="The status this object holds in Meta Ads Manager."
            >
              <PillIndicator
                variant={provenance.metaStatus === 'ACTIVE' ? 'success' : 'info'}
                pulse={false}
              />
              {provenance.metaStatus}
            </Pill>
          ) : null}
        </div>

        {approver || approvedAt ? (
          <span className="text-2xs text-muted-foreground" data-testid="canvas-node-approver">
            {approver ? `by ${approver}` : 'by a former member'}
            {approvedAt ? ` · ${formatApprovedAt(approvedAt)}` : ''}
          </span>
        ) : null}

        <span className="font-mono text-2xs text-muted-foreground" data-testid="canvas-node-meta-id">
          {data.metaId ? `Meta ID: ${data.metaId}` : `Not on Meta · ${provenance.pathKey}`}
        </span>
      </div>
    </>
  );
}
