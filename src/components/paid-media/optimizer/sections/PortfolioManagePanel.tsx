'use client';

// Inline management for one portfolio, organized into slot-in sections: Identity (name +
// objective), Strategy (mode + autonomy tier + daily budget), Guardrails (autopilot caps +
// kill-switch), an Advanced disclosure (target + period budget + velocity cap), and the
// enrolled campaign→ad-set picker. Save computes a DIFF — it patches only changed config
// fields, enrolls newly-selected ad sets, and unenrolls removed ones.
//
// Objective is now EDITABLE. Changing it changes the KPI the portfolio prices, so enrolled
// ad sets buying a different result stop matching and freeze as kpi_mismatch — the panel
// counts them and asks for confirmation before saving that change.

import {
  type ApplyMode,
  getOptimizationMetricDefinition,
  type OptimizationModeDto,
  type OptimizationObjective,
  OptimizationObjectiveSchema,
  type PortfolioLevel,
  type PortfolioListItem,
  toMinorUnits,
  type UpdatePortfolioPatch,
} from '@continuum/contracts';
import { Archive, ChevronDown, Loader2, Pause, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { currencySymbol, humanize } from '../format';
import { CampaignAdsetPicker } from '../picker/CampaignAdsetPicker';
import { applyModeExplainer, applyModePill, freezeLabel } from '../reportModel';
import {
  useOptimizerAccountSnapshots,
  useOptimizerEnrolledAdsets,
  useOptimizerMutations,
} from '../useOptimizerData';

const MODES: OptimizationModeDto[] = ['efficiency', 'balanced', 'scale'];
/** Bottom → top: observe (no Meta writes) · recommend (human apply) · autopilot. */
const APPLY_MODES: ApplyMode[] = ['observe', 'recommend', 'autopilot'];
const OBJECTIVES = OptimizationObjectiveSchema.options;
/** The period the pacing gauge estimates against when no period budget is set. */
const PACING_PERIOD_DAYS = 30;

/** The enrolled ad sets that will STOP matching the portfolio's KPI if its objective changes.
 *  An ad set that declares it buys a specific result (kpiField) no longer matches when that
 *  field differs from the new objective's; an ad set that declares nothing inherits the
 *  portfolio's objective and is never a mismatch. Pure so the freeze count is unit-tested. */
export function adsetsThatStopMatching<T extends { id: string; kpiField?: string | null }>(
  snapshots: T[],
  enrolledIds: string[],
  newKpiField: string,
): T[] {
  const enrolled = new Set(enrolledIds);
  return snapshots.filter(
    (snapshot) =>
      enrolled.has(snapshot.id) && snapshot.kpiField != null && snapshot.kpiField !== newKpiField,
  );
}

/** One-line explanation of each optimization mode, shown under the Mode select as it changes.
 *  Radix select items don't nest tooltips cleanly, so the hint updates with the selection. */
function modeExplainer(mode: string): string {
  switch (mode) {
    case 'efficiency':
      return 'Efficiency — protect cost per result. Budget moves hardest toward the cheapest ad sets and away from the expensive ones.';
    case 'scale':
      return 'Scale — chase volume. The optimizer tolerates a higher cost per result to spend into what is working.';
    default:
      return 'Balanced — trade a little efficiency for steadier volume. A sensible default.';
  }
}

type PortfolioManagePanelProps = {
  brandId: string;
  adAccountId: string;
  portfolio: PortfolioListItem;
  currency?: string | null;
  onDone?: () => void;
};

export function PortfolioManagePanel({
  brandId,
  adAccountId,
  portfolio,
  currency,
  onDone,
}: PortfolioManagePanelProps) {
  // A campaign portfolio edits campaigns, not ad sets: the level drives which snapshot
  // scope + picker mode the manage panel shows. Enroll/unenroll operate on the entity id
  // at either level, so the diff below is unchanged.
  const level = (portfolio.level as PortfolioLevel) ?? 'adset';
  const { update, enroll, unenroll, archive, setPaused } = useOptimizerMutations(
    brandId,
    adAccountId,
  );
  const enrolledRead = useOptimizerEnrolledAdsets(portfolio.id);
  const snapshotsRead = useOptimizerAccountSnapshots(brandId, adAccountId, level);

  const [name, setName] = useState(portfolio.name);
  const [objective, setObjective] = useState<OptimizationObjective>(
    portfolio.objective as OptimizationObjective,
  );
  const [mode, setMode] = useState<OptimizationModeDto>(portfolio.mode as OptimizationModeDto);
  const [applyMode, setApplyMode] = useState<ApplyMode>(portfolio.apply_mode as ApplyMode);
  // Confirmation gate: flipping ON autopilot begins writing real budgets, so it opens a
  // dialog before it takes effect (mirrors the Archive confirm).
  const [pendingAutopilot, setPendingAutopilot] = useState(false);
  // Confirmation gate: changing the objective freezes the ad sets that buy a different result.
  const [showObjectiveConfirm, setShowObjectiveConfirm] = useState(false);
  const [dailyTotal, setDailyTotal] = useState(
    portfolio.daily_total != null ? String(portfolio.daily_total) : '',
  );
  const [cpaTarget, setCpaTarget] = useState('');
  const [periodBudget, setPeriodBudget] = useState('');
  const [velocityCap, setVelocityCap] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Autopilot blast-radius guardrails. Inputs are MAJOR: dollars/day and percent/cycle;
  // converted to the contract's minor units / fraction on save. Blank = keep current.
  const [maxDailyApply, setMaxDailyApply] = useState('');
  const [maxChangePct, setMaxChangePct] = useState('');
  const isPaused = Boolean(portfolio.autopilot_paused);
  // null until the operator first touches the picker — before that the enrolled roster is
  // the selection (kept reactive as the async read resolves).
  const [selection, setSelection] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Metric follows the SELECTED objective so the target label + its unit conversion track it.
  const metric = getOptimizationMetricDefinition(objective);

  const enrolledIds = useMemo(
    () => enrolledRead.data.map((row) => row.adset_id),
    [enrolledRead.data],
  );
  const selectedAdsetIds = selection ?? enrolledIds;

  // Ad sets that will STOP matching the KPI if the objective changes: an enrolled ad set that
  // declares it buys a different result (kpiField ≠ the new objective's). Ad sets that declare
  // nothing inherit the portfolio's objective and are never a mismatch.
  const objectiveChanged = objective !== portfolio.objective;
  const affectedAdsets = useMemo(
    () =>
      objectiveChanged
        ? adsetsThatStopMatching(snapshotsRead.data, enrolledIds, metric.kpiField)
        : [],
    [objectiveChanged, enrolledIds, snapshotsRead.data, metric.kpiField],
  );

  const patch = useMemo<UpdatePortfolioPatch>(() => {
    const next: UpdatePortfolioPatch = {};
    if (name.trim() && name.trim() !== portfolio.name) next.name = name.trim();
    if (objective !== portfolio.objective) next.objective = objective;
    if (mode !== portfolio.mode) next.mode = mode;
    if (applyMode !== portfolio.apply_mode) next.apply_mode = applyMode;
    const daily = Number.parseFloat(dailyTotal);
    if (Number.isFinite(daily) && daily >= 0 && daily !== portfolio.daily_total) {
      next.daily_total = daily;
    }
    const cpa = Number.parseFloat(cpaTarget);
    if (Number.isFinite(cpa) && cpa > 0) next.cpa_target = cpa / metric.denominatorMultiplier;
    const period = Number.parseFloat(periodBudget);
    if (Number.isFinite(period) && period >= 0 && period !== portfolio.period_budget) {
      next.period_budget = period;
    }
    const velocity = Number.parseFloat(velocityCap);
    if (Number.isFinite(velocity) && velocity >= 0) next.velocity_cap_pct = velocity / 100;
    const maxDaily = Number.parseFloat(maxDailyApply);
    if (Number.isFinite(maxDaily) && maxDaily >= 0) {
      next.max_daily_apply_minor = toMinorUnits(maxDaily, currency);
    }
    const maxPct = Number.parseFloat(maxChangePct);
    if (Number.isFinite(maxPct) && maxPct >= 0) next.max_change_pct_per_cycle = maxPct / 100;
    return next;
  }, [
    name,
    objective,
    mode,
    applyMode,
    dailyTotal,
    cpaTarget,
    periodBudget,
    velocityCap,
    maxDailyApply,
    maxChangePct,
    portfolio,
    currency,
    metric.denominatorMultiplier,
  ]);

  // Autopilot writes real budgets to Meta, and the apply layer reads an absent cap as
  // UNCAPPED — so it may only be armed once BOTH guardrails are set and positive. The DB
  // refuses the flip too (optimizer_portfolios_autopilot_guardrails_chk); this keeps the user
  // from reaching a save that would only fail. A blank input means "keep current".
  const guardrailsReady = useMemo(() => {
    const dailyCapMinor = patch.max_daily_apply_minor ?? portfolio.max_daily_apply_minor;
    const pctCap = patch.max_change_pct_per_cycle ?? portfolio.max_change_pct_per_cycle;
    return Boolean(dailyCapMinor && dailyCapMinor > 0 && pctCap && pctCap > 0);
  }, [patch, portfolio]);

  // Flip to autopilot only through the confirm dialog; every other transition is immediate.
  function handleApplyModeChange(value: ApplyMode) {
    if (value === 'autopilot' && applyMode !== 'autopilot') {
      if (!guardrailsReady) return;
      setPendingAutopilot(true);
    } else {
      setApplyMode(value);
    }
  }

  const { toAdd, toRemove } = useMemo(() => {
    const enrolledSet = new Set(enrolledIds);
    const selectedSet = new Set(selectedAdsetIds);
    return {
      toAdd: selectedAdsetIds.filter((id) => !enrolledSet.has(id)),
      toRemove: enrolledIds.filter((id) => !selectedSet.has(id)),
    };
  }, [enrolledIds, selectedAdsetIds]);

  const hasChanges = Object.keys(patch).length > 0 || toAdd.length > 0 || toRemove.length > 0;

  async function performSave() {
    if (!hasChanges || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (Object.keys(patch).length > 0) {
        await update.mutateAsync({ portfolio_id: portfolio.id, patch });
      }
      if (toAdd.length > 0) {
        await enroll.mutateAsync({ portfolio_id: portfolio.id, adset_ids: toAdd });
      }
      await Promise.all(
        toRemove.map((adsetId) =>
          unenroll.mutateAsync({ portfolio_id: portfolio.id, adset_id: adsetId }),
        ),
      );
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  }

  // Changing the objective freezes mismatched ad sets — confirm that before writing it.
  function handleSaveClick() {
    if (!hasChanges || saving) return;
    if (objectiveChanged && affectedAdsets.length > 0) {
      setShowObjectiveConfirm(true);
      return;
    }
    void performSave();
  }

  function handleArchive() {
    archive.mutate(portfolio.id, { onSuccess: () => onDone?.() });
  }

  const symbol = currencySymbol(currency);
  const dailyNum = Number.parseFloat(dailyTotal || String(portfolio.daily_total ?? ''));
  const hasDaily = Number.isFinite(dailyNum) && dailyNum > 0;
  const mismatchLabel = freezeLabel('kpi_mismatch')?.label ?? 'Held · different goal';

  return (
    <div className="space-y-4">
      <Section title="Identity">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`manage-name-${portfolio.id}`}>Name</Label>
            <Input
              id={`manage-name-${portfolio.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
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
            <p className="text-2xs text-muted-foreground">
              Prices this portfolio on {metric.resultLabel} ({metric.costLabel}).
            </p>
            {objectiveChanged && affectedAdsets.length > 0 ? (
              <p className="text-2xs text-warning">
                {affectedAdsets.length} of {enrolledIds.length} enrolled ad sets buy a different
                result and will be held ({mismatchLabel}) until moved.
              </p>
            ) : null}
          </div>
        </div>
      </Section>

      <Section title="Strategy">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            <p className="text-2xs text-muted-foreground">{modeExplainer(mode)}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Autonomy tier</Label>
            <Select
              value={applyMode}
              onValueChange={(value) => handleApplyModeChange(value as ApplyMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLY_MODES.map((value) => (
                  <SelectItem
                    key={value}
                    value={value}
                    disabled={value === 'autopilot' && !guardrailsReady}
                  >
                    {applyModePill(value)?.label ?? humanize(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* applyModeExplainer describes the selected tier and re-runs as the select changes. */}
            <p className="text-2xs text-muted-foreground">{applyModeExplainer(applyMode)}</p>
            {!guardrailsReady && applyMode !== 'autopilot' ? (
              <p className="text-2xs text-muted-foreground">
                Set both autopilot guardrails below to enable autopilot.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`manage-daily-${portfolio.id}`}>Daily budget ({symbol})</Label>
            <Input
              id={`manage-daily-${portfolio.id}`}
              inputMode="decimal"
              value={dailyTotal}
              onChange={(event) => setDailyTotal(event.target.value)}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Autopilot guardrails"
        description="Both are required to turn autopilot on. They bound autonomous budget writes: a change over the % cap is held for your approval instead of being auto-applied."
        action={
          portfolio.apply_mode === 'autopilot' || applyMode === 'autopilot' ? (
            <Button
              type="button"
              variant={isPaused ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              disabled={setPaused.isPending || portfolio.apply_mode !== 'autopilot'}
              onClick={() =>
                setPaused.mutate({
                  portfolio_id: portfolio.id,
                  paused: !isPaused,
                  reason: isPaused ? undefined : 'Stopped from Manage panel',
                })
              }
            >
              {setPaused.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isPaused ? (
                <Play className="size-3.5" />
              ) : (
                <Pause className="size-3.5" />
              )}
              {isPaused ? 'Resume' : 'Stop'}
            </Button>
          ) : null
        }
      >
        {isPaused && portfolio.apply_mode === 'autopilot' ? (
          <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-2xs text-amber-600 dark:text-amber-400">
            Stopped — no autonomous budget writes until you resume. Ingest and scoring still run.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`manage-maxdaily-${portfolio.id}`}>
              Max autopilot spend/day ({symbol})
            </Label>
            <Input
              id={`manage-maxdaily-${portfolio.id}`}
              inputMode="decimal"
              value={maxDailyApply}
              onChange={(event) => setMaxDailyApply(event.target.value)}
              placeholder={
                portfolio.max_daily_apply_minor ? 'leave blank to keep' : 'required for autopilot'
              }
            />
            {hasDaily ? (
              <SuggestionChip
                label={`Suggest ${symbol}${Math.round(dailyNum * 1.5).toLocaleString('en-US')}`}
                onClick={() => setMaxDailyApply(String(Math.round(dailyNum * 1.5)))}
              />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`manage-maxpct-${portfolio.id}`}>Max change per cycle (%)</Label>
            <Input
              id={`manage-maxpct-${portfolio.id}`}
              inputMode="decimal"
              value={maxChangePct}
              onChange={(event) => setMaxChangePct(event.target.value)}
              placeholder={
                portfolio.max_change_pct_per_cycle
                  ? 'leave blank to keep'
                  : 'required · larger changes held for approval'
              }
            />
            <SuggestionChip label="Suggest 20%" onClick={() => setMaxChangePct('20')} />
          </div>
        </div>
      </Section>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs font-semibold tracking-tight"
          >
            Advanced
            <ChevronDown
              className={cn('size-4 transition-transform', advancedOpen && 'rotate-180')}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`manage-cpa-${portfolio.id}`}>
              {metric.targetLabel} ({symbol})
            </Label>
            <Input
              id={`manage-cpa-${portfolio.id}`}
              inputMode="decimal"
              value={cpaTarget}
              onChange={(event) => setCpaTarget(event.target.value)}
              placeholder="leave blank to keep"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`manage-period-${portfolio.id}`}>Period budget ({symbol})</Label>
            <Input
              id={`manage-period-${portfolio.id}`}
              inputMode="decimal"
              value={periodBudget}
              onChange={(event) => setPeriodBudget(event.target.value)}
              placeholder="leave blank to keep"
            />
            <p className="text-2xs text-muted-foreground">
              Sets the pacing target. Blank estimates it from the daily budget.
            </p>
            {hasDaily ? (
              <SuggestionChip
                label={`Suggest ${symbol}${Math.round(dailyNum * PACING_PERIOD_DAYS).toLocaleString('en-US')} (${PACING_PERIOD_DAYS}d)`}
                onClick={() => setPeriodBudget(String(Math.round(dailyNum * PACING_PERIOD_DAYS)))}
              />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`manage-velocity-${portfolio.id}`}>Max move per ad set/cycle (%)</Label>
            <Input
              id={`manage-velocity-${portfolio.id}`}
              inputMode="decimal"
              value={velocityCap}
              onChange={(event) => setVelocityCap(event.target.value)}
              placeholder="leave blank to keep"
            />
            <p className="text-2xs text-muted-foreground">
              Caps how far any single ad set&rsquo;s budget can move in one cycle.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog
        open={pendingAutopilot}
        onOpenChange={(open) => {
          if (!open) setPendingAutopilot(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn on autopilot for “{portfolio.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Autopilot begins writing real budgets to Meta on every cycle, within your guardrails.
              Every change is logged and audited, and you can pause it instantly from this panel. It
              takes effect when you save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAutopilot(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setApplyMode('autopilot');
                setPendingAutopilot(false);
              }}
            >
              Turn on autopilot
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showObjectiveConfirm}
        onOpenChange={(open) => {
          if (!open) setShowObjectiveConfirm(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change objective to {humanize(objective)}?</AlertDialogTitle>
            <AlertDialogDescription>
              {affectedAdsets.length} of {enrolledIds.length} enrolled ad sets buy a different
              result than {metric.resultLabel}. They will stop matching this KPI and be held (
              {mismatchLabel}) until you move them to a portfolio that measures what they buy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowObjectiveConfirm(false);
                void performSave();
              }}
            >
              Change objective &amp; save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-1.5">
        <Label>{level === 'campaign' ? 'Enrolled campaigns' : 'Enrolled ad sets'}</Label>
        <CampaignAdsetPicker
          snapshots={snapshotsRead.data}
          selectedAdsetIds={selectedAdsetIds}
          onChange={setSelection}
          brandId={brandId}
          accountId={adAccountId}
          currency={currency}
          disabled={saving}
          isLoading={snapshotsRead.isLoading || enrolledRead.isLoading}
          isError={snapshotsRead.isError}
          mode={level}
        />
        {toAdd.length > 0 || toRemove.length > 0 ? (
          <p className="text-2xs text-muted-foreground">
            {toAdd.length > 0 ? `+${toAdd.length} to add` : ''}
            {toAdd.length > 0 && toRemove.length > 0 ? ' · ' : ''}
            {toRemove.length > 0 ? `−${toRemove.length} to remove` : ''}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive">
              <Archive className="size-3.5" />
              Archive
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive “{portfolio.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                It stops running cycles and leaves your list, but its history is kept — you can
                restore it later from Archived.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onDone?.()}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!hasChanges || saving}
            onClick={handleSaveClick}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A labeled config group. The header carries an optional right-aligned action + description. */
function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-tight">{title}</p>
          {description ? (
            <p className="mt-0.5 text-2xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** A one-click default: fills the adjacent input with a suggested value. The input still owns
 *  the value, so the operator keeps control. */
function SuggestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-3xs text-muted-foreground transition-colors hover:bg-muted"
    >
      {label}
    </button>
  );
}
