'use client';

// Step 2 — what the portfolio manages. By ad set: the campaign-grouped picker (search by
// name or ID, eligibility, who already holds each one). By campaign: one row per campaign,
// ticking it takes every eligible ad set in it — and the enroll goes by campaign id, so the
// server picks the ad sets rather than the browser guessing.

import type { OptimizationObjective, PortfolioLevel } from '@continuum/contracts';
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
import type { AssetMode } from './wizardModel';

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sm tracking-tight">What should it manage?</h3>
          <p className="text-2xs text-muted-foreground">
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
          <ToggleGroupItem className="h-7 px-2.5 text-2xs" value="adset">
            By ad set
          </ToggleGroupItem>
          <ToggleGroupItem className="h-7 px-2.5 text-2xs" value="campaign">
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
        <ul className="divide-y divide-border/60 rounded-lg border border-border/70 bg-card">
          {sections.length === 0 ? (
            <li className="px-3 py-3 text-2xs text-muted-foreground">
              {isLoading ? 'Loading campaigns…' : 'No campaigns with eligible ad sets here yet.'}
            </li>
          ) : null}
          {sections.map((section) => {
            const eligible = sectionEligibleIds(section.adsets);
            const checked = eligible.length > 0 && eligible.every((id) => selected.has(id));
            const id = `wizard-campaign-${section.campaignId}`;
            return (
              <li className="flex items-center gap-3 px-3 py-2" key={section.campaignId}>
                <Checkbox
                  aria-label={`Select campaign ${section.campaignName}`}
                  checked={checked}
                  disabled={disabled || eligible.length === 0}
                  id={id}
                  onCheckedChange={() => toggleCampaign(section.campaignId, eligible)}
                />
                <Label className="min-w-0 flex-1 cursor-pointer font-normal" htmlFor={id}>
                  <span className="block truncate font-medium text-xs">{section.campaignName}</span>
                  <span className="block text-2xs text-muted-foreground tabular-nums">
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

      {warnings.inactiveCount > 0 ? (
        <p className="text-2xs text-warning">
          {warnings.inactiveCount} selected inactive{' '}
          {warnings.inactiveCount === 1 ? 'ad set is' : 'ad sets are'} held until Meta reports them
          active.
        </p>
      ) : null}
      {warnings.blockedCount > 0 ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-2xs text-destructive"
          role="alert"
        >
          {warnings.blockedCount} selected{' '}
          {warnings.blockedCount === 1 ? 'ad set is' : 'ad sets are'} held by another brand&rsquo;s
          portfolio you cannot edit. Deselect {warnings.blockedCount === 1 ? 'it' : 'them'} to
          continue.
        </p>
      ) : null}
      {warnings.moves.length > 0 ? (
        <p className="text-2xs text-muted-foreground" role="status">
          {warnings.moves
            .map((move) => `${move.adsetIds.length} from ${move.portfolioName}`)
            .join(' · ')}{' '}
          will move into this portfolio.
        </p>
      ) : null}
    </div>
  );
}
