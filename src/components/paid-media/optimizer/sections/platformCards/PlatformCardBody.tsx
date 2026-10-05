// The middle of a platform-specific recommendation card: its title and the evidence line that
// only Google or TikTok has. The chrome around it — chips, impact, the action and "Ask Jaina" —
// stays in AccountRead, so a Google card and a Meta card differ only where their platforms do.

import type { PlatformCard } from '@continuum/contracts';
import { ExternalLinkIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '../../format';
import * as typeScale from '../../typeScale';
import { PlatformChip } from '../platforms/PlatformChip';
import {
  CROSS_PLATFORM_APPROVAL_NOTE,
  givingLegs,
  googleAdsCampaignHref,
  legChangeLabel,
  PMAX_NOTE,
  percentLabel,
  platformCardTitle,
  scheduledLabel,
  takingLegs,
  VIDEO_READONLY_NOTE,
} from './platformCardModel';

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

function VariantEvidence({ card }: { card: PlatformCard }) {
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
          <a
            className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'gap-1.5')}
            data-testid="platform-card-open-google"
            href={googleAdsCampaignHref(card.campaign_id)}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open in Google Ads
            <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
          </a>
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
  }
}

export function PlatformCardBody({ card }: { card: PlatformCard }) {
  return (
    <div className="space-y-2" data-testid="platform-card" data-variant={card.variant}>
      <h3 className={cn(typeScale.bodyLg, 'font-semibold text-foreground')}>
        {platformCardTitle(card)}
      </h3>
      <VariantEvidence card={card} />
    </div>
  );
}
