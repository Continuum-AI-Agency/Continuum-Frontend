'use client';

// The picker grouped Platform → Campaign → Ad set / Ad group / Asset group. The Meta tree is
// today's CampaignAdsetPicker, passed in unchanged; Google follows it under its own mark and
// colour, campaign by campaign, with the types the optimizer cannot act on disabled and their
// reason said. A brand with no Google account sees the Meta picker exactly as before.
//
// Google members are listed, not enrolled: enrolment writes Meta ad sets only today, so every
// Google row says so rather than offering a checkbox whose save would go nowhere.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PlatformIcon, platformColor } from '../sections/platforms/PlatformChip';
import { type AdPlatform, PLATFORM_NAMES } from '../sections/platforms/platformTabsModel';
import {
  buildGooglePickerGroup,
  CHILD_KIND_LABELS,
  type PickerCampaignNode,
  type PlatformPickerGroup,
} from './platformPickerModel';
import {
  type GooglePickerInventoryState,
  useGooglePickerInventory,
} from './useGooglePickerInventory';

const GOOGLE_ENROLMENT_PENDING =
  "Adding Google campaigns to a portfolio isn't available yet; they are listed so you can see what qualifies.";

export function PlatformGroupHeader({
  platform,
  account,
  hierarchy,
}: {
  platform: AdPlatform;
  account?: string | null;
  hierarchy: string;
}) {
  const color = platformColor(platform);
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2 border-l-2 pl-2', color.underline)}
      data-platform={platform}
      data-testid="picker-platform-header"
    >
      <PlatformIcon platform={platform} />
      <span className="font-semibold text-xs">{PLATFORM_NAMES[platform]}</span>
      {account ? <span className="text-muted-foreground text-xs">{account}</span> : null}
      <span className="text-muted-foreground text-xs">{hierarchy}</span>
    </div>
  );
}

function CampaignNode({ campaign }: { campaign: PickerCampaignNode }) {
  const childLabel = CHILD_KIND_LABELS[campaign.childKind];
  return (
    <li
      aria-disabled={!campaign.eligible}
      className={cn('py-1.5', !campaign.eligible && 'opacity-70')}
      data-eligible={campaign.eligible}
      data-testid="picker-google-campaign"
    >
      <p className="flex flex-wrap items-baseline gap-2 text-xs">
        <span className="font-medium">{campaign.name}</span>
        <span className="text-muted-foreground">{campaign.typeLabel}</span>
      </p>
      {campaign.reason ? (
        <p className="text-muted-foreground text-xs" data-testid="picker-disabled-reason">
          {campaign.reason}
        </p>
      ) : campaign.childKind === 'asset_group' ? (
        <p className="text-muted-foreground text-xs">
          {childLabel.many} move with the campaign budget.
        </p>
      ) : campaign.children.length > 0 ? (
        <ul className="mt-0.5 space-y-0.5 pl-3 text-muted-foreground text-xs">
          {campaign.children.map((child) => (
            <li data-child-kind={campaign.childKind} key={child.id}>
              {childLabel.one}: {child.name}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function PlatformGroupView({ group }: { group: PlatformPickerGroup }) {
  return (
    <section
      aria-label={`${PLATFORM_NAMES[group.platform]} campaigns`}
      className="space-y-1.5"
      data-testid="picker-platform-group"
    >
      <PlatformGroupHeader
        account={group.accountName ?? group.accountId}
        hierarchy="Campaign → Ad group / Asset group"
        platform={group.platform}
      />
      {group.refusal ? (
        <p className="text-warning text-xs" data-testid="picker-currency-refusal" role="status">
          {group.refusal}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">{GOOGLE_ENROLMENT_PENDING}</p>
      )}
      {group.refusal ? null : (
        <ul className="divide-y divide-border/60 pl-2">
          {group.campaigns.map((campaign) => (
            <CampaignNode campaign={campaign} key={campaign.id} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function MultiPlatformPickerView({
  google,
  portfolioCurrency,
  metaAccount,
  children,
}: {
  google: GooglePickerInventoryState;
  portfolioCurrency: string | null;
  metaAccount: string;
  children: ReactNode;
}) {
  if (google.status === 'none') return <>{children}</>;
  return (
    <div className="space-y-3" data-testid="multiplatform-picker">
      <div className="space-y-1.5">
        <PlatformGroupHeader account={metaAccount} hierarchy="Campaign → Ad set" platform="meta" />
        {children}
      </div>
      {google.status === 'loading' ? (
        <p className="text-muted-foreground text-xs">Reading Google Ads campaigns…</p>
      ) : google.status === 'error' ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="picker-google-error"
          role="status"
        >
          Google Ads campaigns could not be read: {google.message}
        </p>
      ) : (
        <PlatformGroupView
          group={buildGooglePickerGroup({
            account: google.inventory.account,
            portfolioCurrency,
            campaigns: google.inventory.campaigns,
            adGroups: google.inventory.adGroups,
          })}
        />
      )}
    </div>
  );
}

export function MultiPlatformPicker({
  brandId,
  portfolioCurrency,
  metaAccount,
  children,
}: {
  brandId: string;
  portfolioCurrency: string | null;
  metaAccount: string;
  children: ReactNode;
}) {
  const google = useGooglePickerInventory(brandId);
  return (
    <MultiPlatformPickerView
      google={google}
      metaAccount={metaAccount}
      portfolioCurrency={portfolioCurrency}
    >
      {children}
    </MultiPlatformPickerView>
  );
}
