'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

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

const requestedDates = new Map<UiLocale, Intl.DateTimeFormat>();
function requestedAt(locale: UiLocale) {
  let fmt = requestedDates.get(locale);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
    requestedDates.set(locale, fmt);
  }
  return fmt;
}

function whenLabel(iso: string | null, locale: UiLocale = 'en'): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : requestedAt(locale).format(at);
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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const { row, rec } = props;
  const [notice, setNotice] = React.useState<ActionNotice | null>(null);
  const handoff = row.handoff;
  if (!handoff?.proposal_id) return null;
  const proposal = row.proposal;
  const plan = proposal ? readProposalPlan(proposal.row) : null;

  if (proposal && plan && rec) {
    const view = audienceCardView([proposal.row], rec, uiText);
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
              const throttled = reaskThrottledNote(
                proposalId,
                proposal.row,
                undefined,
                uiText,
                uiLocale,
              );
              setNotice(throttled ? { tone: 'info', text: throttled } : null);
            },
            onError: (message) => setNotice({ tone: 'error', text: message }),
          });
        }
      : null;
  const failure = proposal
    ? proposalFailure(proposal.row, null, readProposalResult(proposal.row), uiText)
    : null;
  return (
    <div className="space-y-4" data-testid="asked-proposal-panel">
      <section className="space-y-2" data-testid="asked-proposal-state">
        <h4 className={`${typeScale.label} text-muted-foreground`}>
          {uiText('audience_proposal_a7f9785')}
        </h4>
        {failure ? (
          <>
            <p className="font-medium text-destructive text-xs">
              {uiText('audienceStateLabel', { state: 'failed' })}
            </p>
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
              <p className="text-muted-foreground text-xs">
                {proposalStateLabel(proposal, uiText)}
              </p>
            )}
            <WhatAudience block={proposal.block} plan={null} state={proposal.state} />
          </>
        ) : (
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2Icon className="size-3.5 animate-spin" />
            {uiText('reading_the_proposal_4be8a34')}
          </p>
        )}
        {proposal?.closed ? (
          <p className="text-muted-foreground text-sm">
            {uiText('the_cycle_closed_the_recommendation_this_prop_42e591b')}
          </p>
        ) : null}
      </section>
      <section className="space-y-2" data-testid="asked-proposal-facts">
        <h4 className={`${typeScale.label} text-muted-foreground`}>
          {uiText('what_is_known_f19377a')}
        </h4>
        <dl className="space-y-1.5">
          <Fact label={uiText('ad_set_639a64f')} value={handoff.adset_name ?? handoff.adset_id} />
          <Fact
            label={uiText('signal_1e9806e')}
            value={proposal ? triggerLabel(proposal.row.trigger, uiText) : null}
          />
          <Fact
            label={uiText('asked_for_0191afa')}
            value={whenLabel(proposal?.row.created_at ?? handoff.built_at, uiLocale)}
          />
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
            {uiText('askJainaAgain')}
          </Button>
          <NoticeLine notice={notice} />
        </div>
      ) : null}
    </div>
  );
}
