'use client';
import { useTranslations } from 'next-intl';

import { useUiErrorMessage } from '@/i18n/errors';

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
import { type ReactNode, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { PlatformIcon, platformColor } from '../sections/platforms/PlatformChip';
import { type AdPlatform, PLATFORM_NAMES } from '../sections/platforms/platformTabsModel';
import {
  buildGooglePickerGroup,
  type PickerCampaignNode,
  type PickerMember,
  type PlatformPickerGroup,
  pickerChildKindLabels,
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
  choice?: {
    chosen: boolean;
    disabled: boolean;
    toggle: (on: boolean) => void;
  };
}) {
  const uiText = useTranslations('scale');
  const childLabel = pickerChildKindLabels(campaign.childKind, uiText);
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
            aria-label={uiText('template_6b56b2226b9e', { v0: campaign.name })}
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
          {uiText.rich('sentence_e602a7208d54', { v0: childLabel.many })}
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
  const uiText = useTranslations('scale');
  const formatUiError = useUiErrorMessage();
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
      setSaveError(formatUiError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label={uiText('template_92fb0970aa45', {
        v0: PLATFORM_NAMES[group.platform],
      })}
      className="space-y-1.5"
      data-testid="picker-platform-group"
    >
      <PlatformGroupHeader
        account={group.accountName ?? group.accountId}
        hierarchy={uiText('pickerHierarchyGoogle')}
        platform={group.platform}
      />
      {group.refusal ? (
        <p className="text-warning text-xs" data-testid="picker-currency-refusal" role="status">
          {group.refusal}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          {uiText(editable ? 'pickerMembersExplained' : 'pickerMembersUnread')}
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
            {uiText.rich('sentence_5080fd437121', {
              v0: () => (saving ? <Loader2 className="size-3.5 animate-spin" /> : null),
            })}
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
  const uiText = useTranslations('scale');
  // Every campaign shown as held during this visit, so one just let go stays on the list.
  const known = useRef(new Map<string, PickerMember>());
  if (google.status === 'none') return <>{children}</>;
  const held: PickerMember[] =
    google.status === 'ready' && members.status === 'ready'
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
      : [];
  for (const member of held) known.current.set(member.id, member);
  return (
    <div className="space-y-3" data-testid="multiplatform-picker">
      <div className="space-y-1.5">
        <PlatformGroupHeader
          account={metaAccount}
          hierarchy={uiText('pickerHierarchyMeta')}
          platform="meta"
        />
        {children}
      </div>
      {google.status === 'loading' ? (
        <p className="text-muted-foreground text-xs">
          {uiText('reading_google_ads_campaigns_c253e71')}
        </p>
      ) : google.status === 'error' ? (
        <p
          className="text-muted-foreground text-xs"
          data-testid="picker-google-error"
          role="status"
        >
          {uiText.rich('sentence_4e7300aeda6e', { v0: google.message })}
        </p>
      ) : (
        <PlatformGroupView
          group={buildGooglePickerGroup(
            {
              account: google.inventory.account,
              portfolioCurrency,
              campaigns: google.inventory.campaigns,
              adGroups: google.inventory.adGroups,
              held,
              known: [...known.current.values()],
            },
            uiText,
          )}
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
