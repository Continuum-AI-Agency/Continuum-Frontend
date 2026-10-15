'use client';

// The picker grouped Platform → Campaign → Ad set / Ad group / Asset group. The Meta tree is
// today's CampaignAdsetPicker, passed in unchanged; Google follows it under its own mark and
// colour, campaign by campaign, with the types the optimizer cannot act on disabled and their
// reason said. A brand with no Google account sees the Meta picker exactly as before.
//
// Google campaigns are ticked when the portfolio holds them (optimizer_list_portfolio_members)
// and save on their own, the way the platform limits do: adds through
// optimizer_add_portfolio_members, the wizard's path, and removals through
// optimizer_unenroll_entity. Until the members read answers, the group is a list only.

import { Loader2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  type GoogleMembersChange,
  type PortfolioMembersState,
  usePortfolioMembers,
  useSaveGoogleMembers,
} from './usePortfolioPlatformMembers';

const MEMBERS_UNREAD = "Which of these campaigns this portfolio holds can't be read yet.";
const MEMBERS_EXPLAINED =
  'Ticked campaigns are in this portfolio. A campaign another portfolio holds is refused when you save.';

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

function CampaignNode({
  campaign,
  choice,
}: {
  campaign: PickerCampaignNode;
  /** Present when the group can save: whether it is ticked, and how to change that. */
  choice?: { chosen: boolean; disabled: boolean; toggle: (on: boolean) => void };
}) {
  const childLabel = CHILD_KIND_LABELS[campaign.childKind];
  const id = `picker-google-${campaign.id}`;
  const title = (
    <p className="flex flex-wrap items-baseline gap-2 text-xs">
      <span className="font-medium">{campaign.name}</span>
      <span className="text-muted-foreground">{campaign.typeLabel}</span>
    </p>
  );
  return (
    <li
      aria-disabled={!campaign.eligible}
      className={cn('py-1.5', !campaign.eligible && 'opacity-70')}
      data-eligible={campaign.eligible}
      data-held={campaign.held}
      data-testid="picker-google-campaign"
    >
      {choice ? (
        <div className="flex items-start gap-2">
          <Checkbox
            aria-label={`Hold ${campaign.name} in this portfolio`}
            checked={choice.chosen}
            className="mt-0.5"
            disabled={choice.disabled}
            id={id}
            onCheckedChange={(on) => choice.toggle(on === true)}
          />
          <label htmlFor={id}>{title}</label>
        </div>
      ) : (
        title
      )}
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

export function PlatformGroupView({
  group,
  save,
}: {
  group: PlatformPickerGroup;
  /** Present once the members read answered: the group's boxes then save through it. */
  save?: (change: GoogleMembersChange) => Promise<unknown>;
}) {
  const held = group.campaigns.filter((campaign) => campaign.held).map((campaign) => campaign.id);
  const [chosen, setChosen] = useState<string[]>(held);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const add = group.campaigns.filter((c) => chosen.includes(c.id) && !c.held);
  const remove = held.filter((id) => !chosen.includes(id));
  const editable = save !== undefined && !group.refusal;

  async function handleSave() {
    if (!save) return;
    setSaving(true);
    setSaveError(null);
    try {
      await save({
        accountId: group.accountId,
        add: add.map((campaign) => ({ id: campaign.id, name: campaign.name })),
        remove,
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The campaigns could not be saved.');
    } finally {
      setSaving(false);
    }
  }

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
        <p className="text-muted-foreground text-xs">
          {editable ? MEMBERS_EXPLAINED : MEMBERS_UNREAD}
        </p>
      )}
      {group.refusal ? null : (
        <ul className="divide-y divide-border/60 pl-2">
          {group.campaigns.map((campaign) => (
            <CampaignNode
              campaign={campaign}
              choice={
                editable
                  ? {
                      chosen: chosen.includes(campaign.id),
                      // A held campaign of a type no longer offered can still be let go.
                      disabled: saving || (!campaign.eligible && !campaign.held),
                      toggle: (on) =>
                        setChosen((current) =>
                          on
                            ? [...current, campaign.id]
                            : current.filter((id) => id !== campaign.id),
                        ),
                    }
                  : undefined
              }
              key={campaign.id}
            />
          ))}
        </ul>
      )}
      {editable ? (
        <div className="flex flex-wrap items-center gap-2 pl-2">
          <Button
            disabled={(add.length === 0 && remove.length === 0) || saving}
            onClick={() => void handleSave()}
            size="sm"
            type="button"
            variant="outline"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Save Google campaigns
          </Button>
          {add.length > 0 || remove.length > 0 ? (
            <p className="text-muted-foreground text-xs tabular-nums">
              {[
                add.length > 0 ? `+${add.length} to add` : '',
                remove.length > 0 ? `−${remove.length} to remove` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
          {saveError ? (
            <p className="w-full text-destructive text-xs" role="alert">
              {saveError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function MultiPlatformPickerView({
  google,
  members = { status: 'unavailable' },
  save,
  portfolioCurrency,
  metaAccount,
  children,
}: {
  google: GooglePickerInventoryState;
  /** The portfolio's own non-Meta members; until read, the Google group is a list only. */
  members?: PortfolioMembersState;
  save?: (change: GoogleMembersChange) => Promise<unknown>;
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
            held:
              members.status === 'ready'
                ? members.members
                    .filter(
                      (member) =>
                        member.platform === 'google_ads' &&
                        member.level === 'campaign' &&
                        member.accountId === google.inventory.account.account_id.replace(/\D/g, ''),
                    )
                    .map((member) => ({
                      id: member.entityId,
                      name: member.name,
                      channelType: member.channelType,
                    }))
                : [],
          })}
          // Remount when the held set changes, so the boxes re-seed from what was saved.
          key={
            members.status === 'ready'
              ? members.members.map((m) => m.entityId).join(',')
              : members.status
          }
          save={members.status === 'ready' ? save : undefined}
        />
      )}
    </div>
  );
}

export function MultiPlatformPicker({
  brandId,
  portfolioId,
  portfolioCurrency,
  metaAccount,
  children,
}: {
  brandId: string;
  portfolioId: string;
  portfolioCurrency: string | null;
  metaAccount: string;
  children: ReactNode;
}) {
  const google = useGooglePickerInventory(brandId);
  const members = usePortfolioMembers(portfolioId);
  const saveMembers = useSaveGoogleMembers(portfolioId);
  return (
    <MultiPlatformPickerView
      google={google}
      members={members}
      save={(change) => saveMembers.mutateAsync(change)}
      metaAccount={metaAccount}
      portfolioCurrency={portfolioCurrency}
    >
      {children}
    </MultiPlatformPickerView>
  );
}
