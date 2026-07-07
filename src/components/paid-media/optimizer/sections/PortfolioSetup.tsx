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
  PortfolioSuggestion,
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
import { currencySymbol, deriveCpa, formatCpa, formatCurrency, humanize } from '../format';
import {
  useOptimizerAccountSnapshots,
  useOptimizerAdAccounts,
  useOptimizerMutations,
  useOptimizerSuggestions,
} from '../useOptimizerData';
import { PortfolioPreview } from './PortfolioPreview';

type PortfolioSetupProps = {
  brandId: string;
  adAccountId: string;
  currency?: string | null;
  onCreated?: () => void;
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

export function PortfolioSetup({ brandId, adAccountId, currency, onCreated }: PortfolioSetupProps) {
  const { data: accounts } = useOptimizerAdAccounts(brandId);
  const account = accounts.find((row) => row.account_id === adAccountId) ?? null;
  const resolvedCurrency = currency ?? account?.currency ?? null;

  const suggestRead = useOptimizerSuggestions(brandId, adAccountId);
  const suggestions = suggestRead.data?.suggestions ?? [];
  const diagnostics = suggestRead.data?.diagnostics ?? null;

  // Account ad-set snapshots power the client-side "what-if" preview (engine
  // runs in the browser). Absent when the metrics edge is unreachable — the
  // preview simply hides in that case.
  const { data: snapshots } = useOptimizerAccountSnapshots(brandId, adAccountId);

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
      <AccountHeader
        name={account?.name ?? adAccountId}
        platform={account?.platform ?? null}
        status={account?.status ?? null}
        currency={resolvedCurrency}
      />

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
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : suggestRead.isError ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
            Suggestions are unavailable — the optimizer service is offline. You can still create a
            portfolio manually below.
          </p>
        ) : suggestions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
            No grouped suggestions yet — the optimizer groups ad sets once this account&rsquo;s
            metrics are available. Create a portfolio manually below in the meantime.
          </p>
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

      <ManualCreateForm
        brandId={brandId}
        adAccountId={adAccountId}
        currency={resolvedCurrency}
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
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">Optimizing account</p>
        <p className="truncate text-sm font-semibold tracking-tight">{name}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {platform ? (
          <Badge variant="outline" className="text-[10px]">
            {humanize(platform)}
          </Badge>
        ) : null}
        {currency ? (
          <Badge variant="secondary" className="text-[10px]">
            {currency}
          </Badge>
        ) : null}
        {status ? (
          <Badge
            variant={status.toLowerCase() === 'active' ? 'success' : 'outline'}
            className="text-[10px]"
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
    <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <div>
        <p>
          <b>{gaps}</b> of {spending} spending ad sets have <b>0 tracked conversions</b> for their
          objective — check the pixel/conversion tracking before enrolling.
        </p>
        {samples.length > 0 ? (
          <p className="mt-1 font-mono text-[11px] opacity-80">{samples.slice(0, 4).join(', ')}</p>
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
    <div className="rounded-xl border border-border/70 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            {suggestion.name}
            <Badge variant="teal" className="text-[10px]">
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
            <Badge variant="success" className="gap-1 text-[10px]">
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

function ManualCreateForm({
  brandId,
  adAccountId,
  currency,
  onCreated,
}: {
  brandId: string;
  adAccountId: string;
  currency: string | null;
  onCreated?: () => void;
}) {
  const { create } = useOptimizerMutations(brandId, adAccountId);

  const [name, setName] = React.useState('');
  const [objective, setObjective] = React.useState<OptimizationObjective>('purchase');
  const [mode, setMode] = React.useState<OptimizationModeDto>('balanced');
  const [applyMode, setApplyMode] = React.useState<ApplyMode>('recommend');
  const [dailyTotal, setDailyTotal] = React.useState('');
  const [cpaTarget, setCpaTarget] = React.useState('');

  const dailyValue = Number.parseFloat(dailyTotal);
  const canSubmit = name.trim().length > 0 && Number.isFinite(dailyValue) && dailyValue > 0;

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
          mode,
          apply_mode: applyMode,
          daily_total: dailyValue,
          ...(Number.isFinite(cpaValue) && cpaValue > 0 ? { cpa_target: cpaValue } : {}),
        },
      },
      {
        onSuccess: () => {
          setName('');
          setDailyTotal('');
          setCpaTarget('');
          onCreated?.();
        },
      },
    );
  };

  const symbol = currencySymbol(currency);

  return (
    <Card className="gap-0 rounded-xl py-0 shadow-none">
      <CardHeader className="border-b border-border/70 p-4">
        <CardTitle className="text-sm">Or create a custom portfolio</CardTitle>
        <p className="text-xs text-muted-foreground">
          Budgets are in {currency ?? 'the account currency'}.
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
              placeholder="4200"
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

        {create.isError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {create.error instanceof Error
              ? create.error.message
              : 'Could not create the portfolio.'}
          </p>
        ) : null}

        <div className="flex justify-end pt-1">
          <Button
            type="button"
            className="gap-1.5"
            disabled={!canSubmit || create.isPending}
            onClick={handleCreate}
          >
            <PlusIcon className="size-4" />
            {create.isPending ? 'Creating…' : 'Create portfolio'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
