'use client';

// Portfolio setup: the account context (which account, its tracking gaps, whether it can be
// scored at all) around the four-step wizard. Shared by the empty-state OptimizerOnboarding
// and the "New portfolio" page state.
//
// Data paths (identical to what the MCP tools / optimizer ingest use — nothing lies to the
// user): account discovery via plugin_mcp.list_brand_ad_accounts, suggestions via the
// optimizer-suggest edge fn, snapshots via paid-media-metrics. Create and enroll live in the
// wizard, in one pipeline for both the suggestion and the from-scratch path.

import type { AdSetSnapshot, OptimizationObjective, PortfolioLevel } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { TriangleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PAID_SETUP_CONNECT_HREF } from '../../paid-setup-diagnostics';
import { humanize } from '../format';
import { buildCboCampaignSections } from '../picker/campaignGroups';
import { buildProjectedConversions } from '../preview/projectedConversion';
import {
  useOptimizerAccountSnapshots,
  useOptimizerAdAccounts,
  useOptimizerSuggestions,
} from '../useOptimizerData';
import { CboCampaigns } from './CboCampaigns';
import { ProjectedConversions } from './ProjectedConversions';
import { SignalReadinessCard } from './SignalReadinessCard';
import { OBJECTIVES } from './suggestionModel';
import { PortfolioWizard } from './wizard/PortfolioWizard';

// Explains an empty suggestion list precisely (Phase C diagnostic reason), so the wizard never
// shows a bare "no suggestions yet". `hasProjections` keeps the all-CBO case from dead-ending:
// when every ad set is held at the campaign level there ARE no ad-set budgets to pick.
export function suggestEmptyMessage(
  reason: string | null,
  level: PortfolioLevel,
  { hasProjections = false }: { hasProjections?: boolean } = {},
): string {
  switch (reason) {
    case 'all_cbo':
      if (level === 'campaign') {
        return "Every campaign here splits its budget at the ad-set level (ABO), so there's nothing to group at the campaign level. Optimize these as an ad-set portfolio instead.";
      }
      return hasProjections
        ? "Every active ad set here uses a campaign-level budget (CBO or lifetime), so there's nothing to group into a suggestion yet. Here's what each campaign would look like converted to ad-set budgets."
        : "Every active ad set here uses a campaign-level budget (CBO or lifetime), so there's nothing to group into a suggestion. Start from scratch and pick ad sets with their own daily budgets.";
    case 'no_active':
      return 'No active ad sets found for this account yet. Once ad sets are live, suggestions will appear here.';
    case 'tracking_gaps':
      return 'Ad sets are spending but none has tracked conversions yet — set up conversion tracking, or start from scratch.';
    case 'not_permitted':
      return "This ad account isn't assigned to this brand, so the optimizer can't read its ad sets. Assign it in Settings → Integrations, then try again.";
    default:
      return "No grouped suggestions yet — the optimizer groups ad sets once this account's metrics are available. Start from scratch in the meantime.";
  }
}

type PortfolioSetupProps = {
  brandId: string;
  adAccountId: string;
  currency?: string | null;
  /** Called with the new portfolio id once it is created (and its ad sets enrolled). */
  onCreated?: (portfolioId: string) => void;
  /** The onboarding empty-state shows the account header; the in-tab "New portfolio" page
   *  suppresses it (the account is already in context there). */
  showAccountHeader?: boolean;
};

/** The single objective to read account-wide signal readiness against, before any portfolio
 *  exists: the KPI the plurality of ad sets already declare. */
export function dominantAccountObjective(snapshots: AdSetSnapshot[]): OptimizationObjective {
  const counts = new Map<string, number>();
  for (const snapshot of snapshots) {
    if (!snapshot.kpiField) continue;
    counts.set(snapshot.kpiField, (counts.get(snapshot.kpiField) ?? 0) + 1);
  }
  let best: OptimizationObjective = 'purchase';
  let bestCount = 0;
  for (const objective of OBJECTIVES) {
    const kpiField = getOptimizationMetricDefinition(objective).kpiField;
    const count = counts.get(kpiField) ?? 0;
    if (count > bestCount) {
      best = objective;
      bestCount = count;
    }
  }
  return best;
}

export function PortfolioSetup({
  brandId,
  adAccountId,
  currency,
  onCreated,
  showAccountHeader = true,
}: PortfolioSetupProps) {
  const { data: accounts } = useOptimizerAdAccounts(brandId);
  const account = accounts.find((row) => row.account_id === adAccountId) ?? null;
  const resolvedCurrency = currency ?? account?.currency ?? null;

  // The Optimizer reallocates ad-set budgets; "by campaign" in the wizard picks whole
  // campaigns' ad sets, it does not move a CBO budget. CBO campaigns are surfaced separately
  // with a one-click convert-to-ABO.
  const level: PortfolioLevel = 'adset';

  const suggestRead = useOptimizerSuggestions(brandId, adAccountId, level);
  const suggestions = suggestRead.data?.suggestions ?? [];
  const diagnostics = suggestRead.data?.diagnostics ?? null;
  const suggestReason = suggestRead.data?.reason ?? null;

  const snapshotsRead = useOptimizerAccountSnapshots(brandId, adAccountId, level);
  const snapshots = snapshotsRead.data;

  const cboSections = React.useMemo(() => buildCboCampaignSections(snapshots), [snapshots]);
  const cboSectionRef = React.useRef<HTMLDivElement>(null);
  const projectedConversions = React.useMemo(
    () => buildProjectedConversions(cboSections, snapshots, { currency: resolvedCurrency }),
    [cboSections, snapshots, resolvedCurrency],
  );
  const accountObjective = React.useMemo(() => dominantAccountObjective(snapshots), [snapshots]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {showAccountHeader ? (
        <AccountHeader
          currency={resolvedCurrency}
          name={account?.name ?? adAccountId}
          platform={account?.platform ?? null}
          status={account?.status ?? null}
        />
      ) : null}

      {diagnostics && diagnostics.trackingGaps > 0 ? (
        <TrackingGapBanner
          gaps={diagnostics.trackingGaps}
          samples={diagnostics.gapSamples}
          spending={diagnostics.spending}
        />
      ) : null}

      <PortfolioWizard
        adAccountId={adAccountId}
        brandId={brandId}
        currency={resolvedCurrency}
        onCreated={onCreated}
        snapshots={snapshots}
        snapshotsError={snapshotsRead.isError}
        snapshotsLoading={snapshotsRead.isLoading}
        startExtras={
          <div className="space-y-3">
            <SignalReadinessCard
              action={
                cboSections.length > 0 ? (
                  <Button
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      cboSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                    size="xs"
                    type="button"
                    variant="ghost"
                  >
                    Show {cboSections.length} CBO{' '}
                    {cboSections.length === 1 ? 'campaign' : 'campaigns'}
                  </Button>
                ) : null
              }
              objective={accountObjective}
              snapshots={snapshots}
            />
            {suggestRead.isLoading ? null : (
              <ProjectedConversions
                accountId={adAccountId}
                brandId={brandId}
                currency={resolvedCurrency}
                projections={projectedConversions}
              />
            )}
            <div ref={cboSectionRef}>
              <CboCampaigns
                accountId={adAccountId}
                brandId={brandId}
                currency={resolvedCurrency}
                sections={cboSections}
                snapshots={snapshots}
              />
            </div>
            {suggestReason === 'not_permitted' ? (
              <Link
                className={cn(
                  buttonVariants({ variant: 'link', size: 'sm' }),
                  'h-auto p-0 text-xs',
                )}
                href={PAID_SETUP_CONNECT_HREF}
              >
                Manage assignments
              </Link>
            ) : null}
          </div>
        }
        suggestions={suggestions}
        suggestionsEmptyMessage={suggestEmptyMessage(suggestReason, level, {
          hasProjections: projectedConversions.length > 0,
        })}
        suggestionsError={suggestRead.isError}
        suggestionsLoading={suggestRead.isLoading}
      />
    </div>
  );
}

function AccountHeader({
  name,
  platform,
  status,
  currency,
}: {
  name: string;
  platform: string | null;
  status: string | null;
  currency: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">Optimizing account</p>
        <p className="truncate font-semibold text-sm tracking-tight">{name}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {platform ? (
          <Badge className="text-3xs" variant="outline">
            {humanize(platform)}
          </Badge>
        ) : null}
        {currency ? (
          <Badge className="text-3xs" variant="secondary">
            {currency}
          </Badge>
        ) : null}
        {status ? (
          <Badge
            className="text-3xs"
            variant={status.toLowerCase() === 'active' ? 'success' : 'outline'}
          >
            {humanize(status)}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function TrackingGapBanner({
  gaps,
  spending,
  samples,
}: {
  gaps: number;
  spending: number;
  samples: string[];
}) {
  return (
    <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-warning text-xs">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <div>
        <p>
          <b>{gaps}</b> of {spending} spending ad sets have <b>0 tracked conversions</b> for their
          objective — check the pixel/conversion tracking before enrolling.
        </p>
        {samples.length > 0 ? (
          <p className="mt-1 font-mono text-2xs opacity-80">{samples.slice(0, 4).join(', ')}</p>
        ) : null}
      </div>
    </div>
  );
}
