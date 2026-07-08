'use client';

// Reusable portfolio setup body: discover the account → server-side suggestions
// → create → enroll. Shared by the empty-state OptimizerOnboarding and the "Add
// portfolio" entry point in the populated views.
//
// Data paths (identical to what the MCP tools / optimizer ingest use — nothing
// lies to the user):
//  - account discovery: plugin_mcp.list_brand_ad_accounts (via useOptimizerAdAccounts)
//  - suggestions: optimizer-suggest edge fn, which groups the account's ad sets
//    (paid-media-metrics adset_snapshots scope) by objective.
//  - create: optimizer_create_portfolio RPC (raises 42501 if the ad account is
//    not this brand's — surfaced as a clean inline message).
//  - enroll: optimizer-enroll edge fn with the suggestion's adset_ids.

import type {
  AdSetSnapshot,
  ApplyMode,
  OptimizationModeDto,
  OptimizationObjective,
  PortfolioLevel,
  PortfolioSuggestion,
} from '@continuum/contracts';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  PlusIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { currencySymbol, deriveCpa, formatCpa, formatCurrency, humanize } from '../format';
import { CampaignAdsetPicker } from '../picker/CampaignAdsetPicker';
import {
  useOptimizerAccountSnapshots,
  useOptimizerAdAccounts,
  useOptimizerMutations,
  useOptimizerSuggestions,
} from '../useOptimizerData';
import { PortfolioPreview } from './PortfolioPreview';

// Explains an empty suggestion list precisely (Phase C diagnostic reason), so the
// onboarding never shows a bare "no suggestions yet". In campaign mode the
// 'all_cbo' reason means "every campaign is ABO" (budget split at the ad-set level).
function suggestEmptyMessage(reason: string | null, level: PortfolioLevel): string {
  switch (reason) {
    case 'all_cbo':
      return level === 'campaign'
        ? "Every campaign here splits its budget at the ad-set level (ABO), so there's nothing to group at the campaign level. Optimize these as an ad-set portfolio instead."
        : "Every active ad set here uses a campaign-level budget (CBO or lifetime), so there's nothing to group into a suggestion. Pick ad sets with their own daily budgets below.";
    case 'no_active':
      return 'No active ad sets found for this account yet. Once ad sets are live, suggestions will appear here.';
    case 'tracking_gaps':
      return 'Ad sets are spending but none has tracked conversions yet — set up conversion tracking, or create a portfolio manually below.';
    case 'not_permitted':
      return "This ad account isn't linked to the current brand, so we couldn't read its ad sets. Reconnect it in Integrations, then try again.";
    default:
      return "No grouped suggestions yet — the optimizer groups ad sets once this account's metrics are available. Create a portfolio manually below in the meantime.";
  }
}

type PortfolioSetupProps = {
  brandId: string;
  adAccountId: string;
  currency?: string | null;
  onCreated?: () => void;
  // The onboarding empty-state shows the account header; the in-tab "New
  // portfolio" expander suppresses it (the account is already in context there).
  showAccountHeader?: boolean;
};

const OBJECTIVES: OptimizationObjective[] = [
  'purchase',
  'app_install',
  'signup',
  'lead',
  'traffic',
  'awareness',
];
const MODES: OptimizationModeDto[] = ['efficiency', 'balanced', 'scale'];
const APPLY_MODES: ApplyMode[] = ['recommend', 'autopilot'];

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

  // What this portfolio reallocates: ad-set budgets (default) or campaign budgets
  // (CBO). Drives the suggestion/snapshot reads, the picker mode, and create config.
  const [level, setLevel] = React.useState<PortfolioLevel>('adset');

  const suggestRead = useOptimizerSuggestions(brandId, adAccountId, level);
  const suggestions = suggestRead.data?.suggestions ?? [];
  const diagnostics = suggestRead.data?.diagnostics ?? null;
  const suggestReason = suggestRead.data?.reason ?? null;

  // Account snapshots power the client-side "what-if" preview (engine runs in the
  // browser). Absent when the metrics edge is unreachable — the preview simply
  // hides in that case.
  const { data: snapshots } = useOptimizerAccountSnapshots(brandId, adAccountId, level);

  const { create, enroll } = useOptimizerMutations(brandId, adAccountId);
  const [createdKeys, setCreatedKeys] = React.useState<Set<string>>(new Set());

  const createFromSuggestion = (suggestion: PortfolioSuggestion) => {
    create.mutate(
      {
        brand_id: brandId,
        ad_account_id: adAccountId,
        config: {
          name: suggestion.name,
          objective: suggestion.objective,
          level,
          mode: suggestion.mode,
          apply_mode: 'recommend',
          daily_total: suggestion.daily_total,
          ...(suggestion.cpa_target ? { cpa_target: suggestion.cpa_target } : {}),
        },
      },
      {
        onSuccess: ({ portfolio_id }) => {
          if (suggestion.adset_ids.length > 0) {
            enroll.mutate({ portfolio_id, adset_ids: suggestion.adset_ids });
          }
          setCreatedKeys((prev) => new Set(prev).add(suggestion.name));
          onCreated?.();
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {showAccountHeader ? (
        <AccountHeader
          name={account?.name ?? adAccountId}
          platform={account?.platform ?? null}
          status={account?.status ?? null}
          currency={resolvedCurrency}
        />
      ) : null}

      <PortfolioLevelToggle level={level} onLevelChange={setLevel} />

      {diagnostics && diagnostics.trackingGaps > 0 ? (
        <TrackingGapBanner
          gaps={diagnostics.trackingGaps}
          spending={diagnostics.spending}
          samples={diagnostics.gapSamples}
        />
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight">Suggested portfolios</h3>
          {suggestions.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              grouped from this account&rsquo;s active{' '}
              {level === 'campaign' ? 'campaigns' : 'ad sets'}
            </span>
          ) : null}
        </div>

        {suggestRead.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>
        ) : suggestRead.isError ? (
          <p className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-xs text-warning">
            Suggestions are unavailable — the optimizer service is offline. You can still create a
            portfolio manually below.
          </p>
        ) : suggestions.length === 0 ? (
          <div className="space-y-2 rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {suggestEmptyMessage(suggestReason, level)}
            </p>
            {suggestReason === 'all_cbo' && level === 'adset' ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setLevel('campaign')}
              >
                Optimize them as a Campaign portfolio
                <ArrowRightIcon className="size-3.5" />
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            {suggestions.map((suggestion) => {
              const groupIds = new Set(suggestion.adset_ids);
              const groupSnapshots = snapshots.filter((snapshot) => groupIds.has(snapshot.id));
              return (
                <SuggestionRow
                  key={suggestion.name}
                  suggestion={suggestion}
                  snapshots={groupSnapshots}
                  currency={resolvedCurrency}
                  created={createdKeys.has(suggestion.name)}
                  busy={create.isPending && create.variables?.config.name === suggestion.name}
                  onCreate={() => createFromSuggestion(suggestion)}
                />
              );
            })}
          </div>
        )}
      </section>

      <PortfolioCreateForm
        brandId={brandId}
        adAccountId={adAccountId}
        currency={resolvedCurrency}
        level={level}
        onCreated={onCreated}
      />
    </div>
  );
}

function PortfolioLevelToggle({
  level,
  onLevelChange,
}: {
  level: PortfolioLevel;
  onLevelChange: (level: PortfolioLevel) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight">Portfolio type</p>
        <p className="text-xs text-muted-foreground">
          Reallocate budget across ad sets, or across whole campaigns (CBO).
        </p>
      </div>
      <Tabs value={level} onValueChange={(value) => onLevelChange(value as PortfolioLevel)}>
        <TabsList className="h-8">
          <TabsTrigger value="adset" className="px-3 text-xs">
            Ad sets
          </TabsTrigger>
          <TabsTrigger value="campaign" className="px-3 text-xs">
            Campaigns
          </TabsTrigger>
        </TabsList>
      </Tabs>
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
        <p className="text-xs text-muted-foreground">Optimizing account</p>
        <p className="truncate text-sm font-semibold tracking-tight">{name}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {platform ? (
          <Badge variant="outline" className="text-3xs">
            {humanize(platform)}
          </Badge>
        ) : null}
        {currency ? (
          <Badge variant="secondary" className="text-3xs">
            {currency}
          </Badge>
        ) : null}
        {status ? (
          <Badge
            variant={status.toLowerCase() === 'active' ? 'success' : 'outline'}
            className="text-3xs"
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
    <div className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-warning">
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

function SuggestionRow({
  suggestion,
  snapshots,
  currency,
  created,
  busy,
  onCreate,
}: {
  suggestion: PortfolioSuggestion;
  snapshots: AdSetSnapshot[];
  currency: string | null;
  created: boolean;
  busy: boolean;
  onCreate: () => void;
}) {
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const cpa = deriveCpa(suggestion.summary.spend14, suggestion.summary.conv14);
  const canPreview = snapshots.length > 0;

  return (
    <div className="rounded-lg border border-border/70 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            {suggestion.name}
            <Badge variant="teal" className="text-3xs">
              {humanize(suggestion.mode)}
            </Badge>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {suggestion.summary.adsets} ad sets · {formatCurrency(suggestion.daily_total, currency)}
            /d
            {cpa != null ? ` · CPA ${formatCpa(cpa, currency)}` : ''} ·{' '}
            {humanize(suggestion.objective)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canPreview ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              aria-expanded={previewOpen}
              onClick={() => setPreviewOpen((open) => !open)}
            >
              <ChevronDownIcon
                className={`size-3.5 transition-transform ${previewOpen ? 'rotate-180' : ''}`}
              />
              Preview
            </Button>
          ) : null}
          {created ? (
            <Badge variant="success" className="gap-1 text-3xs">
              <CheckCircle2Icon className="size-3" /> created
            </Badge>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1.5 px-3 text-xs"
              disabled={busy}
              onClick={onCreate}
            >
              <PlusIcon className="size-3.5" />
              {busy ? 'Creating…' : 'Create'}
            </Button>
          )}
        </div>
      </div>
      {previewOpen && canPreview ? (
        <div className="border-t border-border/60 p-3">
          <PortfolioPreview
            snapshots={snapshots}
            objective={suggestion.objective}
            mode={suggestion.mode}
            dailyTotal={suggestion.daily_total}
            currency={currency}
          />
        </div>
      ) : null}
    </div>
  );
}

export function PortfolioCreateForm({
  brandId,
  adAccountId,
  currency,
  level = 'adset',
  onCreated,
}: {
  brandId: string;
  adAccountId: string;
  currency: string | null;
  level?: PortfolioLevel;
  onCreated?: () => void;
}) {
  const { create, enroll } = useOptimizerMutations(brandId, adAccountId);
  const snapshotsRead = useOptimizerAccountSnapshots(brandId, adAccountId, level);

  const [name, setName] = React.useState('');
  const [objective, setObjective] = React.useState<OptimizationObjective>('purchase');
  const [mode, setMode] = React.useState<OptimizationModeDto>('balanced');
  const [applyMode, setApplyMode] = React.useState<ApplyMode>('recommend');
  const [dailyTotal, setDailyTotal] = React.useState('');
  const [cpaTarget, setCpaTarget] = React.useState('');
  const [selectedAdsetIds, setSelectedAdsetIds] = React.useState<string[]>([]);

  // Sum of the selected ad sets' current daily budgets — offered as the default
  // daily total when the operator hasn't typed one (they keep control).
  const selectedBudgetSum = React.useMemo(() => {
    const ids = new Set(selectedAdsetIds);
    return snapshotsRead.data
      .filter((snapshot) => ids.has(snapshot.id))
      .reduce((sum, snapshot) => sum + (snapshot.currentBudget ?? 0), 0);
  }, [snapshotsRead.data, selectedAdsetIds]);

  const typedDaily = Number.parseFloat(dailyTotal);
  const effectiveDaily =
    Number.isFinite(typedDaily) && typedDaily > 0 ? typedDaily : selectedBudgetSum;
  const canSubmit = name.trim().length > 0 && effectiveDaily > 0;
  const busy = create.isPending || enroll.isPending;

  const handleCreate = () => {
    if (!canSubmit) return;
    const cpaValue = Number.parseFloat(cpaTarget);
    create.mutate(
      {
        brand_id: brandId,
        ad_account_id: adAccountId,
        config: {
          name: name.trim(),
          objective,
          level,
          mode,
          apply_mode: applyMode,
          daily_total: effectiveDaily,
          ...(Number.isFinite(cpaValue) && cpaValue > 0 ? { cpa_target: cpaValue } : {}),
        },
      },
      {
        onSuccess: ({ portfolio_id }) => {
          if (selectedAdsetIds.length > 0) {
            enroll.mutate({ portfolio_id, adset_ids: selectedAdsetIds });
          }
          setName('');
          setDailyTotal('');
          setCpaTarget('');
          setSelectedAdsetIds([]);
          onCreated?.();
        },
      },
    );
  };

  const symbol = currencySymbol(currency);
  const entityLabel = level === 'campaign' ? 'campaigns' : 'ad sets';

  return (
    <Card className="gap-0 rounded-lg py-0 shadow-none">
      <CardHeader className="border-b border-border/70 p-4">
        <CardTitle className="text-sm">Create a portfolio</CardTitle>
        <p className="text-xs text-muted-foreground">
          Name it, pick the {entityLabel} to optimize together, and set a daily budget in{' '}
          {currency ?? 'the account currency'}.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1.5">
          <Label htmlFor="optimizer-portfolio-name">Name</Label>
          <Input
            id="optimizer-portfolio-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Prospecting · Purchases"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Objective</Label>
            <Select
              value={objective}
              onValueChange={(value) => setObjective(value as OptimizationObjective)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBJECTIVES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {humanize(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as OptimizationModeDto)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {humanize(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Apply mode</Label>
            <Select value={applyMode} onValueChange={(value) => setApplyMode(value as ApplyMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLY_MODES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {humanize(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="optimizer-daily-total">Daily budget ({symbol})</Label>
            <Input
              id="optimizer-daily-total"
              inputMode="decimal"
              value={dailyTotal}
              onChange={(event) => setDailyTotal(event.target.value)}
              placeholder={selectedBudgetSum > 0 ? String(Math.round(selectedBudgetSum)) : '4200'}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="optimizer-cpa-target">CPA target ({symbol}, optional)</Label>
            <Input
              id="optimizer-cpa-target"
              inputMode="decimal"
              value={cpaTarget}
              onChange={(event) => setCpaTarget(event.target.value)}
              placeholder="40"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{level === 'campaign' ? 'Campaigns to enroll' : 'Ad sets to enroll'}</Label>
          <CampaignAdsetPicker
            snapshots={snapshotsRead.data}
            selectedAdsetIds={selectedAdsetIds}
            onChange={setSelectedAdsetIds}
            brandId={brandId}
            accountId={adAccountId}
            currency={currency}
            disabled={busy}
            isLoading={snapshotsRead.isLoading}
            isError={snapshotsRead.isError}
            mode={level}
          />
          <p className="text-2xs text-muted-foreground">
            {selectedAdsetIds.length > 0
              ? `${selectedAdsetIds.length} ${
                  level === 'campaign'
                    ? selectedAdsetIds.length === 1
                      ? 'campaign'
                      : 'campaigns'
                    : selectedAdsetIds.length === 1
                      ? 'ad set'
                      : 'ad sets'
                } selected · ${formatCurrency(selectedBudgetSum, currency)}/day current budget`
              : `No ${entityLabel} selected yet — you can also add them later from Manage.`}
          </p>
        </div>

        {create.isError || enroll.isError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {create.error instanceof Error
              ? create.error.message
              : enroll.error instanceof Error
                ? 'Portfolio created, but enrolling the ad sets failed. Add them from Manage.'
                : 'Could not create the portfolio.'}
          </p>
        ) : null}

        <div className="flex justify-end pt-1">
          <Button
            type="button"
            className="gap-1.5"
            disabled={!canSubmit || busy}
            onClick={handleCreate}
          >
            <PlusIcon className="size-4" />
            {busy
              ? 'Creating…'
              : selectedAdsetIds.length > 0
                ? `Create & enroll ${selectedAdsetIds.length}`
                : 'Create portfolio'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
