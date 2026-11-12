import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
// The middle of a platform-specific recommendation card: its title and the evidence line that
// only Google or TikTok has. The chrome around it — chips, impact, the action and "Ask Jaina" —
// stays in AccountRead, so a Google card and a Meta card differ only where their platforms do.

import type { PlatformCard } from '@continuum/contracts';
import { ExternalLinkIcon } from 'lucide-react';
import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../format';
import * as typeScale from '../../typeScale';
import { PlatformChip, PlatformIcon } from '../platforms/PlatformChip';
import { PLATFORM_NAMES } from '../platforms/platformTabsModel';
import { NegativeTermsReview } from '../searchActions/NegativeTermsReview';
import { PlatformCardActionControl, UnavailableAction } from './PlatformCardActionControl';
import {
  cardActionAvailability,
  cardWriteOf,
  type PlatformCardAction,
  withTerms,
} from './platformCardActionModel';
import {
  ATTRIBUTION_WINDOW_NOTE,
  bidCooldownNote,
  bidTargetLabel,
  budgetProjectionLabel,
  CROSS_PLATFORM_APPROVAL_NOTE,
  codeLabel,
  countLabel,
  GOOGLE_ADS_CAMPAIGNS_HREF,
  givingLegs,
  googleAdsCampaignHref,
  googleDeliveryHref,
  googleReasonInWords,
  legChangeLabel,
  markedPlatformOf,
  negativesLabel,
  PMAX_ASSETS_NOTE,
  PMAX_NOTE,
  percentLabel,
  platformCardTitle,
  pmaxAssetLine,
  SPARK_NOTE,
  scheduledLabel,
  takingLegs,
  VIDEO_READONLY_NOTE,
} from './platformCardModel';

type NegativeTermsCard = Extract<PlatformCard, { variant: 'google_negative_terms' }>;
type GoogleDeliveryCard = Extract<PlatformCard, { variant: 'google_delivery_issue' }>;
type TikTokDeliveryCard = Extract<PlatformCard, { variant: 'tiktok_delivery_issue' }>;

/** Approving negatives hands the caller the terms a person kept; absent, the card only reads. */
export type AddNegatives = (terms: string[]) => void;

export type { PlatformCardAction };

function cardCurrency(card: PlatformCard): string | null {
  return 'currency' in card ? card.currency : null;
}

/** The card's own action control: the approval flow for a Google write, a disabled button that
 *  says why for a TikTok one or one whose writes are switched off, nothing on a read-only card
 *  or without an action. */
function CardAction({ card, target }: { card: PlatformCard; target?: PlatformCardAction }) {
  const write = cardWriteOf(target);
  const availability = cardActionAvailability(card, target);
  if (write == null || target == null || availability === 'none') return null;
  if (availability !== 'ready')
    return <UnavailableAction availability={availability} write={write} />;
  return (
    <PlatformCardActionControl
      currency={cardCurrency(card)}
      portfolioId={target.portfolioId}
      recommendationId={target.recommendationId}
      write={write}
    />
  );
}

function Evidence({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <p className="text-muted-foreground text-sm" data-testid={testId}>
      {children}
    </p>
  );
}

function OpenInGoogleAds({ href }: { href: string }) {
  const uiText = useTranslations('scale');
  return (
    <a
      className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'gap-1.5')}
      data-testid="platform-card-open-google"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {uiText('open_in_google_ads_0131249')}
      <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
    </a>
  );
}

function GoogleDeliveryEvidence({ card }: { card: GoogleDeliveryCard }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  return (
    <div className="space-y-2">
      <Evidence testId="platform-card-delivery">
        {uiText('platformGoogleDeliveryEvidence',{reasons:card.reasons.map(code=>googleReasonInWords(code,uiText)).join('; '),hasDisapproved:card.disapproved_ads>0?'yes':'no',count:card.disapproved_ads,hasBudget:card.budget_per_day!=null?'yes':'no',budget:card.budget_per_day!=null?formatCurrency(card.budget_per_day,card.currency,uiLocale):''})}
      </Evidence>
      {card.account_wide ? (
        <p className="text-muted-foreground text-xs" data-testid="platform-card-account-wide">
          {uiText.rich('sentence_fdcdefcd3ae9', { v0: card.campaign_name })}
        </p>
      ) : null}
      <OpenInGoogleAds href={googleDeliveryHref(card.disapproved_ads)} />
    </div>
  );
}

function TikTokDeliveryEvidence({ card }: { card: TikTokDeliveryCard }) {
  const uiText = useTranslations('scale');
  if (card.rejected_ads.length === 0) {
    return (
      <Evidence testId="platform-card-delivery">
        {uiText('tiktok_gives_no_review_reason_for_it_check_th_026c164')}
      </Evidence>
    );
  }
  return (
    <div className="space-y-1">
      <ul className="space-y-1 text-sm" data-testid="platform-card-rejections">
        {card.rejected_ads.map((ad, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a rejection carries no id and never reorders
          <li className="text-foreground" data-testid="platform-card-rejection" key={index}>
            {uiText.rich('sentence_3ffa71f054b1', {
              v0:
                ad.reasons.length > 0
                  ? ad.reasons.map((reason) => `"${reason}"`).join(', ')
                  : uiText('no_reason_given_bdb1872'),
              v1: () =>
                ad.suggestion ? (
                  <span className="text-muted-foreground">
                    {uiText.rich('sentence_7222497d4abf', { v0: ad.suggestion })}
                  </span>
                ) : null,
            })}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        {uiText('fix_it_in_tiktok_ads_manager_0f72143')}
      </p>
    </div>
  );
}

function NegativeTermsEvidence({
  card,
  onAddNegatives,
  action,
}: {
  card: NegativeTermsCard;
  onAddNegatives?: AddNegatives;
  action?: PlatformCardAction;
}) {
  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const [reviewing, setReviewing] = useState(false);
  const [chosen, setChosen] = useState<string[] | null>(null);
  const every = card.terms.map((row) => row.term);
  const write = cardWriteOf(action);
  const availability = cardActionAvailability(card, action);
  const negatives = write?.kind === 'add_negatives' ? write : null;
  const approvable = action != null && negatives != null && availability === 'ready';
  // Switched off, the terms go nowhere: the caller's own add would reach the same refusal.
  const switchedOff = negatives != null && availability === 'apply_disabled';
  // With the engine's action, the card approves it here; without, it hands the caller the terms.
  const add: AddNegatives | undefined = approvable
    ? (terms) => setChosen(terms)
    : switchedOff
      ? undefined
      : onAddNegatives;
  return (
    <div className="space-y-2">
      <table className="w-full text-sm" data-testid="platform-card-terms">
        <thead>
          <tr className="text-left text-muted-foreground text-xs">
            <th className="font-normal">{uiText('search_term_c474ada')}</th>
            <th className="text-right font-normal">{uiText('spend_85f3d55')}</th>
            <th className="text-right font-normal">{uiText('clicks_921fc98')}</th>
            <th className="text-right font-normal">{uiText('conversions_236c262')}</th>
          </tr>
        </thead>
        <tbody>
          {card.terms.map((row) => (
            <tr data-testid="platform-card-term" key={row.term}>
              <td className="text-foreground">"{row.term}"</td>
              <td className="text-right tabular-nums">
                {formatCurrency(row.spend, card.currency, uiLocale)}
              </td>
              <td className="text-right tabular-nums">{countLabel(row.clicks, uiLocale)}</td>
              <td className="text-right tabular-nums">{countLabel(row.conversions, uiLocale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Evidence testId="platform-card-negatives">
        {uiText.rich('sentence_a320fc6109dd', {
          match: card.match_type,
          savings: formatCurrency(card.savings_per_day, card.currency, uiLocale),
        })}
      </Evidence>
      {add && reviewing ? (
        <NegativeTermsReview
          currency={card.currency}
          onCancel={() => setReviewing(false)}
          onConfirm={(terms) => {
            setReviewing(false);
            add(terms);
          }}
          terms={card.terms}
          windowDays={card.window_days}
        />
      ) : null}
      {approvable && write && chosen ? (
        <PlatformCardActionControl
          currency={card.currency}
          key={chosen.join('\u0000')}
          onClose={() => setChosen(null)}
          portfolioId={action.portfolioId}
          recommendationId={action.recommendationId}
          startOpen
          write={withTerms(write, chosen)}
        />
      ) : null}
      {add && !reviewing ? (
        <div className="flex flex-wrap gap-2">
          {approvable && write ? (
            <PlatformCardActionControl
              currency={card.currency}
              portfolioId={action.portfolioId}
              recommendationId={action.recommendationId}
              write={write}
            />
          ) : (
            <Button
              data-testid="platform-card-add-negatives"
              onClick={() => add(every)}
              size="sm"
              type="button"
              variant="secondary"
            >
              {negativesLabel(every.length, uiText)}
            </Button>
          )}
          <Button
            data-testid="platform-card-choose-terms"
            onClick={() => setReviewing(true)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {uiText('choose_terms_21bbafd')}
          </Button>
        </div>
      ) : null}
      {switchedOff ? <UnavailableAction availability="apply_disabled" write={negatives} /> : null}
    </div>
  );
}

function VariantEvidence({
  card,
  onAddNegatives,
  action,
}: {
  card: PlatformCard;
  onAddNegatives?: AddNegatives;
  action?: PlatformCardAction;
}) {
  const uiText = useTranslations('scale');
  const AD_STRENGTH_LABEL = useMemo(
    () =>
      ({
        POOR: uiText('platformStrengthPoor'),
        AVERAGE: uiText('platformStrengthAverage'),
        GOOD: uiText('platformStrengthGood'),
        EXCELLENT: uiText('platformStrengthExcellent'),
        PENDING: uiText('pending_331551b'),
        UNSPECIFIED: uiText('platformStrengthUnrated'),
      }) as const,
    [uiText],
  );

  const uiLocale = useLocale();
  switch (card.variant) {
    case 'google_budget_limited': {
      const projection = budgetProjectionLabel(card, uiText, uiLocale);
      return (
        <div className="space-y-1">
          <Evidence testId="platform-card-budget">
            {uiText.rich('sentence_4b189efcfd2f', {
              budget: formatCurrency(card.budget_per_day, card.currency, uiLocale),
              lost: percentLabel(card.budget_lost_impression_share, uiLocale),
              proposed: card.proposed_budget_per_day != null ? 'yes' : 'no',
              nextBudget:
                card.proposed_budget_per_day != null
                  ? formatCurrency(card.proposed_budget_per_day, card.currency, uiLocale)
                  : '',
            })}
          </Evidence>
          {projection ? (
            <p className="text-foreground text-sm" data-testid="platform-card-projection">
              {projection}
            </p>
          ) : null}
        </div>
      );
    }
    case 'google_pmax_asset_group':
      return (
        <div className="space-y-1">
          <ul className="space-y-0.5 text-sm" data-testid="platform-card-asset-groups">
            {card.asset_groups.map((group) => (
              <li className="text-foreground" key={group.name}>
                <span className="font-medium">{group.name}</span>
                {group.ad_strength ? (
                  <span className="text-muted-foreground">
                    {uiText.rich('sentence_2abd7ae6d841', {
                      v0: AD_STRENGTH_LABEL[group.ad_strength],
                    })}
                  </span>
                ) : null}
                <span className="text-muted-foreground">
                  {' '}
                  ·{' '}
                  {group.missing.length > 0
                    ? uiText('template_e56b7ec51e43', { v0: group.missing.join(', ') })
                    : uiText('nothing_missing_2407ac2')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">{uiText('platformNotePmax')}</p>
        </div>
      );
    case 'google_video_readonly':
      return (
        <div className="space-y-2">
          <Evidence testId="platform-card-readonly">{uiText('platformNoteVideo')}</Evidence>
          <OpenInGoogleAds href={googleAdsCampaignHref(card.campaign_id)} />
        </div>
      );
    case 'tiktok_creative_fatigue':
      return (
        <Evidence testId="platform-card-fatigue">
          {uiText.rich('sentence_789ed24c285f', {
            name: card.ad_group_name,
            hasReplacement: card.replacement ? 'yes' : 'no',
            replacement: card.replacement?.name ?? '',
            ctr: card.replacement ? percentLabel(card.replacement.ctr, uiLocale) : '',
          })}
        </Evidence>
      );
    case 'meta_creative_fatigue':
      return (
        <Evidence testId="platform-card-fatigue">
          {uiText.rich('sentence_9e9861187c2a', {
            name: card.ad_set_name,
            hasReplacement: card.replacement ? 'yes' : 'no',
            replacement: card.replacement?.name ?? '',
            ctr: card.replacement ? percentLabel(card.replacement.ctr, uiLocale) : '',
          })}
        </Evidence>
      );
    case 'tiktok_scheduled_decrease':
      return (
        <Evidence testId="platform-card-scheduled">
          {uiText.rich('sentence_7e0085829533', {
            v0: formatCurrency(card.spent_today, card.currency, uiLocale),
            v1: formatCurrency(card.floor, card.currency, uiLocale),
            v2: scheduledLabel(card.effective_at, card.timezone, uiText, uiLocale),
          })}
        </Evidence>
      );
    case 'cross_platform_move':
      return (
        <div className="space-y-1.5">
          <ul className="space-y-1 text-sm" data-testid="platform-card-legs">
            {[...givingLegs(card.legs), ...takingLegs(card.legs)].map((leg) => (
              <li
                className="flex flex-wrap items-center gap-1.5"
                data-testid="platform-card-leg"
                key={`${leg.platform}:${leg.entity_name}`}
              >
                <PlatformChip platform={leg.platform} />
                <span className="text-foreground">{leg.entity_name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {uiText.rich('sentence_e1f0064ca5d3', {
                    v0: formatCurrency(leg.from_per_day, card.currency, uiLocale),
                    v1: formatCurrency(leg.to_per_day, card.currency, uiLocale),
                  })}
                </span>
                <span className="font-medium tabular-nums" data-testid="platform-card-leg-change">
                  {legChangeLabel(leg, uiText, uiLocale)}
                </span>
                {leg.scheduled_at ? (
                  <span className="text-muted-foreground text-xs">
                    {uiText.rich('sentence_afbca6306fe1', {
                      v0: scheduledLabel(leg.scheduled_at, null, uiText, uiLocale),
                    })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs" data-testid="platform-card-approval-note">
            {uiText('platformNoteCross')}
          </p>
        </div>
      );
    case 'google_negative_terms':
      return <NegativeTermsEvidence action={action} card={card} onAddNegatives={onAddNegatives} />;
    case 'google_promote_term':
      return (
        <Evidence testId="platform-card-promote">
          {uiText.rich('sentence_bdbaa68277e5', {
            hasKeyword: card.matched_keyword ? 'yes' : 'no',
            keyword: card.matched_keyword ?? '',
            group: card.ad_group_name,
          })}
        </Evidence>
      );
    case 'google_bid_target': {
      const label = (value: number) => bidTargetLabel(value, card.strategy, card.currency, uiLocale);
      return (
        <div className="space-y-1">
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="platform-card-bid">
            <div className="flex gap-1">
              <dt className="text-muted-foreground">{uiText('current_target_d797871')}</dt>
              <dd className="font-medium tabular-nums">{label(card.current_target)}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted-foreground">
                {uiText.rich('sentence_90e44768d228', { v0: card.window_days })}
              </dt>
              <dd className="font-medium tabular-nums">
                {card.actual != null ? label(card.actual) : uiText('not_enough_data_459c028')}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted-foreground">{uiText('proposed_9b0c660')}</dt>
              <dd className="font-medium tabular-nums">{label(card.proposed_target)}</dd>
            </div>
          </dl>
          <p className="text-muted-foreground text-xs" data-testid="platform-card-cooldown">
            {bidCooldownNote(card.days_since_last_change, uiText)}
          </p>
        </div>
      );
    }
    case 'google_low_quality_keyword':
      return (
        <Evidence testId="platform-card-quality">
          {uiText.rich('sentence_2f530e58cade', {
            match: card.match_type,
            group: card.ad_group_name,
            score: card.quality_score,
          })}
        </Evidence>
      );
    case 'tiktok_hook_retention':
      return (
        <Evidence testId="platform-card-hook">
          {uiText.rich('sentence_6d61e27468e7', {
            hold: percentLabel(card.hold_2s, uiLocale),
            portfolio: percentLabel(card.portfolio_hold_2s, uiLocale),
            impressions: countLabel(card.impressions, uiLocale),
            days: card.days_live,
            group: card.ad_group_name,
          })}
        </Evidence>
      );
    case 'tiktok_spark_candidate':
      return (
        <div className="space-y-1">
          <Evidence testId="platform-card-spark">
            {uiText.rich('sentence_a39c3060facb', {
              caption: card.post_caption,
              views: countLabel(card.views, uiLocale),
              engagement: percentLabel(card.engagement_rate, uiLocale),
              hasPercentile: card.account_percentile != null ? 'yes' : 'no',
              percentile: Math.round(card.account_percentile ?? 0),
              hasTarget: card.target_ad_group_name ? 'yes' : 'no',
              target: card.target_ad_group_name ?? '',
            })}
          </Evidence>
          <p className="text-muted-foreground text-xs">{uiText('platformNoteSpark')}</p>
        </div>
      );
    case 'tiktok_budget_below_learning':
      return (
        <Evidence testId="platform-card-learning">
          {uiText.rich('sentence_10da9a6a57d4', {
            multiple: card.required_multiple,
            hasCost: card.cost_per_result != null ? 'yes' : 'no',
            cost:
              card.cost_per_result != null
                ? formatCurrency(card.cost_per_result, card.currency, uiLocale)
                : '',
            budget: formatCurrency(card.required_budget_per_day, card.currency, uiLocale),
            results: card.results_so_far,
          })}
        </Evidence>
      );
    case 'tiktok_attribution_window':
      return (
        <div className="space-y-1">
          <Evidence testId="platform-card-attribution">{uiText('platformNoteAttribution')}</Evidence>
          <p className="text-muted-foreground text-xs">
            {uiText.rich('sentence_2e0d36cb26fc', {
              v0: PLATFORM_NAMES[card.compared_to.platform],
            })}
          </p>
        </div>
      );
    case 'google_delivery_issue':
      return <GoogleDeliveryEvidence card={card} />;
    case 'tiktok_delivery_issue':
      return <TikTokDeliveryEvidence card={card} />;
    case 'google_ad_drag':
      return (
        <Evidence testId="platform-card-ad-drag">
          {uiText.rich('sentence_e4bd43baef8c', {
            hasWinner: card.winner ? 'yes' : 'no',
            winner: card.winner?.label ?? '',
            cost: card.winner
              ? formatCurrency(card.winner.cost_per_result, card.currency, uiLocale)
              : '',
            ads: card.ads_remaining,
          })}
        </Evidence>
      );
    case 'google_ad_winner':
      return (
        <div className="space-y-2">
          <Evidence testId="platform-card-ad-winner">
            {uiText.rich('sentence_0f8407739522', {
              conversions: countLabel(card.winner.conversions, uiLocale),
              days: card.window_days,
              hasAssets: card.best_assets.length > 0 ? 'yes' : 'no',
              assets: card.best_assets.map((text) => `"${text}"`).join(', '),
            })}
          </Evidence>
          <OpenInGoogleAds href={GOOGLE_ADS_CAMPAIGNS_HREF} />
        </div>
      );
    case 'google_audience_saturation':
      return (
        <div className="space-y-2">
          <Evidence testId="platform-card-saturation">
            {uiText.rich('sentence_cc1993641aaa', {
              channel: codeLabel(card.channel_type, uiText),
              frequency: countLabel(card.frequency, uiLocale),
              cap: countLabel(card.frequency_cap, uiLocale),
              hasUsers: card.unique_users != null ? 'yes' : 'no',
              users: card.unique_users != null ? countLabel(card.unique_users, uiLocale) : '',
            })}
          </Evidence>
          <OpenInGoogleAds href={GOOGLE_ADS_CAMPAIGNS_HREF} />
        </div>
      );
    case 'google_pmax_assets':
      return (
        <div className="space-y-2">
          <ul className="space-y-1 text-sm" data-testid="platform-card-assets">
            {card.assets.map((asset) => (
              <li
                className="text-foreground"
                data-testid="platform-card-asset"
                key={`${asset.field_type}:${asset.label}`}
              >
                {pmaxAssetLine(asset, card.currency, uiText, uiLocale)}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs" data-testid="platform-card-assets-note">
            {uiText('platformNotePmaxAssets')}
          </p>
          <OpenInGoogleAds href={GOOGLE_ADS_CAMPAIGNS_HREF} />
        </div>
      );
  }
}

export function PlatformCardBody({
  card,
  onAddNegatives,
  action,
}: {
  card: PlatformCard;
  onAddNegatives?: AddNegatives;
  /** The engine's executable action for this card. Absent, the card shows no control of its
   *  own and the caller's button (if any) stands. */
  action?: PlatformCardAction;
}) {
const uiLocale=useLocale();
  const uiText = useTranslations('scale');
  const mark = markedPlatformOf(card);
  return (
    <div className="space-y-2" data-testid="platform-card" data-variant={card.variant}>
      <h3
        className={cn(
          typeScale.bodyLg,
          'font-semibold text-foreground',
          mark && 'flex items-start gap-1.5',
        )}
      >
        {mark ? (
          <span className="mt-1" data-platform={mark} data-testid="platform-card-mark">
            <PlatformIcon platform={mark} />
          </span>
        ) : null}
        {mark ? <span>{platformCardTitle(card, uiText, uiLocale)}</span> : platformCardTitle(card, uiText, uiLocale)}
      </h3>
      <VariantEvidence action={action} card={card} onAddNegatives={onAddNegatives} />
      {card.variant === 'google_negative_terms' ? null : <CardAction card={card} target={action} />}
    </div>
  );
}
