'use client';

// The audience proposal an asked-for row opened, shown on that row.
//
// "Open the audience proposal" used to switch tabs and focus a queue row, which is a second
// place to look for something the row that asked already knows about. The row now opens the
// proposal under itself: the comparison, the rail and the create flow when Jaina wrote a plan
// (the same card the queue row renders, with the same actions), and otherwise the state where
// the proposed audience would be — queued, Jaina reading, blocked with its reason, or the
// failure block with what failed and the button that fixes it — beside what is known: the ad
// set, the signal, when it was asked for. A failed or blocked proposal offers to ask again
// through the request RPC the card has always used.

import type { AdSetSnapshot, ConvertCboResponse, RecommendationRow } from '@continuum/contracts';
import { readProposalPlan, readProposalResult } from '@continuum/contracts';
import { Loader2Icon, SparklesIcon } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import * as typeScale from '../../typeScale';
import {
  type ActionNotice,
  AudienceRecommendationCard,
  NoticeLine,
  ProposalFailureBlock,
  WhatAudience,
} from '../AudienceRecommendationCard';
import {
  AUDIENCE_PROPOSAL_STATE_LABEL,
  audienceCardView,
  type PortfolioAdsetSpec,
  proposalFailure,
  reaskThrottledNote,
  triggerLabel,
} from '../audienceCardModel';
import type { AudienceCardActions, AudienceCardBusy } from '../OptimizerActionsPortfolioGroup';
import { type AskedForRow, proposalStateLabel } from './askedForModel';

export type AskedProposalPanelProps = {
  row: AskedForRow;
  /** The recommendation the handoff minted — from the cycle report when it lists it, else
   *  rebuilt from the proposal (audienceCardModel.carriedRecommendation). Null only while
   *  neither read has it yet. */
  rec: RecommendationRow | null;
  snapshot: AdSetSnapshot | null;
  portfolioSpecs: readonly PortfolioAdsetSpec[];
  currency: string | null;
  brandId: string;
  adAccountId: string;
  resultWord: string;
  actions: AudienceCardActions;
  busy: AudienceCardBusy;
  cboPreviewByCampaign: ReadonlyMap<string, ConvertCboResponse>;
};

const RETRY_LABEL = 'Ask Jaina again';

const requestedAt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function whenLabel(iso: string | null): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : requestedAt.format(at);
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-28 shrink-0 text-muted-foreground text-xs">{label}</dt>
      <dd className="min-w-0 break-words text-foreground text-sm">{value}</dd>
    </div>
  );
}

export function AskedProposalPanel(props: AskedProposalPanelProps) {
  const { row, rec } = props;
  const [notice, setNotice] = React.useState<ActionNotice | null>(null);
  const handoff = row.handoff;
  if (!handoff?.proposal_id) return null;
  const proposal = row.proposal;
  const plan = proposal ? readProposalPlan(proposal.row) : null;

  if (proposal && plan && rec) {
    const view = audienceCardView([proposal.row], rec);
    const proposalId = proposal.row.id;
    const campaignId = view.block?.campaign_id ?? plan.source.campaign_id ?? null;
    return (
      <AudienceRecommendationCard
        adAccountId={props.adAccountId}
        adsetName={handoff.adset_name}
        approving={props.busy.approvingId === proposalId}
        brandId={props.brandId}
        busy={props.busy.busyId === proposalId}
        cboPreview={campaignId ? (props.cboPreviewByCampaign.get(campaignId) ?? null) : null}
        convertingCbo={props.busy.convertingCbo}
        currency={props.currency}
        onActivate={() => props.actions.activate(proposalId)}
        onApprove={({ budgetMinorUnits, activate }) =>
          props.actions.approve({ proposalId, budgetMinorUnits, activate, mode: plan.mode })
        }
        onCancel={() => props.actions.cancel(proposalId)}
        onConvertCbo={props.actions.convertCbo}
        onRequest={(handlers) => props.actions.request(rec.id, handlers)}
        onRetry={(handlers) => props.actions.retry(proposalId, handlers)}
        onUndo={() => props.actions.undo(proposalId)}
        portfolioSpecs={props.portfolioSpecs}
        rec={rec}
        requesting={props.busy.requestingRecId === rec.id}
        resultWord={props.resultWord}
        retrying={props.busy.retryingId === proposalId}
        snapshot={props.snapshot}
        view={view}
      />
    );
  }

  const requesting = rec != null && props.busy.requestingRecId === rec.id;
  const ask =
    proposal?.retryable && rec
      ? () => {
          setNotice(null);
          props.actions.request(rec.id, {
            onDone: (proposalId) => {
              const throttled = reaskThrottledNote(proposalId, proposal.row);
              setNotice(throttled ? { tone: 'info', text: throttled } : null);
            },
            onError: (message) => setNotice({ tone: 'error', text: message }),
          });
        }
      : null;
  const failure = proposal
    ? proposalFailure(proposal.row, null, readProposalResult(proposal.row))
    : null;
  return (
    <div className="space-y-4" data-testid="asked-proposal-panel">
      <section className="space-y-2" data-testid="asked-proposal-state">
        <h4 className={`${typeScale.label} text-muted-foreground`}>Audience proposal</h4>
        {failure ? (
          <>
            <Badge className={typeScale.label} variant="destructive">
              {AUDIENCE_PROPOSAL_STATE_LABEL.failed}
            </Badge>
            <ProposalFailureBlock
              failure={failure}
              notice={notice}
              onReask={ask}
              onRetry={null}
              reaskTestId="asked-proposal-retry"
              requesting={requesting}
              retrying={false}
            />
          </>
        ) : proposal ? (
          <>
            {/* A blocked face carries its own badge; every other state wears the row's. */}
            {proposal.state === 'blocked' || proposal.state === 'blocked_cbo' ? null : (
              <Badge className={typeScale.label} variant="muted">
                {proposalStateLabel(proposal)}
              </Badge>
            )}
            <WhatAudience block={proposal.block} plan={null} state={proposal.state} />
          </>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-3.5 animate-spin" />
            Reading the proposal…
          </p>
        )}
        {proposal?.closed ? (
          <p className="text-muted-foreground text-sm">
            The cycle closed the recommendation this proposal came from.
          </p>
        ) : null}
      </section>
      <section className="space-y-2" data-testid="asked-proposal-facts">
        <h4 className={`${typeScale.label} text-muted-foreground`}>What is known</h4>
        <dl className="space-y-1.5">
          <Fact label="Ad set" value={handoff.adset_name ?? handoff.adset_id} />
          <Fact label="Signal" value={proposal ? triggerLabel(proposal.row.trigger) : null} />
          <Fact label="Asked for" value={whenLabel(proposal?.row.created_at ?? handoff.built_at)} />
        </dl>
      </section>
      {ask && !failure ? (
        <div className="space-y-2">
          <Button
            className="h-8 px-3 text-sm"
            data-testid="asked-proposal-retry"
            disabled={requesting}
            onClick={ask}
            size="sm"
            type="button"
            variant="secondary"
          >
            {requesting ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="size-3.5" />
            )}
            {RETRY_LABEL}
          </Button>
          <NoticeLine notice={notice} />
        </div>
      ) : null}
    </div>
  );
}
