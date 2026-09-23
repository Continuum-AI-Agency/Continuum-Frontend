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
  type AnalogObjective,
  type ApplyMode,
  type AutopilotScope,
  allowedTargetMetrics,
  analogNote,
  analogObjectiveSchema,
  type BudgetGranularity,
  type BudgetSource,
  type ConversionDescriptor,
  type CreativeAnalysis,
  type CycleItemRow,
  type CyclePreviewItem,
  conversionDescriptorSchema,
  flightDays,
  getOptimizationMetricDefinition,
  inferAnalog,
  LOOKBACK_LABEL,
  LOOKBACK_WINDOWS,
  type LookbackWindow,
  type OptimizationModeDto,
  type OptimizationObjective,
  OptimizationObjectiveSchema,
  type PortfolioLevel,
  type PortfolioListItem,
  portfolioMetric,
  recommendLookbackWindow,
  type TargetMetric,
  type UpdatePortfolioPatch,
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
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { ReallocationFlow } from '../charts/ReallocationFlow';
import { currencyFieldSuffix, currencySymbol, formatCurrency, humanize } from '../format';
import { CampaignAdsetPicker } from '../picker/CampaignAdsetPicker';
import { buildClaimMap, previewMoves } from '../picker/campaignGroups';
import { buildPortfolioPickerEntities } from '../picker/portfolioPickerEntities';
import { applyModeExplainer, freezeLabel, parseReport } from '../reportModel';
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
import { AutopilotScopesField } from './AutopilotScopesField';
import { OBJECTIVES } from './suggestionModel';
import {
  ANALOG_LABEL,
  buildConversionDescriptor,
  type ConversionDescriptorDraft,
  descriptorDraftFrom,
  sameDescriptor,
} from './wizard/conversionDescriptor';

export { buildConversionDescriptor } from './wizard/conversionDescriptor';

import { type AutopilotForecast, forecastAutopilot } from './autopilotForecast';
import { TierCards } from './fields/TierCards';
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
const GRANULARITY_LABEL: Record<BudgetGranularity, string> = {
  daily: 'Per day',
  monthly: 'Per month',
  total: 'Whole flight',
};
const SCALE_CADENCE_CHIPS: Array<{ label: string; days: number }> = [
  { label: 'Every week', days: 7 },
  { label: 'Every 2 weeks', days: 14 },
];
/**
 * What a person may choose here, which is NOT every member of the enum.
 *
 * This listed the schema's raw options, so it offered `clicks` — which the wizard
 * deliberately withholds because it is the engine's internal fallback, not a thing an
 * advertiser sets out to buy. One screen could create a portfolio the other could not, and
 * an operator could move a live portfolio onto an objective nobody can create.
 *
 * A portfolio already STORED on an objective outside the list still shows its own value, so
 * this narrows what can be chosen without hiding what is true.
 */
function selectableObjectives(current: OptimizationObjective): OptimizationObjective[] {
  return OBJECTIVES.includes(current) ? OBJECTIVES : [current, ...OBJECTIVES];
}
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
      // Anything other than a literal 'on' is off. Same fail-closed rule the service
      // applies when it parses this column.
      creative_analysis: portfolio.creative_analysis === 'on' ? 'on' : 'off',
      period_start: portfolio.period_start,
      period_end: portfolio.period_end,
      target_metric: portfolio.target_metric ?? portfolioRow?.target_metric ?? null,
      budget_granularity:
        portfolio.budget_granularity ?? portfolioRow?.budget_granularity ?? 'daily',
      daily_total: portfolio.daily_total,
      period_budget: portfolio.period_budget,
      cpa_target: portfolio.cpa_target ?? portfolioRow?.cpa_target ?? null,
      velocity_cap_pct: portfolio.velocity_cap_pct ?? portfolioRow?.velocity_cap_pct ?? null,
      max_daily_apply_minor: portfolio.max_daily_apply_minor,
      max_change_pct_per_cycle: portfolio.max_change_pct_per_cycle,
      scale_growth_pct: portfolio.scale_growth_pct ?? portfolioRow?.scale_growth_pct ?? null,
      scale_cadence_days: portfolio.scale_cadence_days ?? portfolioRow?.scale_cadence_days ?? null,
      scale_max_daily: portfolio.scale_max_daily ?? portfolioRow?.scale_max_daily ?? null,
    }),
    [portfolio, portfolioRow],
  );

  // The seed is read in the STORED objective's unit — that is the unit the stored cpa_target
  // was written in. Keeping it independent of the selected objective is also what stops the
  // `values` identity from churning as the objective select changes.
  const seedUnit = useMemo<UnitContext>(
    () => ({
      currency,
      // The stored target is priced in the stored target METRIC's unit (the objective's own
      // when none is set) — the same rule the scheduler prices the engine on.
      denominatorMultiplier: portfolioMetric(portfolio).denominatorMultiplier,
      budgetGranularity: (currentValues.budget_granularity ?? 'daily') as BudgetGranularity,
      flightDays: flightDays(portfolio.period_start, portfolio.period_end),
    }),
    [currency, portfolio, currentValues.budget_granularity],
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
  // The stored descriptor, and the draft the operator is editing. Seeded once per portfolio
  // rather than through `values`: the descriptor is one jsonb column, so it is dirty as a
  // whole or not at all, and React Hook Form has nothing to track per field here.
  const storedDescriptor = portfolio.conversion_descriptor ?? null;
  const [descriptorDraft, setDescriptorDraft] = useState<ConversionDescriptorDraft>(() =>
    descriptorDraftFrom(storedDescriptor),
  );
  const builtDescriptor = useMemo(
    () => buildConversionDescriptor(descriptorDraft),
    [descriptorDraft],
  );
  const descriptor = 'descriptor' in builtDescriptor ? builtDescriptor.descriptor : null;
  // Leaving 'custom' clears the descriptor: a booked-demo label on a portfolio now buying
  // purchases is worse than no label.
  const descriptorDirty =
    objective === 'custom'
      ? !sameDescriptor(descriptor, storedDescriptor)
      : storedDescriptor !== null;
  const patchDescriptor = (patch: Partial<ConversionDescriptorDraft>) =>
    setDescriptorDraft((current) => ({ ...current, ...patch }));
  const applyMode = values.apply_mode as ApplyMode;
  const budgetSource = values.budget_source as BudgetSource;
  const lookbackWindow = values.lookback_window as LookbackWindow;
  const creativeAnalysis = (values.creative_analysis as CreativeAnalysis) ?? 'off';
  const budgetGranularity = (values.budget_granularity as BudgetGranularity) ?? 'daily';
  // Which metrics this objective may be priced in; the stored choice only counts while it
  // is still allowed (an objective change drops a now-foreign metric back to the default).
  const allowedMetrics = allowedTargetMetrics(objective);
  const selectedTargetMetric = values.target_metric as TargetMetric | null | undefined;
  const effectiveTargetMetric =
    selectedTargetMetric && allowedMetrics.includes(selectedTargetMetric)
      ? selectedTargetMetric
      : objective;
  // Metric follows the SELECTED target metric so the target label, its unit conversion and
  // the KPI the engine scores on (config.kpiField) all track it.
  const metric = getOptimizationMetricDefinition(effectiveTargetMetric);
  const flightLength = flightDays(values.period_start, values.period_end);
  const formUnit = useMemo<UnitContext>(
    () => ({
      currency,
      denominatorMultiplier: metric.denominatorMultiplier,
      budgetGranularity,
      flightDays: flightLength,
    }),
    [currency, metric.denominatorMultiplier, budgetGranularity, flightLength],
  );
  formUnitRef.current = formUnit;

  // Re-expressing the same flight budget: the typed figure changes, the stored one does not.
  function handleGranularityChange(next: BudgetGranularity) {
    if (next === budgetGranularity) return;
    const stored = toStored('period_budget', values.period_budget, formUnit);
    form.setValue('budget_granularity', next, { shouldDirty: true });
    if (stored != null) {
      form.setValue(
        'period_budget',
        toInput('period_budget', stored, { ...formUnit, budgetGranularity: next }),
        { shouldDirty: false },
      );
    }
  }

  // Live reads of the two guardrails, through the SAME descriptor the resolver uses — the
  // gate below and the value submitted can never disagree about what "20" means.
  const capMinor = toStored('max_daily_apply_minor', values.max_daily_apply_minor, formUnit);
  const capPct = toStored('max_change_pct_per_cycle', values.max_change_pct_per_cycle, formUnit);
  const dailyNum = toStored('daily_total', values.daily_total, formUnit) ?? 0;
  const hasDaily = dailyNum > 0;
  const suggestedMaxDaily = hasDaily ? Math.round(dailyNum * 1.5) : null;

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
  const [savingScope, setSavingScope] = useState<AutopilotScope | null>(null);

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
  // Choosing the Autopilot card with no guardrails yet fills both with the same defaults the
  // suggestion chips offer, so the tier is one click to reach instead of a dead option.
  function handleApplyModeChange(value: ApplyMode) {
    if (value === 'autopilot' && !isArmed) {
      if (!guardrailsReady) {
        if (!(capMinor && capMinor > 0) && suggestedMaxDaily != null) {
          form.setValue('max_daily_apply_minor', String(suggestedMaxDaily), { shouldDirty: true });
        }
        if (!(capPct && capPct > 0)) {
          form.setValue('max_change_pct_per_cycle', SUGGESTED_MAX_CHANGE_PCT, {
            shouldDirty: true,
          });
        }
      }
      setArming(true);
      return;
    }
    setArming(false);
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

  const hasChanges =
    form.formState.isDirty || descriptorDirty || toAdd.length > 0 || toRemove.length > 0;
  const saving =
    form.formState.isSubmitting || update.isPending || enroll.isPending || unenroll.isPending;

  // Which ad sets this save would take from other portfolios, and who loses them.
  const pendingMoves = useMemo(() => previewMoves(toAdd, claims), [toAdd, claims]);

  // The values a confirm dialog is holding: validated and already in contract units, so the
  // dialog's action performs exactly the save the operator was shown.
  const confirmedValues = useRef<PortfolioFormPatch | null>(null);

  async function performSave(patchValues: PortfolioFormPatch) {
    const patch: Record<string, unknown> = {
      ...buildPatch(patchValues, form.formState.dirtyFields),
    };
    form.clearErrors('root');
    // A custom objective without a described conversion is the mislabelling this objective
    // exists to end, so it blocks the save rather than storing a portfolio nobody can read.
    if (objective === 'custom') {
      if ('error' in builtDescriptor) {
        form.setError('root', { message: builtDescriptor.error });
        return;
      }
      if (descriptorDirty) patch.conversion_descriptor = builtDescriptor.descriptor;
    } else if (storedDescriptor !== null) {
      patch.conversion_descriptor = null;
    }
    try {
      if (Object.keys(patch).length > 0) {
        await update.mutateAsync({
          portfolio_id: portfolio.id,
          patch: patch as UpdatePortfolioPatch,
        });
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
  const unit = currencyFieldSuffix(currency);
  const mismatchLabel = freezeLabel('kpi_mismatch')?.label ?? 'Held · different goal';
  const rootError = form.formState.errors.root?.message;

  // One definition per field, shared by the chip and the Tab accelerator so the value the
  // chip advertises is exactly the value Tab fills in.
  const suggestedDaily =
    budgetSource === 'fixed' && selectedBudgetSum > 0 ? Math.round(selectedBudgetSum) : null;
  const suggestedPeriod = hasDaily ? Math.round(dailyNum * PACING_PERIOD_DAYS) : null;
  const storedPeriodBudget = toStored('period_budget', values.period_budget, formUnit);
  const impliedDaily =
    storedPeriodBudget != null && flightLength != null && flightLength > 0
      ? storedPeriodBudget / flightLength
      : null;
  const scaleGrowth = toStored('scale_growth_pct', values.scale_growth_pct, formUnit);
  const scaleCadence = toStored('scale_cadence_days', values.scale_cadence_days, formUnit);
  const scaleCeiling = toStored('scale_max_daily', values.scale_max_daily, formUnit);

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
                {selectableObjectives(objective).map((value) => (
                  <SelectItem key={value} value={value}>
                    {humanize(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-2xs text-muted-foreground">
              Prices this portfolio on {descriptor?.result_label ?? metric.resultLabel} (
              {descriptor?.cost_label ?? metric.costLabel}).
            </p>
            {objectiveChanged && affectedAdsets.length > 0 ? (
              <p className="text-2xs text-warning">
                {affectedAdsets.length} of {enrolledIds.length} enrolled ad sets buy a different
                result and will be held ({mismatchLabel}) until moved.
              </p>
            ) : null}
          </div>
          {objective === 'custom' ? (
            <div className="space-y-2.5 rounded-md border border-border/60 bg-background/60 p-3 sm:col-span-2">
              <div>
                <p className="font-semibold text-xs tracking-tight">The conversion you buy</p>
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  Nobody but you knows what this event is. Name it, and say how it behaves — it is
                  measured against whichever calibrated objective behaves the same way.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`manage-conv-event-${portfolio.id}`}>Event id</Label>
                  <Input
                    id={`manage-conv-event-${portfolio.id}`}
                    onChange={(event) => patchDescriptor({ event_id: event.target.value })}
                    placeholder="offsite_conversion.fb_pixel_custom"
                    value={descriptorDraft.event_id}
                  />
                  <p className="text-2xs text-muted-foreground">
                    What the platform calls it, not what you call it.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`manage-conv-result-${portfolio.id}`}>What you call one</Label>
                  <Input
                    id={`manage-conv-result-${portfolio.id}`}
                    onChange={(event) => patchDescriptor({ result_label: event.target.value })}
                    placeholder="Demos booked"
                    value={descriptorDraft.result_label}
                  />
                  <p className="text-2xs text-muted-foreground">
                    Every card on this account says this word instead of &ldquo;conversions&rdquo;.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`manage-conv-cost-${portfolio.id}`}>What one costs</Label>
                  <Input
                    id={`manage-conv-cost-${portfolio.id}`}
                    onChange={(event) => patchDescriptor({ cost_label: event.target.value })}
                    placeholder="Cost per demo booked"
                    value={descriptorDraft.cost_label}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`manage-conv-lag-${portfolio.id}`}>Days to arrive</Label>
                    <Input
                      id={`manage-conv-lag-${portfolio.id}`}
                      inputMode="decimal"
                      onChange={(event) =>
                        patchDescriptor({ typical_lag_days: event.target.value })
                      }
                      placeholder="4"
                      value={descriptorDraft.typical_lag_days}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`manage-conv-volume-${portfolio.id}`}>A week</Label>
                    <Input
                      id={`manage-conv-volume-${portfolio.id}`}
                      inputMode="decimal"
                      onChange={(event) => patchDescriptor({ events_per_week: event.target.value })}
                      placeholder="18"
                      value={descriptorDraft.events_per_week}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <Switch
                    aria-label="Carries a value"
                    checked={descriptorDraft.carries_revenue}
                    id={`manage-conv-revenue-${portfolio.id}`}
                    onCheckedChange={(checked) => patchDescriptor({ carries_revenue: checked })}
                  />
                  <Label className="font-normal" htmlFor={`manage-conv-revenue-${portfolio.id}`}>
                    The event carries a money value — it IS the revenue, not a step toward it.
                  </Label>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Measured like</Label>
                  <Select
                    onValueChange={(value) =>
                      patchDescriptor({
                        analog:
                          value === 'inferred'
                            ? null
                            : (analogObjectiveSchema.parse(value) as AnalogObjective),
                      })
                    }
                    value={descriptorDraft.analog ?? 'inferred'}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inferred">Work it out from the answers above</SelectItem>
                      {analogObjectiveSchema.options.map((value) => (
                        <SelectItem key={value} value={value}>
                          {`Like ${ANALOG_LABEL[value]}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {descriptor ? (
                    <p className="text-2xs text-muted-foreground">{analogNote(descriptor)}</p>
                  ) : (
                    <p className="text-2xs text-warning">
                      {'error' in builtDescriptor ? builtDescriptor.error : null}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`manage-target-metric-${portfolio.id}`}>Target metric</Label>
            {allowedMetrics.length > 1 ? (
              <Select
                onValueChange={(value) =>
                  form.setValue(
                    'target_metric',
                    value === objective ? null : (value as TargetMetric),
                    {
                      shouldDirty: true,
                    },
                  )
                }
                value={effectiveTargetMetric}
              >
                <SelectTrigger id={`manage-target-metric-${portfolio.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedMetrics.map((value) => (
                    <SelectItem key={value} value={value}>
                      {getOptimizationMetricDefinition(value).costLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p
                className="flex h-9 items-center rounded-md border border-border/60 bg-muted/30 px-3 text-sm"
                id={`manage-target-metric-${portfolio.id}`}
              >
                {metric.costLabel}
              </p>
            )}
            <p className="text-2xs text-muted-foreground">
              {allowedMetrics.length > 1
                ? `Which cost the target is set in. Every ad set is scored on it.`
                : `${humanize(objective)} is priced in ${metric.costLabel}.`}
            </p>
          </div>
          <NumberField
            control={form.control}
            id={`manage-cpa-${portfolio.id}`}
            label={`${metric.targetLabel}${unit}`}
            name="cpa_target"
          >
            <p className="text-2xs text-muted-foreground">
              Scale mode grows the budget only while the portfolio beats this. Blank means the
              engine&rsquo;s default target, not &ldquo;no target&rdquo;.
            </p>
          </NumberField>
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
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
            <Label>Autonomy tier</Label>
            <TierCards arming={arming} onSelect={handleApplyModeChange} value={applyMode} />
            {/* applyModeExplainer describes the selected tier and re-runs as the choice changes. */}
            <p className="text-2xs text-muted-foreground">
              {arming && !isArmed
                ? 'Check the guardrails below, preview the cycle, then arm.'
                : applyModeExplainer(applyMode)}
            </p>
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
            label={`Daily budget${unit}`}
            name="daily_total"
            suggested={suggestedDaily}
            suggestionLabel={
              suggestedDaily != null
                ? `Match current ${formatCurrency(suggestedDaily, currency)}/day`
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
        {values.mode === 'scale' ? (
          <div className="space-y-2 rounded-md border border-border/60 bg-background/60 p-3">
            <p className="text-2xs font-medium">
              Grow the budget{' '}
              <span className="text-foreground">
                {scaleGrowth != null ? `${Math.round(scaleGrowth * 100)}%` : '…'}
              </span>{' '}
              every{' '}
              <span className="text-foreground">
                {scaleCadence != null ? `${scaleCadence} day${scaleCadence === 1 ? '' : 's'}` : '…'}
              </span>{' '}
              while the portfolio beats its target
              {scaleCeiling != null ? `, up to ${formatCurrency(scaleCeiling, currency)}/day` : ''}.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                control={form.control}
                id={`manage-scale-growth-${portfolio.id}`}
                label="Grow by (%)"
                name="scale_growth_pct"
                suggested="10"
                suggestionLabel="Suggest 10%"
              />
              <NumberField
                control={form.control}
                id={`manage-scale-cadence-${portfolio.id}`}
                label="Every (days)"
                name="scale_cadence_days"
              >
                <div className="flex flex-wrap gap-1.5">
                  {SCALE_CADENCE_CHIPS.map((chip) => (
                    <SuggestionChip
                      key={chip.days}
                      label={chip.label}
                      onClick={() =>
                        form.setValue('scale_cadence_days', String(chip.days), {
                          shouldDirty: true,
                        })
                      }
                    />
                  ))}
                </div>
              </NumberField>
              <NumberField
                control={form.control}
                id={`manage-scale-ceiling-${portfolio.id}`}
                label={`Up to (${symbol ? `${symbol}/day` : 'per day'}, optional)`}
                name="scale_max_daily"
              >
                <p className="text-2xs text-muted-foreground">
                  A ceiling for the daily total. Blank means no ceiling.
                </p>
              </NumberField>
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        description="A start date, an end date and a budget. With all three the optimizer paces spend to land on the budget; the lookback is the window every metric on this portfolio reads."
        title="Plan"
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
                ? `${flightLength} days. The budget below paces against these dates.`
                : 'Set start and end dates to pace against the budget below.'}
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
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor={`manage-period-${portfolio.id}`}>
                Budget{unit} · {GRANULARITY_LABEL[budgetGranularity].toLowerCase()}
              </Label>
              <ToggleGroup
                aria-label="Budget granularity"
                onValueChange={(next) => {
                  if (next) handleGranularityChange(next as BudgetGranularity);
                }}
                size="sm"
                type="single"
                value={budgetGranularity}
                variant="outline"
              >
                {(Object.keys(GRANULARITY_LABEL) as BudgetGranularity[]).map((value) => (
                  <ToggleGroupItem className="h-6 px-2 text-2xs" key={value} value={value}>
                    {GRANULARITY_LABEL[value]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                control={form.control}
                id={`manage-period-${portfolio.id}`}
                label=""
                name="period_budget"
                suggested={
                  budgetGranularity === 'daily'
                    ? hasDaily
                      ? Math.round(dailyNum)
                      : null
                    : budgetGranularity === 'total'
                      ? suggestedPeriod
                      : null
                }
                suggestionLabel={
                  budgetGranularity === 'daily' && hasDaily
                    ? `Match ${formatCurrency(Math.round(dailyNum), currency)}/day`
                    : budgetGranularity === 'total' && suggestedPeriod != null
                      ? `Suggest ${formatCurrency(suggestedPeriod, currency)} (${PACING_PERIOD_DAYS}d)`
                      : undefined
                }
              />
              <p className="self-end pb-2 text-2xs text-muted-foreground tabular-nums">
                {storedPeriodBudget != null && flightLength != null
                  ? `= ${formatCurrency(storedPeriodBudget, currency)} for the flight · ≈ ${formatCurrency(impliedDaily, currency)}/day`
                  : storedPeriodBudget != null
                    ? 'Set a flight window to pace this budget over it.'
                    : 'Clear to leave the portfolio unpaced.'}
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section
        description="Off, the optimizer compares each creative against the others in its ad set — it can tell you one costs more than its neighbour. On, it also reads each creative's own 14-day trend, which is the only way to see a creative wearing out rather than simply losing. Recommendations still need your approval either way."
        title="Creative analysis"
      >
        <div className="space-y-1.5 sm:max-w-md">
          <div className="flex items-center gap-3">
            <Switch
              aria-label="Ad-level analysis"
              checked={creativeAnalysis === 'on'}
              id={`manage-creative-analysis-${portfolio.id}`}
              onCheckedChange={(checked) =>
                form.setValue('creative_analysis', (checked ? 'on' : 'off') as CreativeAnalysis, {
                  shouldDirty: true,
                })
              }
            />
            <Label htmlFor={`manage-creative-analysis-${portfolio.id}`}>
              {creativeAnalysis === 'on'
                ? 'On — reads each creative’s own trend'
                : 'Off — ad-set level only'}
            </Label>
          </div>
          <p className="text-2xs text-muted-foreground">
            {creativeAnalysis === 'on'
              ? 'This portfolio can flag a creative that is decaying, including in ad sets running a single creative — where there is nothing to compare against.'
              : 'Turn on to see which creatives are wearing out. Reversible at any time; nothing else about this portfolio changes.'}
          </p>
        </div>
      </Section>

      {guardrailsRelevant ? (
        <Section
          title="Autopilot guardrails"
          description="Both caps are required to turn autopilot on; they bound the budget writes. Below, tick what autopilot may approve on its own — anything it creates is born paused."
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
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">What autopilot may approve</p>
            <AutopilotScopesField
              disabled={portfolio.apply_mode !== 'autopilot' && !isArmed}
              noActor={
                portfolio.apply_mode === 'autopilot' &&
                portfolio.apply_mode_changed_by === null &&
                portfolio.autopilot_scopes_changed_by === null
              }
              onChange={(scope, enabled) => {
                setSavingScope(scope);
                update.mutate(
                  { portfolio_id: portfolio.id, patch: { autopilot_scopes: { [scope]: enabled } } },
                  { onSettled: () => setSavingScope(null) },
                );
              }}
              portfolioId={portfolio.id}
              savingScope={savingScope}
              scopes={portfolio.autopilot_scopes ?? null}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              control={form.control}
              id={`manage-maxdaily-${portfolio.id}`}
              label={`Max autopilot spend/day${unit}`}
              name="max_daily_apply_minor"
              suggested={suggestedMaxDaily}
              suggestionLabel={
                suggestedMaxDaily != null
                  ? `Suggest ${formatCurrency(suggestedMaxDaily, currency)}`
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
      {label ? <Label htmlFor={id}>{label}</Label> : null}
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
