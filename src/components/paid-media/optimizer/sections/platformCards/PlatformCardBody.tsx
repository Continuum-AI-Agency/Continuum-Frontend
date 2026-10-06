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
import {
  ATTRIBUTION_WINDOW_NOTE,
  bidCooldownNote,
  bidTargetLabel,
  CROSS_PLATFORM_APPROVAL_NOTE,
  countLabel,
  givingLegs,
  googleAdsCampaignHref,
  googleDeliveryHref,
  googleReasonInWords,
  legChangeLabel,
  markedPlatformOf,
  negativesLabel,
  PMAX_NOTE,
  percentLabel,
  platformCardTitle,
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

const AD_STRENGTH_LABEL = {
  POOR: 'Poor',
  AVERAGE: 'Average',
  GOOD: 'Good',
  EXCELLENT: 'Excellent',
  PENDING: 'Pending',
  UNSPECIFIED: 'Unrated',
} as const;

function Evidence({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <p className="text-muted-foreground text-sm" data-testid={testId}>
      {children}
    </p>
  );
}

function OpenInGoogleAds({ href }: { href: string }) {
  return (
    <a
      className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'gap-1.5')}
      data-testid="platform-card-open-google"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      Open in Google Ads
      <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
    </a>
  );
}

function GoogleDeliveryEvidence({ card }: { card: GoogleDeliveryCard }) {
  const budget =
    card.budget_per_day != null
      ? ` Budget ${formatCurrency(card.budget_per_day, card.currency)}/day.`
      : '';
  const disapproved =
    card.disapproved_ads > 0
      ? ` ${countLabel(card.disapproved_ads)} ${card.disapproved_ads === 1 ? 'ad' : 'ads'} disapproved.`
      : '';
  return (
    <div className="space-y-2">
      <Evidence testId="platform-card-delivery">
        Google says: {card.reasons.map(googleReasonInWords).join('; ')}.{disapproved}
        {budget}
      </Evidence>
      {card.account_wide ? (
        <p className="text-muted-foreground text-xs" data-testid="platform-card-account-wide">
          Every enabled campaign is dark, so this is one cause for the whole account, not a problem
          in {card.campaign_name} alone.
        </p>
      ) : null}
      <OpenInGoogleAds href={googleDeliveryHref(card.disapproved_ads)} />
    </div>
  );
}

function TikTokDeliveryEvidence({ card }: { card: TikTokDeliveryCard }) {
  if (card.rejected_ads.length === 0) {
    return (
      <Evidence testId="platform-card-delivery">
        TikTok gives no review reason for it. Check the ad group in TikTok Ads Manager.
      </Evidence>
    );
  }
  return (
    <div className="space-y-1">
      <ul className="space-y-1 text-sm" data-testid="platform-card-rejections">
        {card.rejected_ads.map((ad, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a rejection carries no id and never reorders
          <li className="text-foreground" data-testid="platform-card-rejection" key={index}>
            TikTok's review:{' '}
            {ad.reasons.length > 0
              ? ad.reasons.map((reason) => `"${reason}"`).join(', ')
              : 'no reason given'}
            .
            {ad.suggestion ? (
              <span className="text-muted-foreground"> Its suggestion: "{ad.suggestion}"</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">Fix it in TikTok Ads Manager.</p>
    </div>
  );
}

function NegativeTermsEvidence({
  card,
  onAddNegatives,
}: {
  card: NegativeTermsCard;
  onAddNegatives?: AddNegatives;
}) {
  const [reviewing, setReviewing] = useState(false);
  const every = card.terms.map((row) => row.term);
  return (
    <div className="space-y-2">
      <table className="w-full text-sm" data-testid="platform-card-terms">
        <thead>
          <tr className="text-left text-muted-foreground text-xs">
            <th className="font-normal">Search term</th>
            <th className="text-right font-normal">Spend</th>
            <th className="text-right font-normal">Clicks</th>
            <th className="text-right font-normal">Conversions</th>
          </tr>
        </thead>
        <tbody>
          {card.terms.map((row) => (
            <tr data-testid="platform-card-term" key={row.term}>
              <td className="text-foreground">"{row.term}"</td>
              <td className="text-right tabular-nums">
                {formatCurrency(row.spend, card.currency)}
              </td>
              <td className="text-right tabular-nums">{countLabel(row.clicks)}</td>
              <td className="text-right tabular-nums">{countLabel(row.conversions)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Evidence testId="platform-card-negatives">
        Adding them as {card.match_type === 'EXACT' ? 'exact' : 'phrase'} negatives stops about{' '}
        {formatCurrency(card.savings_per_day, card.currency)}/day.
      </Evidence>
      {onAddNegatives && reviewing ? (
        <NegativeTermsReview
          currency={card.currency}
          onCancel={() => setReviewing(false)}
          onConfirm={(terms) => {
            setReviewing(false);
            onAddNegatives(terms);
          }}
          terms={card.terms}
          windowDays={card.window_days}
        />
      ) : null}
      {onAddNegatives && !reviewing ? (
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="platform-card-add-negatives"
            onClick={() => onAddNegatives(every)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {negativesLabel(every.length)}
          </Button>
          <Button
            data-testid="platform-card-choose-terms"
            onClick={() => setReviewing(true)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Choose terms
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function VariantEvidence({
  card,
  onAddNegatives,
}: {
  card: PlatformCard;
  onAddNegatives?: AddNegatives;
}) {
  switch (card.variant) {
    case 'google_budget_limited':
      return (
        <Evidence testId="platform-card-budget">
          Campaign budget {formatCurrency(card.budget_per_day, card.currency)}/day,{' '}
          {percentLabel(card.budget_lost_impression_share)} of impressions lost to budget.{' '}
          {card.proposed_budget_per_day != null
            ? `Proposed: ${formatCurrency(card.proposed_budget_per_day, card.currency)}/day.`
            : 'No increase proposed.'}
        </Evidence>
      );
    case 'google_pmax_asset_group':
      return (
        <div className="space-y-1">
          <ul className="space-y-0.5 text-sm" data-testid="platform-card-asset-groups">
            {card.asset_groups.map((group) => (
              <li className="text-foreground" key={group.name}>
                <span className="font-medium">{group.name}</span>
                {group.ad_strength ? (
                  <span className="text-muted-foreground">
                    {' '}
                    · ad strength {AD_STRENGTH_LABEL[group.ad_strength]}
                  </span>
                ) : null}
                <span className="text-muted-foreground">
                  {' '}
                  ·{' '}
                  {group.missing.length > 0
                    ? `missing ${group.missing.join(', ')}`
                    : 'nothing missing'}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">{PMAX_NOTE}</p>
        </div>
      );
    case 'google_video_readonly':
      return (
        <div className="space-y-2">
          <Evidence testId="platform-card-readonly">{VIDEO_READONLY_NOTE}</Evidence>
          <OpenInGoogleAds href={googleAdsCampaignHref(card.campaign_id)} />
        </div>
      );
    case 'tiktok_creative_fatigue':
      return (
        <Evidence testId="platform-card-fatigue">
          Ad group "{card.ad_group_name}": the same people keep seeing the same video.
          {card.replacement
            ? ` "${card.replacement.name}" runs at ${percentLabel(card.replacement.ctr)} CTR.`
            : ''}
        </Evidence>
      );
    case 'tiktok_scheduled_decrease':
      return (
        <Evidence testId="platform-card-scheduled">
          TikTok already spent {formatCurrency(card.spent_today, card.currency)} today, so it
          refuses a budget under {formatCurrency(card.floor, card.currency)} (105% of today's spend)
          until midnight. The decrease lands at {scheduledLabel(card.effective_at, card.timezone)}.
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
                  {formatCurrency(leg.from_per_day, card.currency)} →{' '}
                  {formatCurrency(leg.to_per_day, card.currency)}/day
                </span>
                <span className="font-medium tabular-nums" data-testid="platform-card-leg-change">
                  {legChangeLabel(leg)}
                </span>
                {leg.scheduled_at ? (
                  <span className="text-muted-foreground text-xs">
                    scheduled for {scheduledLabel(leg.scheduled_at, null)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs" data-testid="platform-card-approval-note">
            {CROSS_PLATFORM_APPROVAL_NOTE}
          </p>
        </div>
      );
    case 'google_negative_terms':
      return <NegativeTermsEvidence card={card} onAddNegatives={onAddNegatives} />;
    case 'google_promote_term':
      return (
        <Evidence testId="platform-card-promote">
          {card.matched_keyword
            ? `It comes in through "${card.matched_keyword}". `
            : 'It comes in through a broader keyword. '}
          As an exact keyword in "{card.ad_group_name}" it gets its own bid and its own ad.
        </Evidence>
      );
    case 'google_bid_target': {
      const label = (value: number) => bidTargetLabel(value, card.strategy, card.currency);
      return (
        <div className="space-y-1">
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="platform-card-bid">
            <div className="flex gap-1">
              <dt className="text-muted-foreground">Current target</dt>
              <dd className="font-medium tabular-nums">{label(card.current_target)}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted-foreground">Actual, {card.window_days} days</dt>
              <dd className="font-medium tabular-nums">
                {card.actual != null ? label(card.actual) : 'not enough data'}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted-foreground">Proposed</dt>
              <dd className="font-medium tabular-nums">{label(card.proposed_target)}</dd>
            </div>
          </dl>
          <p className="text-muted-foreground text-xs" data-testid="platform-card-cooldown">
            {bidCooldownNote(card.days_since_last_change)}
          </p>
        </div>
      );
    }
    case 'google_low_quality_keyword':
      return (
        <Evidence testId="platform-card-quality">
          {card.match_type.charAt(0) + card.match_type.slice(1).toLowerCase()} match in ad group "
          {card.ad_group_name}" · Quality Score {card.quality_score}/10. A keyword this low pays
          more per click and shows less often.
        </Evidence>
      );
    case 'tiktok_hook_retention':
      return (
        <Evidence testId="platform-card-hook">
          2-second hold {percentLabel(card.hold_2s)} against {percentLabel(card.portfolio_hold_2s)}{' '}
          for the portfolio, over {countLabel(card.impressions)} impressions in {card.days_live}{' '}
          {card.days_live === 1 ? 'day' : 'days'} in "{card.ad_group_name}". The opening loses
          people before the message lands.
        </Evidence>
      );
    case 'tiktok_spark_candidate':
      return (
        <div className="space-y-1">
          <Evidence testId="platform-card-spark">
            "{card.post_caption}" · {countLabel(card.views)} views ·{' '}
            {percentLabel(card.engagement_rate)} engagement
            {card.account_percentile != null
              ? ` · better than ${Math.round(card.account_percentile)}% of the account's posts`
              : ''}
            {card.target_ad_group_name ? ` · would run in "${card.target_ad_group_name}"` : ''}
          </Evidence>
          <p className="text-muted-foreground text-xs">{SPARK_NOTE}</p>
        </div>
      );
    case 'tiktok_budget_below_learning':
      return (
        <Evidence testId="platform-card-learning">
          TikTok documents a daily budget of {card.required_multiple}× the cost per result for this
          goal
          {card.cost_per_result != null
            ? `; at ${formatCurrency(card.cost_per_result, card.currency)} per result that is ${formatCurrency(card.required_budget_per_day, card.currency)}/day`
            : `: ${formatCurrency(card.required_budget_per_day, card.currency)}/day`}
          . {countLabel(card.results_so_far)} {card.results_so_far === 1 ? 'result' : 'results'} so
          far.
        </Evidence>
      );
    case 'tiktok_attribution_window':
      return (
        <div className="space-y-1">
          <Evidence testId="platform-card-attribution">{ATTRIBUTION_WINDOW_NOTE}</Evidence>
          <p className="text-muted-foreground text-xs">
            Match the windows in TikTok Ads Manager or in{' '}
            {PLATFORM_NAMES[card.compared_to.platform]} and the comparison comes back.
          </p>
        </div>
      );
    case 'google_delivery_issue':
      return <GoogleDeliveryEvidence card={card} />;
    case 'tiktok_delivery_issue':
      return <TikTokDeliveryEvidence card={card} />;
  }
}

export function PlatformCardBody({
  card,
  onAddNegatives,
}: {
  card: PlatformCard;
  onAddNegatives?: AddNegatives;
}) {
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
        {mark ? <span>{platformCardTitle(card)}</span> : platformCardTitle(card)}
      </h3>
      <VariantEvidence card={card} onAddNegatives={onAddNegatives} />
    </div>
  );
}
