'use client';

// Inline management for one portfolio, organized into slot-in sections: Identity (name +
// objective), Strategy (mode + autonomy tier + daily budget), Reporting period, Guardrails
// (autopilot caps + kill-switch), an Advanced disclosure (target + period budget + velocity
// cap), and the enrolled campaign→ad-set picker.
//
// This is the screen an operator arms AUTOPILOT from, so two things are load-bearing:
//
//  1. EVERY field shows the value the portfolio is running today. There is no
//     blank-means-keep sentinel. A money guardrail whose current cap is a placeholder is a
//     guardrail the operator cannot check, and the two autopilot caps were exactly that.
//     Seeding + dirty-field tracking is React Hook Form's job; the resolver is derived from
//     the service's own UpdatePortfolioPatchSchema, and every unit conversion lives in ONE
//     descriptor per field (./portfolioFields).
//
//  2. Arming autopilot is STAGED: set both caps → preview what autopilot would have done →
//     arm. The preview runs the REAL engine through the read-only /cycle/preview edge; only
//     the two guardrail comparisons are local (./autopilotForecast). Nothing here writes to
//     Meta.
//
// Objective is EDITABLE. Changing it changes the KPI the portfolio prices, so enrolled ad
// sets buying a different result stop matching and freeze as kpi_mismatch — the panel counts
// them and asks for confirmation before saving that change.

import {
  type AdSetSnapshot,
  type ApplyMode,
  type BudgetSource,
  type CycleItemRow,
  type CyclePreviewItem,
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
} from '@continuum/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, ChevronDown, Loader2, Pause, Play, SparklesIcon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { type Control, useController, useForm } from 'react-hook-form';
import { DateRangeField } from '@/components/shared/DateRangeField';
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
import { ReallocationFlow } from '../charts/ReallocationFlow';
import { currencySymbol, formatCurrency, humanize } from '../format';
import { CampaignAdsetPicker } from '../picker/CampaignAdsetPicker';
import { buildClaimMap, previewMoves } from '../picker/campaignGroups';
import { buildPortfolioPickerEntities } from '../picker/portfolioPickerEntities';
import { applyModeExplainer, applyModePill, freezeLabel, parseReport } from '../reportModel';
import { acceptSuggestionOnTab, suggestionPlaceholder } from '../suggestInput';
import {
  useCyclePreview,
  useOptimizerAccountEnrollments,
  useOptimizerAccountSnapshots,
  useOptimizerAdsetInventory,
  useOptimizerEnrolledAdsets,
  useOptimizerMutations,
  useOptimizerPerformance,
} from '../useOptimizerData';
import { type AutopilotForecast, forecastAutopilot } from './autopilotForecast';
import {
  buildPatch,
  createPortfolioFormSchema,
  type NumericFieldKey,
  type PortfolioCurrentValues,
  type PortfolioFormPatch,
  type PortfolioFormValues,
  toFormValues,
  toInput,
  toStored,
  type UnitContext,
} from './portfolioFields';

const MODES: OptimizationModeDto[] = ['efficiency', 'balanced', 'scale'];
/** Bottom → top: observe (no Meta writes) · recommend (human apply) · autopilot. */
const APPLY_MODES: ApplyMode[] = ['observe', 'recommend', 'autopilot'];
const OBJECTIVES = OptimizationObjectiveSchema.options;
/** The period the pacing gauge estimates against when no period budget is set. */
const PACING_PERIOD_DAYS = 30;
const SUGGESTED_MAX_CHANGE_PCT = '20';

/** A flight window of `days` starting today, as plain ISO dates. Built in UTC so the start
 *  date is the day the operator sees, not a timezone-shifted neighbour. */
export function nextFlightWindow(days: number, today = new Date()): { from: string; to: string } {
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
  // cpa_target and velocity_cap_pct are NOT on the list row (optimizer_list_portfolios does
  // not return cpa_target at all) — they live on the portfolio row inside the performance
  // report. This is the same cached query the workspace around this panel already runs, so
  // seeding those two fields from their real values costs no extra read.
  const performanceRead = useOptimizerPerformance(portfolio.id);
  const portfolioRow = useMemo(
    () => parseReport(performanceRead.data)?.portfolio ?? null,
    [performanceRead.data],
  );
  const claims = useMemo(
    () => buildClaimMap(accountEnrollmentsRead.data, portfolio.id),
    [accountEnrollmentsRead.data, portfolio.id],
  );

  const currentValues = useMemo<PortfolioCurrentValues>(
    () => ({
      name: portfolio.name,
      objective: portfolio.objective,
      mode: portfolio.mode,
      apply_mode: portfolio.apply_mode,
      budget_source: portfolio.budget_source === 'fixed' ? 'fixed' : 'observed',
      lookback_window: LOOKBACK_WINDOWS.includes(portfolio.lookback_window as LookbackWindow)
        ? portfolio.lookback_window
        : 'd14',
      period_start: portfolio.period_start,
      period_end: portfolio.period_end,
      daily_total: portfolio.daily_total,
      period_budget: portfolio.period_budget,
      cpa_target: portfolioRow?.cpa_target ?? null,
      velocity_cap_pct: portfolioRow?.velocity_cap_pct ?? null,
      max_daily_apply_minor: portfolio.max_daily_apply_minor,
      max_change_pct_per_cycle: portfolio.max_change_pct_per_cycle,
    }),
    [portfolio, portfolioRow],
  );

  // The seed is read in the STORED objective's unit — that is the unit the stored cpa_target
  // was written in. Keeping it independent of the selected objective is also what stops the
  // `values` identity from churning as the objective select changes.
  const seedUnit = useMemo<UnitContext>(
    () => ({
      currency,
      denominatorMultiplier: getOptimizationMetricDefinition(
        portfolio.objective as OptimizationObjective,
      ).denominatorMultiplier,
    }),
    [currency, portfolio.objective],
  );
  const seededValues = useMemo(
    () => toFormValues(currentValues, seedUnit),
    [currentValues, seedUnit],
  );

  // The conversion context the RESOLVER reads, updated below once the selected objective is
  // known. It has to be a getter: cpa_target is priced in the selected objective's unit, and
  // that value lives in the very form this schema is used to build.
  const formUnitRef = useRef<UnitContext>(seedUnit);
  const schema = useMemo(
    () => createPortfolioFormSchema(() => formUnitRef.current, currentValues),
    [currentValues],
  );

  const form = useForm<PortfolioFormValues, unknown, PortfolioFormPatch>({
    resolver: zodResolver(schema),
    defaultValues: seededValues,
    // The report read lands after mount; `values` re-seeds the untouched fields from it
    // without discarding anything the operator has already changed.
    values: seededValues,
    resetOptions: { keepDirtyValues: true },
  });
  const values = form.watch();

  const objective = values.objective as OptimizationObjective;
  const applyMode = values.apply_mode as ApplyMode;
  const budgetSource = values.budget_source as BudgetSource;
  const lookbackWindow = values.lookback_window as LookbackWindow;
  // Metric follows the SELECTED objective so the target label + its unit conversion track it.
  const metric = getOptimizationMetricDefinition(objective);
  const formUnit = useMemo<UnitContext>(
    () => ({ currency, denominatorMultiplier: metric.denominatorMultiplier }),
    [currency, metric.denominatorMultiplier],
  );
  formUnitRef.current = formUnit;

  // Live reads of the two guardrails, through the SAME descriptor the resolver uses — the
  // gate below and the value submitted can never disagree about what "20" means.
  const capMinor = toStored('max_daily_apply_minor', values.max_daily_apply_minor, formUnit);
  const capPct = toStored('max_change_pct_per_cycle', values.max_change_pct_per_cycle, formUnit);
  const dailyNum = toStored('daily_total', values.daily_total, formUnit) ?? 0;

  const enrolledIds = useMemo(
    () => enrolledRead.data.map((row) => row.adset_id),
    [enrolledRead.data],
  );
  // null until the operator first touches the picker — before that the enrolled roster is
  // the selection (kept reactive as the async read resolves).
  const [selection, setSelection] = useState<string[] | null>(null);
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

  const [pendingAutopilot, setPendingAutopilot] = useState(false);
  const [showObjectiveConfirm, setShowObjectiveConfirm] = useState(false);
  const [showMoveConfirm, setShowMoveConfirm] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // The operator has opened the staged arming flow. Also what makes the guardrail section
  // reachable on a portfolio that is not on autopilot — see `guardrailsRelevant`.
  const [arming, setArming] = useState(false);
  const isPaused = Boolean(portfolio.autopilot_paused);

  // Autopilot writes real budgets to Meta, and the apply layer reads an absent cap as
  // UNCAPPED — so it may only be armed once BOTH guardrails are set and positive. The DB
  // refuses the flip too (optimizer_portfolios_autopilot_guardrails_chk); this keeps the user
  // from reaching a save that would only fail.
  const guardrailsReady = Boolean(capMinor && capMinor > 0 && capPct && capPct > 0);
  const isArmed = applyMode === 'autopilot';
  // Rendered only when it is about to matter: the portfolio runs on autopilot, the form has
  // selected it, or the operator opened the staged arming flow.
  const guardrailsRelevant = portfolio.apply_mode === 'autopilot' || isArmed || arming;

  // Flip to autopilot only through the staged flow; every other transition is immediate.
  function handleApplyModeChange(value: ApplyMode) {
    if (value === 'autopilot' && !isArmed) {
      if (!guardrailsReady) return;
      setArming(true);
      return;
    }
    form.setValue('apply_mode', value, { shouldDirty: true });
  }

  const { toAdd, toRemove } = useMemo(() => {
    const enrolledSet = new Set(enrolledIds);
    const selectedSet = new Set(selectedAdsetIds);
    return {
      toAdd: selectedAdsetIds.filter((id) => !enrolledSet.has(id)),
      toRemove: enrolledIds.filter((id) => !selectedSet.has(id)),
    };
  }, [enrolledIds, selectedAdsetIds]);

  const hasChanges = form.formState.isDirty || toAdd.length > 0 || toRemove.length > 0;
  const saving =
    form.formState.isSubmitting || update.isPending || enroll.isPending || unenroll.isPending;

  // Which ad sets this save would take from other portfolios, and who loses them.
  const pendingMoves = useMemo(() => previewMoves(toAdd, claims), [toAdd, claims]);

  // The values a confirm dialog is holding: validated and already in contract units, so the
  // dialog's action performs exactly the save the operator was shown.
  const confirmedValues = useRef<PortfolioFormPatch | null>(null);

  async function performSave(patchValues: PortfolioFormPatch) {
    const patch = buildPatch(patchValues, form.formState.dirtyFields);
    form.clearErrors('root');
    try {
      if (Object.keys(patch).length > 0) {
        await update.mutateAsync({ portfolio_id: portfolio.id, patch });
      }
      if (toAdd.length > 0) {
        const nameById = new Map(pickerEntities.map((entity) => [entity.id, entity.name]));
        const adset_names: Record<string, string> = {};
        for (const id of toAdd) {
          const entityName = nameById.get(id);
          if (entityName && entityName.trim().length > 0) adset_names[id] = entityName;
        }
        await enroll.mutateAsync({
          portfolio_id: portfolio.id,
          adset_ids: toAdd,
          ...(Object.keys(adset_names).length > 0 ? { adset_names } : {}),
        });
      }
      // Sequential, not Promise.all: one rejection out of N then names the ad set that
      // actually failed instead of whichever race lost.
      for (const adsetId of toRemove) {
        await unenroll.mutateAsync({ portfolio_id: portfolio.id, adset_id: adsetId });
      }
      onDone?.();
    } catch (err) {
      form.setError('root', {
        message: err instanceof Error ? err.message : 'Could not save your changes.',
      });
    }
  }

  // Two consequences need saying out loud before the write. Changing the objective freezes
  // mismatched ad sets; enrolling a claimed ad set REMOVES it from another portfolio (the DB
  // allows exactly one active enrollment). Objective first — it is the more destructive of
  // the two, and the move dialog names the portfolios that lose ad sets either way.
  const submit = form.handleSubmit(async (patchValues) => {
    if (!hasChanges) return;
    confirmedValues.current = patchValues;
    if (objectiveChanged && affectedAdsets.length > 0) {
      setShowObjectiveConfirm(true);
      return;
    }
    if (pendingMoves.length > 0) {
      setShowMoveConfirm(true);
      return;
    }
    await performSave(patchValues);
  });

  function saveConfirmed() {
    const patchValues = confirmedValues.current;
    if (patchValues) void performSave(patchValues);
  }

  function handleArchive() {
    archive.mutate(portfolio.id, { onSuccess: () => onDone?.() });
  }

  const symbol = currencySymbol(currency);
  const hasDaily = dailyNum > 0;
  const mismatchLabel = freezeLabel('kpi_mismatch')?.label ?? 'Held · different goal';
  const rootError = form.formState.errors.root?.message;

  // One definition per field, shared by the chip and the Tab accelerator so the value the
  // chip advertises is exactly the value Tab fills in.
  const suggestedDaily =
    budgetSource === 'fixed' && selectedBudgetSum > 0 ? Math.round(selectedBudgetSum) : null;
  const suggestedMaxDaily = hasDaily ? Math.round(dailyNum * 1.5) : null;
  const suggestedPeriod = hasDaily ? Math.round(dailyNum * PACING_PERIOD_DAYS) : null;

  // What the staged preview scores: the selected roster, at the pool the cycle would run on.
  const previewSnapshots = useMemo(() => {
    const selected = new Set(selectedAdsetIds);
    return snapshotsRead.data.filter((snapshot) => selected.has(snapshot.id));
  }, [snapshotsRead.data, selectedAdsetIds]);
  const previewTotal =
    budgetSource === 'fixed' && dailyNum > 0 ? dailyNum : selectedBudgetSum || dailyNum;

  return (
    <div className="space-y-4">
      <Section title="Identity">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`manage-name-${portfolio.id}`}>Name</Label>
            <Input id={`manage-name-${portfolio.id}`} {...form.register('name')} />
            {form.formState.errors.name ? (
              <p className="text-2xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>Objective</Label>
            <Select
              value={objective}
              onValueChange={(value) =>
                form.setValue('objective', value as OptimizationObjective, { shouldDirty: true })
              }
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
            <Select
              value={values.mode}
              onValueChange={(value) =>
                form.setValue('mode', value as OptimizationModeDto, { shouldDirty: true })
              }
            >
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
            <p className="text-2xs text-muted-foreground">{modeExplainer(values.mode)}</p>
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
            {!guardrailsRelevant ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-1.5 text-2xs"
                onClick={() => setArming(true)}
              >
                <SparklesIcon aria-hidden="true" className="size-3" />
                Set up autopilot
              </Button>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`manage-budget-source-${portfolio.id}`}>Total budget</Label>
            <Select
              onValueChange={(value) =>
                form.setValue('budget_source', value as BudgetSource, { shouldDirty: true })
              }
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
          <NumberField
            control={form.control}
            disabled={budgetSource === 'observed'}
            id={`manage-daily-${portfolio.id}`}
            label={`Daily budget (${symbol})`}
            name="daily_total"
            suggested={suggestedDaily}
            suggestionLabel={
              suggestedDaily != null
                ? `Match current ${symbol}${suggestedDaily.toLocaleString('en-US')}/day`
                : undefined
            }
          >
            {/* The one field that must track the enrolled roster had the least help: nothing
                re-derived it when the picker changed membership, so a portfolio kept
                conserving a months-old sum. */}
            {budgetSource === 'observed' && selectedBudgetSum > 0 ? (
              <p className="text-2xs text-muted-foreground tabular-nums">
                Currently {formatCurrency(selectedBudgetSum, currency)}/day across{' '}
                {selectedAdsetIds.length} {selectedAdsetIds.length === 1 ? 'ad set' : 'ad sets'}.
              </p>
            ) : null}
          </NumberField>
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
              onValueChange={(value) =>
                form.setValue('lookback_window', value as LookbackWindow, { shouldDirty: true })
              }
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
                onClick={() =>
                  form.setValue('lookback_window', lookbackHint.window, { shouldDirty: true })
                }
              />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`manage-flight-${portfolio.id}`}>Flight window</Label>
            <DateRangeField
              disabled={saving}
              id={`manage-flight-${portfolio.id}`}
              onChange={(range) => {
                form.setValue('period_start', range.from, { shouldDirty: true });
                form.setValue('period_end', range.to, { shouldDirty: true });
              }}
              placeholder="No flight window"
              value={{ from: values.period_start ?? null, to: values.period_end ?? null }}
            />
            <p className="text-2xs text-muted-foreground">
              {values.period_start && values.period_end
                ? 'The period budget paces against these dates.'
                : 'Set start and end dates to pace against the period budget.'}
            </p>
            {!(values.period_start && values.period_end) ? (
              <SuggestionChip
                label={`Suggest next ${PACING_PERIOD_DAYS} days`}
                onClick={() => {
                  const range = nextFlightWindow(PACING_PERIOD_DAYS);
                  form.setValue('period_start', range.from, { shouldDirty: true });
                  form.setValue('period_end', range.to, { shouldDirty: true });
                }}
              />
            ) : null}
          </div>
        </div>
      </Section>

      {guardrailsRelevant ? (
        <Section
          title="Autopilot guardrails"
          description="Both are required to turn autopilot on. They bound autonomous budget writes: a change over the % cap is held for your approval instead of being auto-applied."
          action={
            portfolio.apply_mode === 'autopilot' || isArmed ? (
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
            <NumberField
              control={form.control}
              id={`manage-maxdaily-${portfolio.id}`}
              label={`Max autopilot spend/day (${symbol})`}
              name="max_daily_apply_minor"
              suggested={suggestedMaxDaily}
              suggestionLabel={
                suggestedMaxDaily != null
                  ? `Suggest ${symbol}${suggestedMaxDaily.toLocaleString('en-US')}`
                  : undefined
              }
            />
            <NumberField
              control={form.control}
              id={`manage-maxpct-${portfolio.id}`}
              label="Max change per cycle (%)"
              name="max_change_pct_per_cycle"
              suggested={SUGGESTED_MAX_CHANGE_PCT}
              suggestionLabel={`Suggest ${SUGGESTED_MAX_CHANGE_PCT}%`}
            />
          </div>

          {!isArmed ? (
            <ArmAutopilot
              // Remounting on any input to the forecast drops a stale preview: an operator
              // must never arm on a run that scored different caps or a different pool.
              key={`${capMinor}|${capPct}|${previewTotal}|${objective}|${values.mode}|${previewSnapshots.length}`}
              accountId={adAccountId}
              brandId={brandId}
              currency={currency ?? null}
              dailyTotal={previewTotal}
              maxChangePctPerCycle={capPct}
              maxDailyApplyMinor={capMinor}
              mode={values.mode as OptimizationModeDto}
              objective={objective}
              onArm={() => setPendingAutopilot(true)}
              snapshots={previewSnapshots}
              unit={formUnit}
            />
          ) : null}
        </Section>
      ) : null}

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
          <NumberField
            control={form.control}
            id={`manage-cpa-${portfolio.id}`}
            label={`${metric.targetLabel} (${symbol})`}
            name="cpa_target"
          />
          <NumberField
            control={form.control}
            id={`manage-period-${portfolio.id}`}
            label={`Period budget (${symbol})`}
            name="period_budget"
            suggested={suggestedPeriod}
            suggestionLabel={
              suggestedPeriod != null
                ? `Suggest ${symbol}${suggestedPeriod.toLocaleString('en-US')} (${PACING_PERIOD_DAYS}d)`
                : undefined
            }
          >
            <p className="text-2xs text-muted-foreground">
              Sets the pacing target. Clear it to estimate from the daily budget.
            </p>
          </NumberField>
          <NumberField
            control={form.control}
            id={`manage-velocity-${portfolio.id}`}
            label="Max move per ad set/cycle (%)"
            name="velocity_cap_pct"
          >
            <p className="text-2xs text-muted-foreground">
              Caps how far any single ad set&rsquo;s budget can move in one cycle.
            </p>
          </NumberField>
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
                form.setValue('apply_mode', 'autopilot', { shouldDirty: true });
                setPendingAutopilot(false);
                setArming(false);
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
                saveConfirmed();
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
                saveConfirmed();
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

      {rootError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {rootError}
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
            onClick={() => void submit()}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Step 2 and 3 of arming autopilot: run the cycle the operator is about to hand over, show
 *  what autopilot would have written and what it would have held, and only then offer the
 *  arm. The reallocation comes from the REAL engine (the read-only /cycle/preview edge,
 *  zero writes, no run row) — a client-side re-implementation would drift from what
 *  actually runs and mislead exactly the person who most needs the truth. */
function ArmAutopilot({
  accountId,
  brandId,
  currency,
  dailyTotal,
  maxChangePctPerCycle,
  maxDailyApplyMinor,
  mode,
  objective,
  onArm,
  snapshots,
  unit,
}: {
  accountId: string;
  brandId: string;
  currency: string | null;
  dailyTotal: number;
  maxChangePctPerCycle: number | null;
  maxDailyApplyMinor: number | null;
  mode: OptimizationModeDto;
  objective: OptimizationObjective;
  onArm: () => void;
  snapshots: AdSetSnapshot[];
  unit: UnitContext;
}) {
  const cyclePreview = useCyclePreview();
  const capsSet = Boolean(
    maxDailyApplyMinor &&
      maxDailyApplyMinor > 0 &&
      maxChangePctPerCycle &&
      maxChangePctPerCycle > 0,
  );
  const canPreview = capsSet && snapshots.length > 0 && dailyTotal > 0;
  const outcome = cyclePreview.data;
  const forecast =
    outcome?.status === 'ready' && maxDailyApplyMinor != null && maxChangePctPerCycle != null
      ? forecastAutopilot({
          items: outcome.preview.items,
          dailyTotal,
          currency,
          maxDailyApplyMinor,
          maxChangePctPerCycle,
        })
      : null;

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-background/60 p-3">
      <p className="text-2xs font-medium">
        {capsSet
          ? 'Both caps are set. Preview the cycle autopilot would run before you arm it.'
          : 'Set both caps above to preview what autopilot would do.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-2xs"
          disabled={!canPreview || cyclePreview.isPending}
          onClick={() =>
            cyclePreview.mutate({
              brandId,
              accountId,
              snapshots,
              objective,
              mode,
              total: dailyTotal,
            })
          }
        >
          {cyclePreview.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <SparklesIcon aria-hidden="true" className="size-3" />
          )}
          {cyclePreview.isPending ? 'Running the engine…' : 'Preview what autopilot would do'}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-2xs"
          disabled={outcome?.status !== 'ready'}
          onClick={onArm}
        >
          Arm autopilot
        </Button>
      </div>
      {capsSet && snapshots.length === 0 ? (
        <p className="text-2xs text-muted-foreground">
          Enroll at least one ad set below — there is nothing for autopilot to reallocate yet.
        </p>
      ) : null}
      {outcome?.status === 'unavailable' ? (
        <p className="text-2xs text-muted-foreground">
          The optimizer preview service isn&rsquo;t reachable for this account, so autopilot
          can&rsquo;t be previewed right now.
        </p>
      ) : null}
      {outcome?.status === 'error' ? (
        <p className="text-2xs text-muted-foreground">
          Couldn&rsquo;t run the preview just now. Try again in a moment.
        </p>
      ) : null}
      {forecast && outcome?.status === 'ready' && maxDailyApplyMinor != null ? (
        <AutopilotForecastBody
          currency={currency}
          dailyTotal={dailyTotal}
          forecast={forecast}
          items={outcome.preview.items}
          maxDailyApplyMinor={maxDailyApplyMinor}
          unit={unit}
        />
      ) : null}
    </div>
  );
}

function AutopilotForecastBody({
  currency,
  dailyTotal,
  forecast,
  items,
  maxDailyApplyMinor,
  unit,
}: {
  currency: string | null;
  dailyTotal: number;
  forecast: AutopilotForecast;
  items: CyclePreviewItem[];
  maxDailyApplyMinor: number;
  unit: UnitContext;
}) {
  // Back through the same descriptor that filled the input, so the ceiling named here is
  // literally the number in the field above it.
  const ceilingMajor = Number(toInput('max_daily_apply_minor', maxDailyApplyMinor, unit));
  const flowItems: CycleItemRow[] = items.map((item) => ({
    adset_id: item.adset_id,
    current_budget: item.current_budget,
    final_budget: item.final_budget,
    change_abs: item.change_abs,
    change_pct: item.change_pct,
    diagnostics: item.diagnostics ?? null,
  }));

  if (forecast.poolOverCeiling) {
    return (
      <p className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-2xs text-warning">
        This portfolio&rsquo;s {formatCurrency(dailyTotal, currency)}/day pool is over the{' '}
        {formatCurrency(ceilingMajor, currency)} ceiling, so autopilot would write nothing at all.
        Raise the ceiling or lower the daily budget before arming.
      </p>
    );
  }

  const applied = forecast.wouldApply.length;
  const held = forecast.wouldHold.length;
  return (
    <div className="space-y-2">
      <p className="text-2xs text-muted-foreground">
        On this cycle autopilot would have written{' '}
        <span className="font-medium text-foreground tabular-nums">{applied}</span>{' '}
        {applied === 1 ? 'budget change' : 'budget changes'} and held{' '}
        <span className="font-medium text-foreground tabular-nums">{held}</span> over your % cap for
        your approval.
      </p>
      <ReallocationFlow items={flowItems} currency={currency} />
      <p className="text-2xs text-muted-foreground">
        A preview only — the engine ran read-only and nothing was written to Meta.
      </p>
    </div>
  );
}

/** One numeric config field. The value it shows and the value it submits are converted by the
 *  SAME descriptor (portfolioFields), so a field can never advertise one number and write
 *  another — which is the whole reason these live in one place. */
function NumberField({
  children,
  control,
  disabled,
  id,
  label,
  name,
  suggested,
  suggestionLabel,
}: {
  children?: React.ReactNode;
  control: Control<PortfolioFormValues, unknown, PortfolioFormPatch>;
  disabled?: boolean;
  id: string;
  label: string;
  name: NumericFieldKey;
  suggested?: string | number | null;
  suggestionLabel?: string;
}) {
  const { field, fieldState } = useController({ control, name });
  const accept = (value: string) => field.onChange(value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        aria-invalid={fieldState.invalid || undefined}
        disabled={disabled}
        id={id}
        inputMode="decimal"
        onBlur={field.onBlur}
        onChange={field.onChange}
        onKeyDown={acceptSuggestionOnTab(suggested, accept)}
        placeholder={suggestionPlaceholder(suggested, '')}
        ref={field.ref}
        value={field.value ?? ''}
      />
      {children}
      {suggested != null && suggestionLabel ? (
        <SuggestionChip label={suggestionLabel} onClick={() => accept(String(suggested))} />
      ) : null}
      {fieldState.error ? (
        <p className="text-2xs text-destructive">{fieldState.error.message}</p>
      ) : null}
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
