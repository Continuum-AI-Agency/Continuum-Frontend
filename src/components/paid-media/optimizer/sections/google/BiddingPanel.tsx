'use client';

// Idea 7, the bidding panel: per campaign, Google's target (a bid setting on the platform)
// against what it actually paid, its learning status, and when the target may move again: G07
// moves it at most ±10% per change and waits 14 days while Smart Bidding relearns. The panel
// writes nothing. A proposal is approved on its G07 card, under "What Jaina recommends".

import { G07_COOLDOWN_DAYS, G07_STEP } from '@continuum/contracts';
import { type BiddingView, type Cooldown, dayLabel, targetLabel } from './campaignExplorerModel';
import {
  BandText,
  FigureText,
  GoogleSection,
  Missing,
  ReasonNotes,
  ScrollTable,
  TD,
  TD_NUM,
  TH,
  TH_NUM,
} from './GoogleSection';
import { NOT_IN_THIS_READ } from './googleReads';

const STEP_PCT = Math.round(G07_STEP * 100);

export function cooldownText(cooldown: Cooldown): string {
  switch (cooldown.state) {
    case 'wait':
      return `Next change from ${dayLabel(cooldown.until)}: Smart Bidding relearns for ${G07_COOLDOWN_DAYS} days (${cooldown.daysLeft} left).`;
    case 'clear':
      return `Can change now, by up to ${STEP_PCT}%.`;
    case 'unknown':
      return cooldown.reason;
  }
}

export function lastChangeText(view: BiddingView, currency: string | null): string {
  const change = view.lastChange.value;
  if (!change) return view.lastChange.reason ?? '—';
  return `${dayLabel(change.at)}: ${targetLabel(change.before, view.targetKind, currency)} → ${targetLabel(change.after, view.targetKind, currency)}`;
}

function proposalText(view: BiddingView, currency: string | null): string | null {
  const proposal = view.proposal;
  if (!proposal) return null;
  const kind = proposal.strategy === 'target_cpa' ? 'cpa' : 'roas';
  const verb = proposal.proposed < proposal.current ? 'lower' : 'raise';
  return `Jaina proposes to ${verb} Google's target from ${targetLabel(proposal.current, kind, currency)} to ${targetLabel(proposal.proposed, kind, currency)}. Approve or reject it on its card under "What Jaina recommends".`;
}

export function biddingSummary(rows: readonly BiddingView[]): string {
  if (rows.length === 0) return 'No campaign spent in the window.';
  if (rows.every((row) => row.strategy.reason === NOT_IN_THIS_READ)) return `${NOT_IN_THIS_READ}.`;
  const targeted = rows.filter((row) => row.target.value != null);
  const learning = rows.filter((row) => row.isLearning).length;
  const proposals = rows.filter((row) => row.proposal).length;
  const parts = [
    `${targeted.length} of ${rows.length} ${rows.length === 1 ? 'campaign bids' : 'campaigns bid'} with a Google target`,
    learning > 0 ? `${learning} still learning` : null,
    proposals > 0
      ? `${proposals} ${proposals === 1 ? 'proposal waits' : 'proposals wait'} on ${proposals === 1 ? 'its card' : 'their cards'}`
      : null,
  ].filter(Boolean);
  return `${parts.join(', ')}.`;
}

export const BIDDING_TITLE = "Bidding: Google's target against what it paid";

export function BiddingPanel({
  rows,
  currency,
}: {
  rows: readonly BiddingView[];
  currency: string | null;
}) {
  return (
    <GoogleSection
      showLabel="Show bidding"
      summary={biddingSummary(rows)}
      testId="google-bidding"
      title={BIDDING_TITLE}
    >
      {rows.length === 0 ? null : (
        <>
          <ScrollTable testId="google-bidding-table">
            <thead>
              <tr>
                <th className={TH} scope="col">
                  Campaign
                </th>
                <th className={TH} scope="col">
                  Strategy
                </th>
                <th className={TH_NUM} scope="col">
                  Google target
                </th>
                <th className={TH_NUM} scope="col">
                  Actual
                </th>
                <th className={TH} scope="col">
                  vs goal
                </th>
                <th className={TH} scope="col">
                  Next change
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const proposal = proposalText(row, currency);
                return (
                  <tr
                    className="border-border/60 border-t"
                    data-campaign-id={row.id}
                    data-testid="google-bidding-row"
                    key={row.id}
                  >
                    <td className={TD}>
                      {row.name}
                      {proposal ? (
                        <span
                          className="mt-0.5 block text-primary-ink text-xs"
                          data-testid="google-bidding-proposal"
                        >
                          {proposal}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD}>
                      <FigureText figure={row.strategy} format={(value) => value} />
                      <span
                        className="block text-muted-foreground text-xs"
                        data-learning={row.isLearning ? 'true' : 'false'}
                        data-testid="google-bidding-status"
                      >
                        <FigureText figure={row.learning} format={(value) => value} />
                      </span>
                    </td>
                    <td className={TD_NUM}>
                      {row.target.value != null ? (
                        targetLabel(row.target.value, row.targetKind, currency)
                      ) : (
                        <Missing reason={row.target.reason} />
                      )}
                      {row.step ? (
                        <span className="block font-sans text-muted-foreground text-xs">
                          ±{STEP_PCT}%: {targetLabel(row.step.low, row.targetKind, currency)}–
                          {targetLabel(row.step.high, row.targetKind, currency)}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD_NUM}>
                      {row.actual.value != null ? (
                        targetLabel(row.actual.value, row.targetKind ?? 'cpa', currency)
                      ) : (
                        <Missing reason={row.actual.reason} />
                      )}
                    </td>
                    <td className={TD}>
                      <BandText band={row.band} />
                    </td>
                    <td className={`${TD} text-xs`} data-testid="google-bidding-next">
                      {row.targetKind ? (
                        <>
                          {cooldownText(row.cooldown)}
                          <span className="block text-muted-foreground">
                            Last: {lastChangeText(row, currency)}
                          </span>
                        </>
                      ) : (
                        <Missing reason={row.target.reason ?? 'No bid target to change'} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </ScrollTable>
          <ReasonNotes
            reasons={rows.flatMap((row) => [
              row.strategy.reason,
              row.target.reason,
              row.actual.reason,
            ])}
          />
          <p className="text-muted-foreground text-xs">
            Google's target is a bid setting on the campaign; the goal is the portfolio's CPA goal,
            the cost Continuum optimizes up to. One change moves the target at most {STEP_PCT}%,
            then Smart Bidding relearns for {G07_COOLDOWN_DAYS} days.
          </p>
        </>
      )}
    </GoogleSection>
  );
}
