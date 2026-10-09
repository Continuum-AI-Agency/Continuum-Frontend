'use client';

// Step 2 — what the portfolio manages. By ad set: the campaign-grouped picker (search by
// name or ID, eligibility, who already holds each one). By campaign: one row per campaign,
// ticking it takes every eligible ad set in it — and the enroll goes by campaign id, so the
// server picks the ad sets rather than the browser guessing.
//
// A cross-platform suggestion also proposes campaigns on the brand's other platforms. They
// arrive ticked, under their platform's header, and can be unticked one by one; Create enrolls
// the ticked ones beside the Meta ad sets — or alone, when every Meta ad set is unticked. The
// section says they are recommend-only, because nothing applies outside Meta.
//
// From scratch, the same section lists every campaign the brand's other accounts could put in
// a portfolio, unticked, with TikTok's Connect when it has no account. A portfolio holds one
// currency: once something is ticked, a campaign billing in another currency is disabled and
// says so. On a non-Meta account there are no ad sets to pick, so the Meta picker steps aside.

import type {
  OptimizationObjective,
  PlatformId,
  PortfolioLevel,
  SuggestionMember,
} from '@continuum/contracts';
import { useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatCpa, formatCurrency } from '../../format';
import { CampaignAdsetPicker } from '../../picker/CampaignAdsetPicker';
import {
  type AdsetClaimMap,
  buildCampaignSections,
  type PortfolioPickerSource,
  sectionEligibleIds,
} from '../../picker/campaignGroups';
import { PlatformGroupHeader } from '../../picker/MultiPlatformPicker';
import { PlatformConnectLink } from '../platforms/PlatformConnectLink';
import { PLATFORM_NAMES } from '../platforms/platformTabsModel';
import { questionHeading } from './OptionRow';
import {
  type AssetMode,
  memberBlockReason,
  memberKey,
  membersByAccount,
  type WizardDraft,
} from './wizardModel';

type InventoryFreshness = React.ComponentProps<typeof CampaignAdsetPicker>['inventoryFreshness'];

type StepAssetsProps = {
  assetMode: AssetMode;
  onAssetModeChange: (mode: AssetMode) => void;
  entities: PortfolioPickerSource[];
  selectedIds: string[];
  onChangeSelection: (ids: string[]) => void;
  campaignIds: string[];
  onChangeCampaigns: (ids: string[]) => void;
  brandId: string;
  accountId: string;
  currency: string | null;
  objective: OptimizationObjective;
  claims: AdsetClaimMap;
  isLoading: boolean;
  isError: boolean;
  inventoryFreshness?: InventoryFreshness;
  disabled?: boolean;
  /** Other-platform members a suggestion proposed, or — from scratch — every eligible one. */
  proposedMembers?: SuggestionMember[];
  memberKeys?: string[];
  onChangeMembers?: (keys: string[]) => void;
  /** The selection so far, for the one-currency rule. */
  draft?: Pick<WizardDraft, 'adsetIds' | 'campaignIds' | 'proposedMembers' | 'memberKeys'>;
  source?: WizardDraft['source'];
  /** False on a non-Meta account: no ad sets to pick. */
  metaAvailable?: boolean;
  /** Platforms with an account granted to the brand (even one with no eligible campaign). */
  connectedPlatforms?: PlatformId[];
  /** Whether the from-scratch list was returned at all (an older suggest edge omits it). */
  candidatesKnown?: boolean;
  warnings: {
    inactiveCount: number;
    blockedCount: number;
    moves: { portfolioName: string; adsetIds: string[] }[];
  };
};

export function StepAssets({
  assetMode,
  onAssetModeChange,
  entities,
  selectedIds,
  onChangeSelection,
  campaignIds,
  onChangeCampaigns,
  brandId,
  accountId,
  currency,
  objective,
  claims,
  isLoading,
  isError,
  inventoryFreshness,
  disabled,
  proposedMembers = [],
  memberKeys = [],
  onChangeMembers,
  draft,
  source = null,
  metaAvailable = true,
  connectedPlatforms = [],
  candidatesKnown = false,
  warnings,
}: StepAssetsProps) {
  const level: PortfolioLevel = 'adset';
  const sections = useMemo(
    () => buildCampaignSections(entities, level, objective, claims),
    [entities, objective, claims],
  );
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleCampaign(campaignId: string, eligible: string[]) {
    const on = campaignIds.includes(campaignId);
    const next = new Set(selectedIds);
    for (const id of eligible) {
      if (on) next.delete(id);
      else next.add(id);
    }
    onChangeSelection([...next]);
    onChangeCampaigns(
      on ? campaignIds.filter((id) => id !== campaignId) : [...campaignIds, campaignId],
    );
  }

  const scratch = source === 'scratch';
  const members = (
    <OtherPlatformMembers
      candidatesKnown={candidatesKnown}
      connectedPlatforms={connectedPlatforms}
      currency={currency}
      disabled={disabled}
      draft={
        draft ?? {
          adsetIds: selectedIds,
          campaignIds,
          proposedMembers,
          memberKeys,
        }
      }
      members={proposedMembers}
      onChange={(keys) => onChangeMembers?.(keys)}
      scratch={scratch}
      selectedKeys={memberKeys}
    />
  );

  if (!metaAvailable) {
    return (
      <div className="space-y-3">
        <div>
          <h3 className={questionHeading}>What should it manage?</h3>
          <p className="text-xs text-muted-foreground">
            This account has no Meta ad sets. Pick the campaigns the portfolio should hold.
          </p>
        </div>
        {members}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className={questionHeading}>What should it manage?</h3>
          <p className="text-xs text-muted-foreground">
            {assetMode === 'adset'
              ? 'Pick ad sets one by one, by name or ID. Their budgets move as one pool.'
              : 'Pick whole campaigns. Every eligible ad set in each one joins the pool.'}
          </p>
        </div>
        <ToggleGroup
          aria-label="Pick by"
          onValueChange={(next) => {
            if (next) onAssetModeChange(next as AssetMode);
          }}
          size="sm"
          type="single"
          value={assetMode}
          variant="outline"
        >
          <ToggleGroupItem className="h-7 px-2.5 text-xs" value="adset">
            By ad set
          </ToggleGroupItem>
          <ToggleGroupItem className="h-7 px-2.5 text-xs" value="campaign">
            By campaign
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {assetMode === 'adset' ? (
        <CampaignAdsetPicker
          accountId={accountId}
          brandId={brandId}
          claims={claims}
          currency={currency}
          disabled={disabled}
          entities={entities}
          heightClassName="h-[24rem]"
          inventoryFreshness={inventoryFreshness}
          isError={isError}
          isLoading={isLoading}
          mode={level}
          objective={objective}
          onChange={(ids) => {
            onChangeSelection(ids);
            // A hand-edited selection is no longer "whole campaigns".
            if (campaignIds.length > 0) onChangeCampaigns([]);
          }}
          selectedAdsetIds={selectedIds}
        />
      ) : (
        <ul className="divide-y divide-border/60 border-border/60 border-y">
          {sections.length === 0 ? (
            <li className="py-3 text-xs text-muted-foreground">
              {isLoading ? 'Loading campaigns…' : 'No campaigns with eligible ad sets here yet.'}
            </li>
          ) : null}
          {sections.map((section) => {
            const eligible = sectionEligibleIds(section.adsets);
            const checked = eligible.length > 0 && eligible.every((id) => selected.has(id));
            const id = `wizard-campaign-${section.campaignId}`;
            return (
              <li className="flex items-center gap-3 py-2.5" key={section.campaignId}>
                <Checkbox
                  aria-label={`Select campaign ${section.campaignName}`}
                  checked={checked}
                  disabled={disabled || eligible.length === 0}
                  id={id}
                  onCheckedChange={() => toggleCampaign(section.campaignId, eligible)}
                />
                <Label className="min-w-0 flex-1 cursor-pointer font-normal" htmlFor={id}>
                  <span className="block truncate font-medium text-xs">{section.campaignName}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {section.eligibleCount} of {section.totalCount} ad sets eligible ·{' '}
                    {formatCurrency(section.totalBudget, currency)}/day
                    {section.cpa != null ? ` · ${formatCpa(section.cpa, currency)}` : ''}
                    {section.mismatchCount > 0
                      ? ` · ${section.mismatchCount} buy a different result`
                      : ''}
                  </span>
                </Label>
              </li>
            );
          })}
        </ul>
      )}

      {proposedMembers.length > 0 || scratch ? members : null}

      {warnings.inactiveCount > 0 ? (
        <p className="text-xs text-warning">
          {warnings.inactiveCount} selected inactive{' '}
          {warnings.inactiveCount === 1 ? 'ad set is' : 'ad sets are'} held until Meta reports them
          active.
        </p>
      ) : null}
      {warnings.blockedCount > 0 ? (
        <p className="text-xs text-destructive" role="alert">
          {warnings.blockedCount} selected{' '}
          {warnings.blockedCount === 1 ? 'ad set is' : 'ad sets are'} held by another brand&rsquo;s
          portfolio you cannot edit. Deselect {warnings.blockedCount === 1 ? 'it' : 'them'} to
          continue.
        </p>
      ) : null}
      {warnings.moves.length > 0 ? (
        <p className="text-xs text-muted-foreground" role="status">
          {warnings.moves
            .map((move) => `${move.adsetIds.length} from ${move.portfolioName}`)
            .join(' · ')}{' '}
          will move into this portfolio.
        </p>
      ) : null}
    </div>
  );
}

/** Platforms a from-scratch list offers even with nothing to show: each says why. */
const SCRATCH_PLATFORMS: PlatformId[] = ['google_ads', 'tiktok_ads'];

function OtherPlatformMembers({
  members,
  selectedKeys,
  onChange,
  disabled,
  draft,
  currency,
  scratch,
  connectedPlatforms,
  candidatesKnown,
}: {
  members: SuggestionMember[];
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
  draft: Pick<WizardDraft, 'adsetIds' | 'campaignIds' | 'proposedMembers' | 'memberKeys'>;
  currency: string | null;
  scratch: boolean;
  connectedPlatforms: PlatformId[];
  candidatesKnown: boolean;
}) {
  const selected = new Set(selectedKeys);
  const groups = membersByAccount(members);
  const names = [...new Set(groups.map((group) => PLATFORM_NAMES[group.platform]))].join(' and ');
  // A connected platform with nothing listed says why only when the list was actually read.
  const missing = scratch
    ? SCRATCH_PLATFORMS.filter(
        (platform) =>
          !groups.some((group) => group.platform === platform) &&
          (candidatesKnown || !connectedPlatforms.includes(platform)),
      )
    : [];

  function toggle(key: string) {
    onChange(selected.has(key) ? selectedKeys.filter((k) => k !== key) : [...selectedKeys, key]);
  }

  return (
    <section
      aria-label="Members on other platforms"
      className="space-y-3 border-border/60 border-t pt-4"
      data-testid="wizard-other-platform-members"
    >
      <p className="text-xs text-muted-foreground">
        {scratch
          ? 'Campaigns on the brand\u2019s other platforms. Tick any of them, with or without Meta ad sets: one portfolio holds one currency. The optimizer recommends moves on them and you make the change on that platform: it only applies changes on Meta.'
          : `The suggestion also proposed these ${names} campaigns, which buy the same result in the same currency. Create adds the ticked ones to the portfolio. The optimizer recommends moves on them and you make the change in ${names}: it only applies changes on Meta.`}
      </p>
      {groups.map((group) => (
        <div className="space-y-1" key={`${group.platform}:${group.accountId}`}>
          <PlatformGroupHeader
            account={group.accountId}
            hierarchy={scratch ? 'Campaigns' : 'Campaigns proposed'}
            platform={group.platform}
          />
          <ul className="divide-y divide-border/60">
            {group.members.map((member) => {
              const key = memberKey(member);
              const id = `wizard-member-${key}`;
              const label = member.name ?? member.entity_id;
              const blocked = memberBlockReason(member, draft, currency);
              return (
                <li
                  className="flex items-center gap-2 py-1.5"
                  data-blocked={blocked ? 'true' : undefined}
                  data-platform={member.platform}
                  data-testid="wizard-other-platform-member"
                  key={key}
                >
                  <Checkbox
                    aria-label={`Select ${PLATFORM_NAMES[member.platform]} campaign ${label}`}
                    checked={selected.has(key)}
                    disabled={disabled || blocked != null}
                    id={id}
                    onCheckedChange={() => toggle(key)}
                  />
                  <Label className="min-w-0 flex-1 cursor-pointer font-normal" htmlFor={id}>
                    <span className="block truncate text-xs">{label}</span>
                    {member.daily_budget != null || blocked ? (
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {member.daily_budget != null
                          ? `${formatCurrency(member.daily_budget, member.currency ?? null)}/day`
                          : ''}
                        {member.daily_budget != null && blocked ? ' · ' : ''}
                        {blocked}
                      </span>
                    ) : null}
                  </Label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {missing.map((platform) => (
        <div
          className="flex flex-wrap items-center justify-between gap-2 py-1"
          data-platform={platform}
          data-testid="wizard-platform-empty"
          key={platform}
        >
          <span className="text-xs text-muted-foreground">
            {connectedPlatforms.includes(platform)
              ? `No ${PLATFORM_NAMES[platform]} campaign can join a portfolio yet: it needs one that is enabled, with a daily budget.`
              : `${PLATFORM_NAMES[platform]} isn\u2019t connected to this brand.`}
          </span>
          {connectedPlatforms.includes(platform) ? null : (
            <PlatformConnectLink platform={platform} />
          )}
        </div>
      ))}
    </section>
  );
}
