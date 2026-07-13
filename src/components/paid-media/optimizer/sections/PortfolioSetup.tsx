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
  getOptimizationMetricDefinition,
  suggestionToEnrollRequest,
  suggestionToPortfolioConfig,
} from '@continuum/contracts';
import {
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
import { currencySymbol, deriveEfficiency, formatCpa, formatCurrency, humanize } from '../format';
import { CampaignAdsetPicker } from '../picker/CampaignAdsetPicker';
import { buildCboCampaignSections } from '../picker/campaignGroups';
import { applyModeExplainer, applyModePill } from '../reportModel';
import {
  useOptimizerAccountSnapshots,
  useOptimizerAdAccounts,
  useOptimizerMutations,
  useOptimizerSuggestions,
} from '../useOptimizerData';
import { CboCampaigns } from './CboCampaigns';
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
  // Called with the new portfolio id once it is created (and its ad sets enrolled).
  // The caller navigates to that portfolio's detail workspace so the user watches
  // the first cycle score instead of landing on an empty Overview.
  onCreated?: (portfolioId: string) => void;
  // The onboarding empty-state shows the account header; the in-tab "New
  // portfolio" expander suppresses it (the account is already in context there).
  showAccountHeader?: boolean;
};

// `clicks` is deliberately absent: it is the engine's internal fallback, not a thing an
// advertiser chooses to buy. Everything else a Meta ad set can DECLARE is selectable —
// without `conversations` here, a messaging account could not create a portfolio that
// prices what it actually buys, and every one of its ad sets would sit frozen.
const OBJECTIVES: OptimizationObjective[] = [
  'purchase',
  'app_install',
  'signup',
  'lead',
  'conversations',
  'traffic',
  'link_clicks',
  'thruplays',
  'post_engagement',
  'awareness',
];
const MODES: OptimizationModeDto[] = ['efficiency', 'balanced', 'scale'];

// Per-objective default reallocation mode — mirrors optimizer-suggest's DEFAULT_MODE
// so changing the objective on a suggestion card re-derives the same mode the server
// would have chosen for that objective.
const DEFAULT_MODE_BY_OBJECTIVE: Record<OptimizationObjective, OptimizationModeDto> = {
  purchase: 'balanced',
  app_install: 'scale',
  signup: 'scale',
  lead: 'efficiency',
  traffic: 'balanced',
  awareness: 'efficiency',
  // The objectives whose engine profiles are UNCALIBRATED (see optimization-engine
  // objectives.ts). We have no backtest telling us how hard these saturate, so they
  // default to `efficiency` — the mode that treats the planned total as a ceiling and
  // never force-spends on inventory it cannot vouch for. Guessing on the cautious side
  // costs a little reach; guessing on the other side costs someone else's money.
  conversations: 'efficiency',
  link_clicks: 'efficiency',
  thruplays: 'efficiency',
  post_engagement: 'efficiency',
  clicks: 'efficiency',
};

// Conversion objectives need tracked events to score; with 0 tracked conversions the
// first cycle is pause-all / Low-confidence. The suggestion card nudges toward Traffic.
const CONVERSION_OBJECTIVES = new Set<OptimizationObjective>([
  'purchase',
  'app_install',
  'signup',
  'lead',
  // A messaging thread is a tracked conversion like any other: with none recorded, the
  // first cycle has nothing to score and the same nudge applies.
  'conversations',
]);

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

  // The Optimizer stays ad-set-level only — it never reallocates a campaign (CBO)
  // budget. CBO campaigns are surfaced separately (CboCampaigns) with a one-click
  // convert-to-ABO. `level` is pinned to 'adset'; the dormant campaign params in the
  // reads/picker/create stay harmless at their 'adset' default.
  const level: PortfolioLevel = 'adset';

  const suggestRead = useOptimizerSuggestions(brandId, adAccountId, level);
  const suggestions = suggestRead.data?.suggestions ?? [];
  const diagnostics = suggestRead.data?.diagnostics ?? null;
  const suggestReason = suggestRead.data?.reason ?? null;

  // Account snapshots power the client-side "what-if" preview (engine runs in the
  // browser). Absent when the metrics edge is unreachable — the preview simply
  // hides in that case.
  const { data: snapshots } = useOptimizerAccountSnapshots(brandId, adAccountId, level);

  // CBO campaigns (their ad sets held `unsupported_budget`) — surfaced as
  // not-yet-optimizable with a one-click convert-to-ABO preview.
  const cboSections = React.useMemo(() => buildCboCampaignSections(snapshots), [snapshots]);

  const { create, enroll, run } = useOptimizerMutations(brandId, adAccountId);
  const [createdKeys, setCreatedKeys] = React.useState<Set<string>>(new Set());

  const createFromSuggestion = (
    suggestion: PortfolioSuggestion,
    override?: { objective: OptimizationObjective; mode: OptimizationModeDto },
  ) => {
    // Base config from the SHARED builder (@continuum/contracts) so onboarding and the
    // Jaina/MCP agents produce the identical portfolio config; the FE then pins `level`
    // (optimizer is ad-set-level here) and applies the optional objective/mode override.
    // Soak-first: suggestion creates start in observe (metric ingest + score, no Meta
    // writes). Operators promote to recommend/autopilot from Manage when ready.
    const suggestedConfig = suggestionToPortfolioConfig(suggestion, { apply_mode: 'observe' });
    // A target belongs to the objective that produced it. If an operator changes
    // that objective before creating, start without a target rather than silently
    // carrying (for example) a purchase CPA into an awareness CPM portfolio.
    const { cpa_target: suggestedTarget, ...configWithoutTarget } = suggestedConfig;
    const objectiveChanged = override?.objective && override.objective !== suggestion.objective;
    const config = {
      ...configWithoutTarget,
      ...(!objectiveChanged && suggestedTarget != null ? { cpa_target: suggestedTarget } : {}),
      level,
      apply_mode: 'observe' as const,
      ...(override ? { objective: override.objective, mode: override.mode } : {}),
    };
    create.mutate(
      {
        brand_id: brandId,
        ad_account_id: adAccountId,
        config,
      },
      {
        onSuccess: ({ portfolio_id }) => {
          setCreatedKeys((prev) => new Set(prev).add(suggestion.name));
          if (suggestion.adset_ids.length > 0) {
            // Score the first cycle only AFTER enrollment lands (a cycle on 0 ad
            // sets is a no-op); navigate to the detail workspace either way — the
            // scheduler already has next_realloc_at=now() as the backstop.
            enroll.mutate(suggestionToEnrollRequest(portfolio_id, suggestion), {
              onSuccess: () => {
                run.mutate(portfolio_id);
                onCreated?.(portfolio_id);
              },
              onError: () => onCreated?.(portfolio_id),
            });
          } else {
            onCreated?.(portfolio_id);
          }
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
              grouped from this account&rsquo;s active ad sets
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
          </div>
        ) : (
          <div className="space-y-2">
            {suggestions.map((suggestion) => {
              const groupIds = new Set(suggestion.adset_ids);
              const groupSnapshots = snapshots.filter((snapshot) => groupIds.has(snapshot.id));
              return (
                <SuggestionRow
                  key={suggestion.name}
                  brandId={brandId}
                  suggestion={suggestion}
                  snapshots={groupSnapshots}
                  currency={resolvedCurrency}
                  created={createdKeys.has(suggestion.name)}
                  busy={create.isPending && create.variables?.config.name === suggestion.name}
                  onCreate={(override) => createFromSuggestion(suggestion, override)}
                />
              );
            })}
          </div>
        )}
      </section>

      <CboCampaigns
        brandId={brandId}
        accountId={adAccountId}
        currency={resolvedCurrency}
        sections={cboSections}
      />

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
  brandId,
  suggestion,
  snapshots,
  currency,
  created,
  busy,
  onCreate,
}: {
  brandId: string;
  suggestion: PortfolioSuggestion;
  snapshots: AdSetSnapshot[];
  currency: string | null;
  created: boolean;
  busy: boolean;
  onCreate: (override: { objective: OptimizationObjective; mode: OptimizationModeDto }) => void;
}) {
  const [previewOpen, setPreviewOpen] = React.useState(false);
  // The objective is the lever: it decides what "good" means for the cycle. Default
  // to the server's inference but let the operator correct it before creating — the
  // mode follows the objective (same map the server uses).
  const [objective, setObjective] = React.useState<OptimizationObjective>(suggestion.objective);
  const mode = DEFAULT_MODE_BY_OBJECTIVE[objective];
  const metric = getOptimizationMetricDefinition(objective);
  const cpa = deriveEfficiency(
    suggestion.summary.spend14,
    suggestion.summary.conv14,
    metric.denominatorMultiplier,
  );
  const canPreview = snapshots.length > 0;
  // Nudge toward Traffic when a conversion objective has no tracked conversions — that
  // combination scores as pause-all / Low confidence and gives the user no value.
  const noConversions = CONVERSION_OBJECTIVES.has(objective) && suggestion.summary.conv14 === 0;

  return (
    <div className="rounded-lg border border-border/70 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            {suggestion.name}
            <Badge variant="teal" className="text-3xs">
              {humanize(mode)}
            </Badge>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {suggestion.summary.adsets} ad sets · {formatCurrency(suggestion.daily_total, currency)}
            /d
            {cpa != null ? ` · ${metric.costLabel} ${formatCpa(cpa, currency)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Select
            value={objective}
            onValueChange={(value) => setObjective(value as OptimizationObjective)}
          >
            <SelectTrigger className="h-7 w-36 text-xs" aria-label="Optimization objective">
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
              onClick={() => onCreate({ objective, mode })}
            >
              <PlusIcon className="size-3.5" />
              {busy ? 'Creating…' : 'Create'}
            </Button>
          )}
        </div>
      </div>
      {noConversions ? (
        <p className="px-4 pb-2 text-2xs text-warning">
          No conversions tracked in the last 14 days — a conversion objective will score as Low
          confidence. Consider <b>Traffic</b> for a decisive first cycle.
        </p>
      ) : null}
      {previewOpen && canPreview ? (
        <div className="border-t border-border/60 p-3">
          <PortfolioPreview
            brandId={brandId}
            snapshots={snapshots}
            objective={objective}
            mode={mode}
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
  onCreated?: (portfolioId: string) => void;
}) {
  const { create, enroll, run } = useOptimizerMutations(brandId, adAccountId);
  const snapshotsRead = useOptimizerAccountSnapshots(brandId, adAccountId, level);

  const [name, setName] = React.useState('');
  const [objective, setObjective] = React.useState<OptimizationObjective>('purchase');
  const [mode, setMode] = React.useState<OptimizationModeDto>('balanced');
  // Create-time autonomy: observe (soak metrics) or recommend (human apply). Autopilot
  // requires guardrails and is armed only from Manage after create.
  const [applyMode, setApplyMode] = React.useState<ApplyMode>('observe');
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
  // A portfolio with no enrolled entities is INERT: the scheduler claims it every cycle and
  // skips with `no_adsets`, forever, while the UI shows an active portfolio that never
  // scores. Enrollment is what makes a portfolio real, so it is required to create one.
  const canSubmit = name.trim().length > 0 && effectiveDaily > 0 && selectedAdsetIds.length > 0;
  const busy = create.isPending || enroll.isPending;
  const metric = getOptimizationMetricDefinition(objective);

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
          ...(Number.isFinite(cpaValue) && cpaValue > 0
            ? { cpa_target: cpaValue / metric.denominatorMultiplier }
            : {}),
        },
      },
      {
        onSuccess: ({ portfolio_id }) => {
          // canSubmit guarantees a non-empty selection, so enroll always runs. On failure we
          // stay put with the error visible rather than navigating to an inert portfolio;
          // create is idempotent (unique name per account), so pressing Create again retries
          // the enroll against the same portfolio.
          enroll.mutate(
            { portfolio_id, adset_ids: selectedAdsetIds },
            {
              onSuccess: () => {
                run.mutate(portfolio_id);
                setName('');
                setDailyTotal('');
                setCpaTarget('');
                setSelectedAdsetIds([]);
                setApplyMode('observe');
                onCreated?.(portfolio_id);
              },
            },
          );
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
            <Label>Autonomy tier</Label>
            {/* Create offers observe (soak) and recommend (HITL). Autopilot needs guardrails
                and is armed only from Manage — the DB refuses unguarded autopilot. */}
            <Select value={applyMode} onValueChange={(value) => setApplyMode(value as ApplyMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['observe', 'recommend'] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {applyModePill(value)?.label ?? humanize(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-2xs text-muted-foreground">{applyModeExplainer(applyMode)}</p>
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
            <Label htmlFor="optimizer-cpa-target">
              {metric.targetLabel} ({symbol}, optional)
            </Label>
            <Input
              id="optimizer-cpa-target"
              inputMode="decimal"
              value={cpaTarget}
              onChange={(event) => setCpaTarget(event.target.value)}
              placeholder={metric.costLabel === 'CPM' ? '12' : '40'}
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
              : `Select at least one of the ${entityLabel} above — a portfolio with none never scores.`}
          </p>
        </div>

        {create.isError || enroll.isError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {create.error instanceof Error
              ? create.error.message
              : enroll.error instanceof Error
                ? `Portfolio created, but enrolling the ${entityLabel} failed — press Create again to retry, or add them from Manage.`
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
