'use client';
import { useLocale, useTranslations } from 'next-intl';

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
import { Badge } from '@/components/ui/badge';
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
  BUDGET_LEVER,
  channelTypeLabel,
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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const level: PortfolioLevel = 'adset';
  const sections = useMemo(
    () => buildCampaignSections(entities, level, objective, claims, uiText),
    [entities, objective, claims, uiText],
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
          <h3 className={questionHeading}>{uiText('what_should_it_manage_994bbf8')}</h3>
          <p className="text-xs text-muted-foreground">
            {uiText('this_account_has_no_meta_ad_sets_pick_the_cam_ee589bd')}
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
          <h3 className={questionHeading}>{uiText('what_should_it_manage_994bbf8')}</h3>
          <p className="text-xs text-muted-foreground">
            {assetMode === 'adset'
              ? uiText('pick_ad_sets_one_by_one_by_name_or_id_their_b_63e4882')
              : uiText('pick_whole_campaigns_every_eligible_ad_set_in_d0b302c')}
          </p>
        </div>
        <ToggleGroup
          aria-label={uiText('pick_by_0277697')}
          onValueChange={(next) => {
            if (next) onAssetModeChange(next as AssetMode);
          }}
          size="sm"
          type="single"
          value={assetMode}
          variant="outline"
        >
          <ToggleGroupItem className="h-7 px-2.5 text-xs" value="adset">
            {uiText('by_ad_set_6669577')}
          </ToggleGroupItem>
          <ToggleGroupItem className="h-7 px-2.5 text-xs" value="campaign">
            {uiText('by_campaign_37ddfe7')}
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
              {isLoading
                ? uiText('loading_campaigns_0427267')
                : uiText('no_campaigns_with_eligible_ad_sets_here_yet_621bbf5')}
            </li>
          ) : null}
          {sections.map((section) => {
            const eligible = sectionEligibleIds(section.adsets);
            const checked = eligible.length > 0 && eligible.every((id) => selected.has(id));
            const id = `wizard-campaign-${section.campaignId}`;
            return (
              <li className="flex items-center gap-3 py-2.5" key={section.campaignId}>
                <Checkbox
                  aria-label={uiText('template_99c1b26f8c66', { v0: section.campaignName })}
                  checked={checked}
                  disabled={disabled || eligible.length === 0}
                  id={id}
                  onCheckedChange={() => toggleCampaign(section.campaignId, eligible)}
                />
                <Label className="min-w-0 flex-1 cursor-pointer font-normal" htmlFor={id}>
                  <span className="block truncate font-medium text-xs">{section.campaignName}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {uiText.rich('sentence_5ff957bd78f3', {
                      eligible: section.eligibleCount,
                      total: section.totalCount,
                      budget: formatCurrency(section.totalBudget, currency, uiLocale),
                      hasCpa: section.cpa != null ? 'yes' : 'no',
                      cpa: section.cpa != null ? formatCpa(section.cpa, currency, uiLocale) : '',
                      mismatch: section.mismatchCount,
                    })}
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
          {uiText.rich('sentence_519a1e733035', { count: warnings.inactiveCount })}
        </p>
      ) : null}
      {warnings.blockedCount > 0 ? (
        <p className="text-xs text-destructive" role="alert">
          {uiText.rich('sentence_5e3a567ceb00', { count: warnings.blockedCount })}
        </p>
      ) : null}
      {warnings.moves.length > 0 ? (
        <p className="text-xs text-muted-foreground" role="status">
          {uiText.rich('sentence_943f23e59789', {
            moves: warnings.moves
              .map((move) =>
                uiText('portfolio_move_count', {
                  count: move.adsetIds.length,
                  name: move.portfolioName,
                }),
              )
              .join(' · '),
          })}
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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
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
      aria-label={uiText('members_on_other_platforms_516899e')}
      className="space-y-3 border-border/60 border-t pt-4"
      data-testid="wizard-other-platform-members"
    >
      <p className="text-xs text-muted-foreground">
        {scratch
          ? uiText('campaigns_on_the_brand_s_other_platforms_tick_f64f2a4')
          : uiText('template_70d763bfd1f1', { v0: names, v1: names })}{' '}
        {BUDGET_LEVER}
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
              const blocked = memberBlockReason(member, draft, currency, uiText);
              const channel = channelTypeLabel(member.channel_type);
              return (
                <li
                  className="flex items-center gap-2 py-1.5"
                  data-blocked={blocked ? 'true' : undefined}
                  data-platform={member.platform}
                  data-testid="wizard-other-platform-member"
                  key={key}
                >
                  <Checkbox
                    aria-label={uiText('template_89f23be0a137', {
                      v0: PLATFORM_NAMES[member.platform],
                      v1: label,
                    })}
                    checked={selected.has(key)}
                    disabled={disabled || blocked != null}
                    id={id}
                    onCheckedChange={() => toggle(key)}
                  />
                  <Label className="min-w-0 flex-1 cursor-pointer font-normal" htmlFor={id}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-xs">{label}</span>
                      {channel ? (
                        <Badge data-testid="wizard-member-channel" variant="muted">
                          {channel}
                        </Badge>
                      ) : null}
                    </span>
                    {member.daily_budget != null || blocked ? (
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {member.daily_budget != null
                          ? uiText('template_33143bb65c85', {
                              v0: formatCurrency(
                                member.daily_budget,
                                member.currency ?? null,
                                uiLocale,
                              ),
                            })
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
              ? uiText('template_3f2bd320cd41', { v0: PLATFORM_NAMES[platform] })
              : uiText('template_33bc5efd780b', { v0: PLATFORM_NAMES[platform] })}
          </span>
          {connectedPlatforms.includes(platform) ? null : (
            <PlatformConnectLink platform={platform} />
          )}
        </div>
      ))}
    </section>
  );
}
