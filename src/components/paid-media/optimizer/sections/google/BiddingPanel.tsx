'use client';

import type { useTranslations as ScaleTranslationHook } from 'next-intl';
import { useLocale } from 'next-intl';
import type { UiLocale } from '@/i18n/config';
import { googleCopy } from './googlePresentation';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import { useTranslations } from 'next-intl';

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

export function cooldownText(
  cooldown: Cooldown,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string {
  switch (cooldown.state) {
    case 'wait':
      return uiTranslate
        ? uiTranslate('helper_6f7de2ec4132', {
            v0: dayLabel(cooldown.until, uiLocale),
            v1: G07_COOLDOWN_DAYS,
            v2: cooldown.daysLeft,
          })
        : `Next change from ${dayLabel(cooldown.until, uiLocale)}: Smart Bidding relearns for ${G07_COOLDOWN_DAYS} days (${cooldown.daysLeft} left).`;
    case 'clear':
      return uiTranslate
        ? uiTranslate('helper_ce913064005e', { v0: STEP_PCT })
        : `Can change now, by up to ${STEP_PCT}%.`;
    case 'unknown':
      return googleCopy(cooldown.reason, uiTranslate);
  }
}

export function lastChangeText(
  view: BiddingView,
  currency: string | null,
  uiLocale: UiLocale = 'en',
  uiTranslate?: ScaleCopy,
): string {
  const change = view.lastChange.value;
  if (!change)
    return view.lastChange.reason ? googleCopy(view.lastChange.reason, uiTranslate) : '—';
  return `${dayLabel(change.at, uiLocale)}: ${targetLabel(change.before, view.targetKind, currency, uiLocale)} → ${targetLabel(change.after, view.targetKind, currency, uiLocale)}`;
}

function proposalText(
  view: BiddingView,
  currency: string | null,
  uiTranslate?: ScaleCopy,
  uiLocale: UiLocale = 'en',
): string | null {
  const proposal = view.proposal;
  if (!proposal) return null;
  const kind = proposal.strategy === 'target_cpa' ? 'cpa' : 'roas';
  const verb = proposal.proposed < proposal.current ? 'lower' : 'raise';
  return uiTranslate
    ? uiTranslate('googleBidProposal', {
        direction: verb,
        current: targetLabel(proposal.current, kind, currency, uiLocale),
        proposed: targetLabel(proposal.proposed, kind, currency, uiLocale),
      })
    : `Jaina proposes to ${verb} Google's target from ${targetLabel(proposal.current, kind, currency, uiLocale)} to ${targetLabel(proposal.proposed, kind, currency, uiLocale)}. Approve or reject it on its card under "What Jaina recommends".`;
}

export function biddingSummary(rows: readonly BiddingView[], uiTranslate?: ScaleCopy): string {
  if (rows.length === 0)
    return uiTranslate
      ? uiTranslate('no_campaign_spent_in_the_window_c21127f')
      : 'No campaign spent in the window.';
  if (rows.every((row) => row.strategy.reason === NOT_IN_THIS_READ))
    return `${googleCopy(NOT_IN_THIS_READ, uiTranslate)}.`;
  const targeted = rows.filter((row) => row.target.value != null);
  const learning = rows.filter((row) => row.isLearning).length;
  const proposals = rows.filter((row) => row.proposal).length;
  if (uiTranslate)
    return uiTranslate('googleBiddingSummary', {
      targeted: targeted.length,
      total: rows.length,
      learning,
      proposals,
    });
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
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  return (
    <GoogleSection
      showLabel={googleCopy('Show bidding', uiText)}
      summary={biddingSummary(rows, uiText)}
      testId="google-bidding"
      title={googleCopy(BIDDING_TITLE, uiText)}
    >
      {rows.length === 0 ? null : (
        <>
          <ScrollTable testId="google-bidding-table">
            <thead>
              <tr>
                <th className={TH} scope="col">
                  {uiText('campaign_268286d')}
                </th>
                <th className={TH} scope="col">
                  {uiText('strategy_6b27710')}
                </th>
                <th className={TH_NUM} scope="col">
                  {uiText('google_target_5c3ee99')}
                </th>
                <th className={TH_NUM} scope="col">
                  {uiText('actual_c406421')}
                </th>
                <th className={TH} scope="col">
                  {uiText('vs_goal_597a6ce')}
                </th>
                <th className={TH} scope="col">
                  {uiText('next_change_d7b5e6c')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const proposal = proposalText(row, currency, uiText, uiLocale);
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
                        targetLabel(row.target.value, row.targetKind, currency, uiLocale)
                      ) : (
                        <Missing reason={row.target.reason} />
                      )}
                      {row.step ? (
                        <span className="block font-sans text-muted-foreground text-xs">
                          ±{STEP_PCT}%:{' '}
                          {targetLabel(row.step.low, row.targetKind, currency, uiLocale)}–
                          {targetLabel(row.step.high, row.targetKind, currency, uiLocale)}
                        </span>
                      ) : null}
                    </td>
                    <td className={TD_NUM}>
                      {row.actual.value != null ? (
                        targetLabel(row.actual.value, row.targetKind ?? 'cpa', currency, uiLocale)
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
                          {cooldownText(row.cooldown, uiText, uiLocale)}
                          <span className="block text-muted-foreground">
                            {uiText.rich('sentence_2cdaaa2e0070', {
                              v0: lastChangeText(row, currency, uiLocale, uiText),
                            })}
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
            {uiText.rich('sentence_3417abc965dc', { v0: STEP_PCT, v1: G07_COOLDOWN_DAYS })}
          </p>
        </>
      )}
    </GoogleSection>
  );
}
