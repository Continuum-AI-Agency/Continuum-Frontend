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
  type AdSetSnapshot,
  type ApplyMode,
  type BudgetSource,
  getOptimizationMetricDefinition,
  LOOKBACK_LABEL,
  LOOKBACK_WINDOWS,
  type LookbackWindow,
  type OptimizationModeDto,
  type OptimizationObjective,
  OptimizationObjectiveSchema,
  type PortfolioLevel,
  type PortfolioListItem,
  recommendLookbackWindow,
  toMinorUnits,
  type UpdatePortfolioPatch,
} from '@continuum/contracts';
import { Archive, ChevronDown, Loader2, Pause, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DateRangeField, type DateRangeValue } from '@/components/shared/DateRangeField';
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
import { currencySymbol, formatCurrency, humanize } from '../format';
import { CampaignAdsetPicker } from '../picker/CampaignAdsetPicker';
import { buildClaimMap, previewMoves } from '../picker/campaignGroups';
import { buildPortfolioPickerEntities } from '../picker/portfolioPickerEntities';
import { applyModeExplainer, applyModePill, freezeLabel } from '../reportModel';
import { acceptSuggestionOnTab, suggestionPlaceholder } from '../suggestInput';
import {
  useOptimizerAccountEnrollments,
  useOptimizerAccountSnapshots,
  useOptimizerAdsetInventory,
  useOptimizerEnrolledAdsets,
  useOptimizerMutations,
} from '../useOptimizerData';

const MODES: OptimizationModeDto[] = ['efficiency', 'balanced', 'scale'];
/** Bottom → top: observe (no Meta writes) · recommend (human apply) · autopilot. */
const APPLY_MODES: ApplyMode[] = ['observe', 'recommend', 'autopilot'];
const OBJECTIVES = OptimizationObjectiveSchema.options;
/** The period the pacing gauge estimates against when no period budget is set. */
const PACING_PERIOD_DAYS = 30;
const SUGGESTED_MAX_CHANGE_PCT = '20';

/** A flight window of `days` starting today, as plain ISO dates. Built in UTC so the start
 *  date is the day the operator sees, not a timezone-shifted neighbour. */
export function nextFlightWindow(days: number, today = new Date()): DateRangeValue {
  const start = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const end = new Date(start.getTime() + (days - 1) * 86_400_000);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return { from: iso(start), to: iso(end) };
}

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

/** Enrolled entities the optimizer can no longer find on Meta — paused, deleted, or flipped
 *  to CBO in Ads Manager. They stay enrolled on purpose: releasing a claim frees it for
 *  another portfolio and changes what the optimizer spends against, so it is a human call.
 *  Without this the roster reads "13 ad sets" while the cycle scores 2, and the operator has
 *  no way to know which. Deselecting a row in the picker above and saving releases it. */
export function DriftedEnrollments({
  rows,
}: {
  rows: { adset_id: string; adset_name: string | null; missing_since?: string | null }[];
}) {
  const drifted = rows.filter((row) => Boolean(row.missing_since));
  if (drifted.length === 0) return null;
  const label = drifted.length === 1 ? 'ad set is' : 'ad sets are';
  return (
    <div
      className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-2xs"
      role="status"
    >
      <p className="font-medium text-warning">
        {drifted.length} enrolled {label} no longer active on Meta
      </p>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {drifted.slice(0, 5).map((row) => (
          <li key={row.adset_id}>
            {row.adset_name ?? row.adset_id}
            {row.missing_since ? ` — since ${row.missing_since.slice(0, 10)}` : ''}
          </li>
        ))}
      </ul>
      {drifted.length > 5 ? (
        <p className="mt-1 text-muted-foreground">+{drifted.length - 5} more</p>
      ) : null}
      <p className="mt-1 text-muted-foreground">
        They still hold their enrollment. Deselect them above and save to release them.
      </p>
    </div>
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
  const inventoryRead = useOptimizerAdsetInventory(brandId, adAccountId, level === 'adset');
  // Who else holds each ad set's single active enrollment. Drives the picker's "In: X" badge
  // and the move confirmation, so a claimed ad set is a disclosed decision rather than a 409.
  const accountEnrollmentsRead = useOptimizerAccountEnrollments(brandId, adAccountId);
  const claims = useMemo(
    () => buildClaimMap(accountEnrollmentsRead.data, portfolio.id),
    [accountEnrollmentsRead.data, portfolio.id],
  );

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
  const [budgetSource, setBudgetSource] = useState<BudgetSource>(
    portfolio.budget_source === 'fixed' ? 'fixed' : 'observed',
  );
  const [lookbackWindow, setLookbackWindow] = useState<LookbackWindow>(
    LOOKBACK_WINDOWS.includes(portfolio.lookback_window as LookbackWindow)
      ? (portfolio.lookback_window as LookbackWindow)
      : 'd14',
  );
  const [flight, setFlight] = useState<DateRangeValue>({
    from: portfolio.period_start ?? null,
    to: portfolio.period_end ?? null,
  });
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
  const pickerEntities = useMemo(
    () =>
      level === 'adset'
        ? buildPortfolioPickerEntities({
            snapshots: snapshotsRead.data,
            inventory: inventoryRead.data,
            enrolled: enrolledRead.data,
          })
        : snapshotsRead.data,
    [enrolledRead.data, inventoryRead.data, level, snapshotsRead.data],
  );

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
    if (budgetSource !== (portfolio.budget_source ?? 'observed')) next.budget_source = budgetSource;
    if (lookbackWindow !== (portfolio.lookback_window ?? 'd14')) {
      next.lookback_window = lookbackWindow;
    }
    // null clears a flight date (back to unpaced); undefined leaves it untouched.
    if (flight.from !== (portfolio.period_start ?? null)) next.period_start = flight.from;
    if (flight.to !== (portfolio.period_end ?? null)) next.period_end = flight.to;
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
    budgetSource,
    lookbackWindow,
    flight,
    portfolio,
    currency,
    metric.denominatorMultiplier,
  ]);

  // The live sum of the SELECTED ad sets' budgets — what an 'observed' portfolio actually
  // reallocates within, and the number the daily-budget field should be pinned to if a human
  // wants a fixed target that matches reality today.
  const selectedBudgetSum = useMemo(() => {
    const selected = new Set(selectedAdsetIds);
    return pickerEntities
      .filter((entity) => selected.has(entity.id))
      .reduce((sum, entity) => sum + (entity.currentBudget ?? 0), 0);
  }, [pickerEntities, selectedAdsetIds]);

  const lookbackHint = useMemo(
    () =>
      recommendLookbackWindow(
        snapshotsRead.data.filter((snapshot) => selectedAdsetIds.includes(snapshot.id)),
        metric.kpiField as keyof AdSetSnapshot['windows']['d14'],
        metric.resultLabel.toLowerCase(),
      ),
    [snapshotsRead.data, selectedAdsetIds, metric.kpiField, metric.resultLabel],
  );

  const [showMoveConfirm, setShowMoveConfirm] = useState(false);

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

  // Which ad sets this save would take from other portfolios, and who loses them.
  const pendingMoves = useMemo(() => previewMoves(toAdd, claims), [toAdd, claims]);

  async function performSave() {
    if (!hasChanges || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (Object.keys(patch).length > 0) {
        await update.mutateAsync({ portfolio_id: portfolio.id, patch });
      }
      if (toAdd.length > 0) {
        const nameById = new Map(pickerEntities.map((entity) => [entity.id, entity.name]));
        const adset_names: Record<string, string> = {};
        for (const id of toAdd) {
          const name = nameById.get(id);
          if (name && name.trim().length > 0) adset_names[id] = name;
        }
        await enroll.mutateAsync({
          portfolio_id: portfolio.id,
          adset_ids: toAdd,
          ...(Object.keys(adset_names).length > 0 ? { adset_names } : {}),
        });
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

  // Two consequences need saying out loud before the write. Changing the objective freezes
  // mismatched ad sets; enrolling a claimed ad set REMOVES it from another portfolio (the DB
  // allows exactly one active enrollment). Objective first — it is the more destructive of
  // the two, and the move dialog names the portfolios that lose ad sets either way.
  function handleSaveClick() {
    if (!hasChanges || saving) return;
    if (objectiveChanged && affectedAdsets.length > 0) {
      setShowObjectiveConfirm(true);
      return;
    }
    if (pendingMoves.length > 0) {
      setShowMoveConfirm(true);
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

  // One definition per field, shared by the chip and the Tab accelerator so the value the
  // chip advertises is exactly the value Tab fills in.
  const suggestedDaily =
    budgetSource === 'fixed' && selectedBudgetSum > 0 ? Math.round(selectedBudgetSum) : null;
  const suggestedMaxDaily = hasDaily ? Math.round(dailyNum * 1.5) : null;
  const suggestedPeriod = hasDaily ? Math.round(dailyNum * PACING_PERIOD_DAYS) : null;

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
            <Label htmlFor={`manage-budget-source-${portfolio.id}`}>Total budget</Label>
            <Select
              onValueChange={(value) => setBudgetSource(value as BudgetSource)}
              value={budgetSource}
            >
              <SelectTrigger id={`manage-budget-source-${portfolio.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="observed">Match current spend</SelectItem>
                <SelectItem value="fixed">Fixed daily target</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-2xs text-muted-foreground">
              {budgetSource === 'observed'
                ? 'Reallocates within whatever the enrolled ad sets are spending now — increases and decreases cancel out.'
                : 'Drives the portfolio toward the daily budget below, so the total can go up or down.'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`manage-daily-${portfolio.id}`}>Daily budget ({symbol})</Label>
            <Input
              disabled={budgetSource === 'observed'}
              id={`manage-daily-${portfolio.id}`}
              inputMode="decimal"
              onChange={(event) => setDailyTotal(event.target.value)}
              onKeyDown={acceptSuggestionOnTab(suggestedDaily, setDailyTotal)}
              placeholder={suggestionPlaceholder(suggestedDaily, '')}
              value={dailyTotal}
            />
            {/* The one field that must track the enrolled roster had the least help: nothing
                re-derived it when the picker changed membership, so a portfolio kept
                conserving a months-old sum. */}
            {suggestedDaily != null ? (
              <SuggestionChip
                label={`Match current ${symbol}${suggestedDaily.toLocaleString('en-US')}/day`}
                onClick={() => setDailyTotal(String(suggestedDaily))}
              />
            ) : null}
            {budgetSource === 'observed' && selectedBudgetSum > 0 ? (
              <p className="text-2xs text-muted-foreground tabular-nums">
                Currently {formatCurrency(selectedBudgetSum, currency)}/day across{' '}
                {selectedAdsetIds.length} {selectedAdsetIds.length === 1 ? 'ad set' : 'ad sets'}.
              </p>
            ) : null}
          </div>
        </div>
      </Section>

      <Section
        description="What period the optimizer reads and plans against. The lookback drives every metric on this portfolio; the flight window turns the period budget into real pacing instead of an estimate."
        title="Reporting period"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`manage-lookback-${portfolio.id}`}>Lookback window</Label>
            <Select
              onValueChange={(value) => setLookbackWindow(value as LookbackWindow)}
              value={lookbackWindow}
            >
              <SelectTrigger id={`manage-lookback-${portfolio.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOOKBACK_WINDOWS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {LOOKBACK_LABEL[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-2xs text-muted-foreground">{lookbackHint.reason}</p>
            {lookbackHint.window !== lookbackWindow ? (
              <SuggestionChip
                label={`Use ${LOOKBACK_LABEL[lookbackHint.window]}`}
                onClick={() => setLookbackWindow(lookbackHint.window)}
              />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`manage-flight-${portfolio.id}`}>Flight window</Label>
            <DateRangeField
              disabled={saving}
              id={`manage-flight-${portfolio.id}`}
              onChange={setFlight}
              placeholder="No flight window"
              value={flight}
            />
            <p className="text-2xs text-muted-foreground">
              {flight.from && flight.to
                ? 'The period budget paces against these dates.'
                : 'Set start and end dates to pace against the period budget.'}
            </p>
            {!(flight.from && flight.to) ? (
              <SuggestionChip
                label={`Suggest next ${PACING_PERIOD_DAYS} days`}
                onClick={() => setFlight(nextFlightWindow(PACING_PERIOD_DAYS))}
              />
            ) : null}
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
              onKeyDown={acceptSuggestionOnTab(suggestedMaxDaily, setMaxDailyApply)}
              placeholder={suggestionPlaceholder(
                suggestedMaxDaily,
                portfolio.max_daily_apply_minor ? 'leave blank to keep' : 'required for autopilot',
              )}
            />
            {suggestedMaxDaily != null ? (
              <SuggestionChip
                label={`Suggest ${symbol}${suggestedMaxDaily.toLocaleString('en-US')}`}
                onClick={() => setMaxDailyApply(String(suggestedMaxDaily))}
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
              onKeyDown={acceptSuggestionOnTab(SUGGESTED_MAX_CHANGE_PCT, setMaxChangePct)}
              placeholder={
                portfolio.max_change_pct_per_cycle
                  ? 'leave blank to keep'
                  : 'required · larger changes held for approval'
              }
            />
            <SuggestionChip
              label={`Suggest ${SUGGESTED_MAX_CHANGE_PCT}%`}
              onClick={() => setMaxChangePct(SUGGESTED_MAX_CHANGE_PCT)}
            />
          </div>
        </div>
      </Section>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs font-semibold tracking-tight"
            >
              Advanced
              <ChevronDown
                className={cn('size-4 transition-transform', advancedOpen && 'rotate-180')}
              />
            </button>
          }
        />
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
              onKeyDown={acceptSuggestionOnTab(suggestedPeriod, setPeriodBudget)}
              placeholder={suggestionPlaceholder(suggestedPeriod, 'leave blank to keep')}
            />
            <p className="text-2xs text-muted-foreground">
              Sets the pacing target. Blank estimates it from the daily budget.
            </p>
            {suggestedPeriod != null ? (
              <SuggestionChip
                label={`Suggest ${symbol}${suggestedPeriod.toLocaleString('en-US')} (${PACING_PERIOD_DAYS}d)`}
                onClick={() => setPeriodBudget(String(suggestedPeriod))}
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
                if (pendingMoves.length > 0) {
                  setShowMoveConfirm(true);
                  return;
                }
                void performSave();
              }}
            >
              Change objective &amp; save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setShowMoveConfirm(false);
        }}
        open={showMoveConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move {toAdd.length === 1 ? 'this ad set' : 'these ad sets'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              An ad set can only be optimized by one portfolio at a time, so enrolling these removes
              them from where they are now. Their budgets stay exactly as Meta has them — only who
              reallocates them changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {pendingMoves.map((move) => (
              <li key={move.portfolioName}>
                <span className="font-medium text-foreground">{move.adsetIds.length}</span>{' '}
                {move.adsetIds.length === 1 ? 'ad set' : 'ad sets'} out of{' '}
                <span className="font-medium text-foreground">{move.portfolioName}</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowMoveConfirm(false);
                void performSave();
              }}
            >
              Move &amp; save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-1.5">
        <Label>{level === 'campaign' ? 'Enrolled campaigns' : 'Enrolled ad sets'}</Label>
        <CampaignAdsetPicker
          entities={pickerEntities}
          selectedAdsetIds={selectedAdsetIds}
          onChange={setSelection}
          brandId={brandId}
          accountId={adAccountId}
          currency={currency}
          disabled={saving}
          isLoading={
            snapshotsRead.isLoading ||
            enrolledRead.isLoading ||
            (level === 'adset' && inventoryRead.isLoading)
          }
          isError={snapshotsRead.isError}
          mode={level}
          inventoryFreshness={
            level === 'adset'
              ? {
                  fetchedAt: inventoryRead.fetchedAt,
                  refresh: inventoryRead.refresh,
                  canRefresh: inventoryRead.canRefresh,
                  isRefreshing: inventoryRead.isRefreshing,
                  partial: inventoryRead.partial,
                  truncated: inventoryRead.truncated,
                  isError: inventoryRead.isError,
                }
              : undefined
          }
        />
        {toAdd.length > 0 || toRemove.length > 0 ? (
          <p className="text-2xs text-muted-foreground">
            {toAdd.length > 0 ? `+${toAdd.length} to add` : ''}
            {toAdd.length > 0 && toRemove.length > 0 ? ' · ' : ''}
            {toRemove.length > 0 ? `−${toRemove.length} to remove` : ''}
          </p>
        ) : null}
        <DriftedEnrollments rows={enrolledRead.data} />
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive">
                <Archive className="size-3.5" />
                Archive
              </Button>
            }
          />
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
 *  the value, so the operator keeps control. The Tab glyph advertises the keyboard path —
 *  pressing Tab in the (empty) field it sits under fills the same value. */
function SuggestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-3xs text-muted-foreground transition-colors hover:bg-muted"
    >
      {label}
      <span aria-hidden="true" className="rounded border border-border/70 bg-background px-1">
        ⇥
      </span>
    </button>
  );
}
