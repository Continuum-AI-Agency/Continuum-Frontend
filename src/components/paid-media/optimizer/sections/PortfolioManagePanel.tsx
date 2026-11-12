'use client';
import type { useTranslations as ScaleTranslationHook } from 'next-intl';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

import { useLocale, useTranslations } from 'next-intl';
import { useUiErrorMessage } from '@/i18n/errors';
import { localizeOptimizationMetricDefinition } from '@/lib/paid-media/optimizationMetricPresentation';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';

// Inline management for one portfolio, laid out as ONE sheet: a sticky section index beside
// (or, in a narrow panel, above) hairline-separated sections — Identity (name + objective +
// target), Strategy (mode + autonomy tier + daily budget), Plan (lookback + flight + budget),
// Creative analysis, Attribution, Autopilot guardrails (caps + scopes + kill-switch), a daily
// limit per platform (./platformCaps), the enrolled campaign→ad-set picker, and an Advanced
// disclosure (velocity cap). Every field is a label-left, control-right row (FieldRow).
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
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useValidationErrorMap } from '@/i18n/validation';
import { cn } from '@/lib/utils';
import { ReallocationFlow } from '../charts/ReallocationFlow';
import {
  currencyFieldSuffix,
  formatCurrency,
  formatPercent,
  humanize,
  normalizeCurrency,
} from '../format';
import { CampaignAdsetPicker } from '../picker/CampaignAdsetPicker';
import { buildClaimMap, previewMoves } from '../picker/campaignGroups';
import { MultiPlatformPicker } from '../picker/MultiPlatformPicker';
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
import { AttributionSection } from './attribution/AttributionSection';
import type { HeroSetting } from './detail/heroHeaderModel';
import { OBJECTIVES } from './suggestionModel';
import {
  ANALOG_LABEL,
  analogLabel,
  buildConversionDescriptor,
  type ConversionDescriptorDraft,
  descriptorDraftFrom,
  sameDescriptor,
} from './wizard/conversionDescriptor';

export { buildConversionDescriptor } from './wizard/conversionDescriptor';

import { type AutopilotForecast, forecastAutopilot } from './autopilotForecast';
import { TierCards } from './fields/TierCards';
import { GoalCostCapField } from './goalCostCap/GoalCostCapField';
import { PlatformActionsField } from './platformActions/PlatformActionsField';
import { PlatformCapsField } from './platformCaps/PlatformCapsField';
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
const BUDGET_SOURCE_LABEL: Record<BudgetSource, string> = {
  observed: 'Match current spend',
  fixed: 'Fixed daily target',
};

/** value→label for a Select trigger, built with the same labeller as its items, so the
 *  closed trigger reads "Balanced", never the stored code "balanced". */
function selectLabels<Value extends string>(
  values: readonly Value[],
  label: (value: Value) => string,
): Record<string, string> {
  return Object.fromEntries(values.map((value) => [value, label(value)]));
}

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
  rows: {
    adset_id: string;
    adset_name: string | null;
    missing_since?: string | null;
  }[];
}) {
  const uiText = useTranslations('scale');
  const drifted = rows.filter((row) => Boolean(row.missing_since));
  if (drifted.length === 0) return null;
  const label = drifted.length === 1 ? 'ad set is' : 'ad sets are';
  return (
    <div className="rounded-md bg-warning/10 px-3 py-2 text-xs" role="status">
      <p className="font-medium text-warning">
        {uiText.rich('sentence_1d1744d24fad', {
          v0: drifted.length,
          v1: label,
        })}
      </p>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {drifted.slice(0, 5).map((row) => (
          <li key={row.adset_id}>
            {row.adset_name ?? row.adset_id}
            {row.missing_since
              ? uiText('template_339499b00714', {
                  v0: row.missing_since.slice(0, 10),
                })
              : ''}
          </li>
        ))}
      </ul>
      {drifted.length > 5 ? (
        <p className="mt-1 text-muted-foreground">
          {uiText.rich('sentence_70c322a9a74f', {
            v0: () => drifted.length - 5,
          })}
        </p>
      ) : null}
      <p className="mt-1 text-muted-foreground">
        {uiText('they_still_hold_their_enrollment_deselect_the_6749ca9')}
      </p>
    </div>
  );
}

/** One-line explanation of each optimization mode, shown under the Mode select as it changes.
 *  Radix select items don't nest tooltips cleanly, so the hint updates with the selection. */
function modeExplainer(mode: string, uiTranslate?: ScaleCopy): string {
  switch (mode) {
    case 'efficiency':
      return uiTranslate
        ? uiTranslate('efficiency_protect_cost_per_result_budget_mov_5b75270')
        : 'Efficiency — protect cost per result. Budget moves hardest toward the cheapest ad sets and away from the expensive ones.';
    case 'scale':
      return uiTranslate
        ? uiTranslate('scale_chase_volume_the_optimizer_tolerates_a__8b3a0b3')
        : 'Scale — chase volume. The optimizer tolerates a higher cost per result to spend into what is working.';
    default:
      return uiTranslate
        ? uiTranslate('balanced_trade_a_little_efficiency_for_steadi_d4d5328')
        : 'Balanced — trade a little efficiency for steadier volume. A sensible default.';
  }
}

type PortfolioManagePanelProps = {
  brandId: string;
  adAccountId: string;
  portfolio: PortfolioListItem;
  currency?: string | null;
  onDone?: () => void;
  /** A setting the portfolio header's chip asked to edit: scrolled to and focused on mount. */
  focusSetting?: HeroSetting | null;
  onFocusSettingDone?: () => void;
};

/** The field each header chip (or the goal-mismatch banner) opens — the id prefix of that
 *  field's control below. */
const SETTING_FIELD: Record<HeroSetting, string> = {
  strategy: 'manage-mode',
  objective: 'manage-objective',
  target: 'manage-cpa',
  budget: 'manage-budget-source',
  window: 'manage-lookback',
  roster: 'manage-roster',
};

export function PortfolioManagePanel({
  brandId,
  adAccountId,
  portfolio,
  currency,
  onDone,
  focusSetting = null,
  onFocusSettingDone,
}: PortfolioManagePanelProps) {
  const formatUiError = useUiErrorMessage();

  const uiLocale = useLocale();
  const uiText = useTranslations('scale');
  const GRANULARITY_LABEL: Record<BudgetGranularity, string> = useMemo(
    () => ({
      daily: uiText('per_day_5b9e193'),
      monthly: uiText('managePerMonth'),
      total: uiText('manageWholeFlight'),
    }),
    [uiText],
  );

  const SCALE_CADENCE_CHIPS: Array<{ label: string; days: number }> = useMemo(
    () => [
      { label: uiText('every_week_1b7e185'), days: 7 },
      { label: uiText('every_2_weeks_6327e3a'), days: 14 },
    ],
    [uiText],
  );

  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  // A campaign portfolio edits campaigns, not ad sets: the level drives which snapshot
  // scope + picker mode the manage panel shows. Enroll/unenroll operate on the entity id
  // at either level, so the diff below is unchanged.
  const level = (portfolio.level as PortfolioLevel) ?? 'adset';
  const { update, enroll, unenroll, archive, setPaused } = useOptimizerMutations(
    brandId,
    adAccountId,
  );
  const enrolledRead = useOptimizerEnrolledAdsets(portfolio.id);

  useEffect(() => {
    if (!focusSetting) return;
    const field = document.getElementById(`${SETTING_FIELD[focusSetting]}-${portfolio.id}`);
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    field?.focus({ preventScroll: true });
    onFocusSettingDone?.();
  }, [focusSetting, portfolio.id, onFocusSettingDone]);
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
    () => createPortfolioFormSchema(() => formUnitRef.current, currentValues, uiText),
    [currentValues, uiText],
  );

  const validationErrorMap = useValidationErrorMap();
  const form = useForm<PortfolioFormValues, unknown, PortfolioFormPatch>({
    resolver: zodResolver(schema, { error: validationErrorMap }),
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
    () => buildConversionDescriptor(descriptorDraft, uiText),
    [descriptorDraft, uiText],
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
  const metric = localizeOptimizationMetricDefinition(
    getOptimizationMetricDefinition(effectiveTargetMetric),
    optimizerText,
  );
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
        toInput('period_budget', stored, {
          ...formUnit,
          budgetGranularity: next,
        }),
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
          form.setValue('max_daily_apply_minor', String(suggestedMaxDaily), {
            shouldDirty: true,
          });
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
        await unenroll.mutateAsync({
          portfolio_id: portfolio.id,
          adset_id: adsetId,
        });
      }
      onDone?.();
    } catch (err) {
      form.setError('root', {
        message: formatUiError(err),
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

  const symbol = normalizeCurrency(currency);
  const unit = currencyFieldSuffix(currency);
  const mismatchLabel =
    freezeLabel('kpi_mismatch', undefined, optimizerText)?.label ?? 'Held · different goal';
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

  const sectionId = (key: string) => `manage-${key}-${portfolio.id}`;
  // The list names each portfolio's platforms (20261015160023); a portfolio on Meta alone has no
  // action kinds to choose, because Meta's writes never cross the executor that reads them.
  const holdsNonMeta = (portfolio.platforms ?? []).some((platform) => platform !== 'meta');
  const sheetSections: SheetSection[] = [
    { id: sectionId('identity'), label: uiText('identity_999f23f') },
    { id: sectionId('strategy'), label: uiText('strategy_6b27710') },
    { id: sectionId('plan'), label: uiText('plan_fa8ed0b') },
    { id: sectionId('creative'), label: uiText('creative_analysis_d28c315') },
    { id: sectionId('attribution'), label: uiText('attribution_a902dcc') },
    ...(guardrailsRelevant
      ? [{ id: sectionId('guardrails'), label: uiText('guardrails_443f975') }]
      : []),
    { id: sectionId('platform-limits'), label: uiText('daily_limits_c5c4a6c') },
    ...(holdsNonMeta
      ? [
          {
            id: sectionId('platform-actions'),
            label: uiText('allowed_actions_f1ee293'),
          },
        ]
      : []),
    {
      id: sectionId('enrolled'),
      label: level === 'campaign' ? uiText('campaigns_30e9a08') : uiText('ad_sets_f59ed42'),
    },
  ];

  return (
    <div className="@container/manage">
      <div className="@3xl/manage:grid @3xl/manage:grid-cols-[10.5rem_minmax(0,1fr)] @3xl/manage:gap-10">
        <SheetIndex sections={sheetSections} />
        <div className="@container/sheet min-w-0">
          <Section
            description={uiText('what_this_portfolio_is_what_it_buys_and_what__92db74d')}
            id={sectionId('identity')}
            title={uiText('identity_999f23f')}
          >
            <FieldRow htmlFor={`manage-name-${portfolio.id}`} label={uiText('name_dcd1d52')}>
              <Input
                className="max-w-md"
                id={`manage-name-${portfolio.id}`}
                {...form.register('name')}
              />
              {form.formState.errors.name ? (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              ) : null}
            </FieldRow>
            <FieldRow
              htmlFor={`manage-objective-${portfolio.id}`}
              label={uiText('objective_3b20adc')}
            >
              <Select
                value={objective}
                onValueChange={(value) =>
                  form.setValue('objective', value as OptimizationObjective, {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger id={`manage-objective-${portfolio.id}`}>
                  <SelectValue
                    items={selectLabels(selectableObjectives(objective), (value) =>
                      humanize(value, uiText),
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {selectableObjectives(objective).map((value) => (
                    <SelectItem key={value} value={value}>
                      {humanize(value, uiText)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {uiText.rich('sentence_1b23a80fa83d', {
                  v0: descriptor?.result_label ?? metric.resultLabel,
                  v1: descriptor?.cost_label ?? metric.costLabel,
                })}
              </p>
              {objectiveChanged && affectedAdsets.length > 0 ? (
                <p className="text-xs text-warning">
                  {uiText.rich('sentence_fd60de4946d9', {
                    v0: affectedAdsets.length,
                    v1: enrolledIds.length,
                    v2: mismatchLabel,
                  })}
                </p>
              ) : null}
            </FieldRow>
            {objective === 'custom' ? (
              <>
                <FieldRow label={uiText('the_conversion_you_buy_39c0842')}>
                  <p className="text-xs text-muted-foreground @lg/sheet:pt-2">
                    {uiText('nobody_but_you_knows_what_this_event_is_name__4b49aa3')}
                  </p>
                </FieldRow>
                <FieldRow
                  htmlFor={`manage-conv-event-${portfolio.id}`}
                  label={uiText('event_id_82e663f')}
                >
                  <Input
                    className="max-w-md"
                    id={`manage-conv-event-${portfolio.id}`}
                    onChange={(event) => patchDescriptor({ event_id: event.target.value })}
                    placeholder="offsite_conversion.fb_pixel_custom"
                    value={descriptorDraft.event_id}
                  />
                  <p className="text-xs text-muted-foreground">
                    {uiText('what_the_platform_calls_it_not_what_you_call__f33996c')}
                  </p>
                </FieldRow>
                <FieldRow
                  htmlFor={`manage-conv-result-${portfolio.id}`}
                  label={uiText('what_you_call_one_8a89376')}
                >
                  <Input
                    className="max-w-md"
                    id={`manage-conv-result-${portfolio.id}`}
                    onChange={(event) => patchDescriptor({ result_label: event.target.value })}
                    placeholder={uiText('demos_booked_803091f')}
                    value={descriptorDraft.result_label}
                  />
                  <p className="text-xs text-muted-foreground">
                    {uiText('every_card_on_this_account_says_this_word_ins_46ecfb6')}
                  </p>
                </FieldRow>
                <FieldRow
                  htmlFor={`manage-conv-cost-${portfolio.id}`}
                  label={uiText('what_one_costs_0260258')}
                >
                  <Input
                    className="max-w-md"
                    id={`manage-conv-cost-${portfolio.id}`}
                    onChange={(event) => patchDescriptor({ cost_label: event.target.value })}
                    placeholder={uiText('cost_per_demo_booked_3cfda2f')}
                    value={descriptorDraft.cost_label}
                  />
                </FieldRow>
                <FieldRow
                  htmlFor={`manage-conv-lag-${portfolio.id}`}
                  label={uiText('days_to_arrive_c3a7ac7')}
                >
                  <Input
                    className="max-w-[12rem] tabular-nums"
                    id={`manage-conv-lag-${portfolio.id}`}
                    inputMode="decimal"
                    onChange={(event) => patchDescriptor({ typical_lag_days: event.target.value })}
                    placeholder="4"
                    value={descriptorDraft.typical_lag_days}
                  />
                </FieldRow>
                <FieldRow
                  htmlFor={`manage-conv-volume-${portfolio.id}`}
                  label={uiText('a_week_a2f8103')}
                >
                  <Input
                    className="max-w-[12rem] tabular-nums"
                    id={`manage-conv-volume-${portfolio.id}`}
                    inputMode="decimal"
                    onChange={(event) => patchDescriptor({ events_per_week: event.target.value })}
                    placeholder="18"
                    value={descriptorDraft.events_per_week}
                  />
                </FieldRow>
                <FieldRow label={uiText('carries_a_value_1e66281')} switchRow>
                  <div className="flex items-start gap-3">
                    <Switch
                      aria-label={uiText('carries_a_value_1e66281')}
                      checked={descriptorDraft.carries_revenue}
                      id={`manage-conv-revenue-${portfolio.id}`}
                      onCheckedChange={(checked) => patchDescriptor({ carries_revenue: checked })}
                    />
                    <Label className="font-normal" htmlFor={`manage-conv-revenue-${portfolio.id}`}>
                      {uiText('the_event_carries_a_money_value_it_is_the_rev_7d28881')}
                    </Label>
                  </div>
                </FieldRow>
                <FieldRow label={uiText('measured_like_d9f7b6d')}>
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
                      <SelectValue
                        items={{
                          inferred: 'Work it out from the answers above',
                          ...selectLabels(analogObjectiveSchema.options, (value) =>
                            uiText('conversionLikeAnalog', {
                              analog: analogLabel(value, uiText),
                            }),
                          ),
                        }}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inferred">
                        {uiText('work_it_out_from_the_answers_above_eb59ad7')}
                      </SelectItem>
                      {analogObjectiveSchema.options.map((value) => (
                        <SelectItem key={value} value={value}>
                          {uiText('template_66bd95a7ce7d', {
                            v0: analogLabel(value, uiText),
                          })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {descriptor ? (
                    <p className="text-xs text-muted-foreground">{analogNote(descriptor)}</p>
                  ) : (
                    <p className="text-xs text-warning">
                      {'error' in builtDescriptor ? builtDescriptor.error : null}
                    </p>
                  )}
                </FieldRow>
              </>
            ) : null}
            <FieldRow
              htmlFor={`manage-target-metric-${portfolio.id}`}
              label={uiText('target_metric_5e5b274')}
            >
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
                    <SelectValue
                      items={selectLabels(
                        allowedMetrics,
                        (value) =>
                          localizeOptimizationMetricDefinition(
                            getOptimizationMetricDefinition(value),
                            optimizerText,
                          ).costLabel,
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedMetrics.map((value) => (
                      <SelectItem key={value} value={value}>
                        {
                          localizeOptimizationMetricDefinition(
                            getOptimizationMetricDefinition(value),
                            optimizerText,
                          ).costLabel
                        }
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p
                  className="flex min-h-9 items-center text-sm"
                  id={`manage-target-metric-${portfolio.id}`}
                >
                  {metric.costLabel}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {allowedMetrics.length > 1
                  ? uiText('template_946728648642', {})
                  : uiText('template_cc57c88a2e9f', {
                      v0: humanize(objective, uiText),
                      v1: metric.costLabel,
                    })}
              </p>
            </FieldRow>
            <NumberField
              control={form.control}
              id={`manage-cpa-${portfolio.id}`}
              label={`${metric.targetLabel}${unit}`}
              name="cpa_target"
            >
              <p className="text-xs text-muted-foreground">
                {uiText('scale_mode_grows_the_budget_only_while_the_po_abfe549')}
              </p>
              <GoalCostCapField
                enabled={portfolio.goal_as_platform_cost_cap === true}
                goal={toStored('cpa_target', values.cpa_target, formUnit)}
                maxChangePctPerCycle={capPct ?? portfolio.max_change_pct_per_cycle}
                portfolioId={portfolio.id}
                targetMetric={effectiveTargetMetric}
              />
            </NumberField>
          </Section>

          <Section
            description={uiText('how_hard_it_pushes_who_applies_the_moves_and__8ed091e')}
            id={sectionId('strategy')}
            title={uiText('strategy_6b27710')}
          >
            <FieldRow htmlFor={`manage-mode-${portfolio.id}`} label={uiText('mode_5e23ec6')}>
              <Select
                value={values.mode}
                onValueChange={(value) =>
                  form.setValue('mode', value as OptimizationModeDto, {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger id={`manage-mode-${portfolio.id}`}>
                  <SelectValue items={selectLabels(MODES, (value) => humanize(value, uiText))} />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humanize(value, uiText)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{modeExplainer(values.mode, uiText)}</p>
            </FieldRow>
            <FieldRow label={uiText('autonomy_tier_fb493fa')}>
              <TierCards arming={arming} onSelect={handleApplyModeChange} value={applyMode} />
              {/* applyModeExplainer describes the selected tier and re-runs as the choice changes. */}
              <p className="text-xs text-muted-foreground">
                {arming && !isArmed
                  ? uiText('check_the_guardrails_below_preview_the_cycle__ca75bd3')
                  : applyModeExplainer(applyMode, undefined, optimizerText, uiLocale)}
              </p>
            </FieldRow>
            <FieldRow
              htmlFor={`manage-budget-source-${portfolio.id}`}
              label={uiText('total_budget_7f4ba95')}
            >
              <Select
                onValueChange={(value) =>
                  form.setValue('budget_source', value as BudgetSource, {
                    shouldDirty: true,
                  })
                }
                value={budgetSource}
              >
                <SelectTrigger id={`manage-budget-source-${portfolio.id}`}>
                  <SelectValue
                    items={{
                      observed: uiText('manageBudgetSource', {
                        source: 'observed',
                      }),
                      fixed: uiText('manageBudgetSource', { source: 'fixed' }),
                    }}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(BUDGET_SOURCE_LABEL) as BudgetSource[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {uiText('manageBudgetSource', { source: value })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {budgetSource === 'observed'
                  ? uiText('reallocates_within_whatever_the_enrolled_ad_s_6e26dbc')
                  : uiText('drives_the_portfolio_toward_the_daily_budget__4a3e306')}
              </p>
            </FieldRow>
            <NumberField
              control={form.control}
              disabled={budgetSource === 'observed'}
              id={`manage-daily-${portfolio.id}`}
              label={uiText('template_6a2664b8a681', { v0: unit })}
              name="daily_total"
              suggested={suggestedDaily}
              suggestionLabel={
                suggestedDaily != null
                  ? uiText('manageSuggestion', {
                      kind: 'current',
                      amount: formatCurrency(suggestedDaily, currency, uiLocale),
                      days: 0,
                    })
                  : undefined
              }
            >
              {/* The one field that must track the enrolled roster had the least help: nothing
                  re-derived it when the picker changed membership, so a portfolio kept
                  conserving a months-old sum. */}
              {budgetSource === 'observed' && selectedBudgetSum > 0 ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {uiText.rich('sentence_0602e3e12e2b', {
                    budget: formatCurrency(selectedBudgetSum, currency, uiLocale),
                    count: selectedAdsetIds.length,
                  })}
                </p>
              ) : null}
            </NumberField>
            {values.mode === 'scale' ? (
              <>
                <FieldRow label={uiText('scaling_f1766cc')}>
                  <p className="text-sm @lg/sheet:pt-2">
                    {uiText.rich('sentence_295cfe924bc7', {
                      growth: () => (
                        <span className="font-medium tabular-nums">
                          {scaleGrowth != null
                            ? formatPercent(Math.round(scaleGrowth * 100), {}, uiLocale)
                            : '…'}
                        </span>
                      ),
                      hasCadence: scaleCadence != null ? 'yes' : 'no',
                      days: scaleCadence ?? 0,
                      hasCeiling: scaleCeiling != null ? 'yes' : 'no',
                      ceiling:
                        scaleCeiling != null
                          ? formatCurrency(scaleCeiling, currency, uiLocale)
                          : '',
                    })}
                  </p>
                </FieldRow>
                <NumberField
                  control={form.control}
                  id={`manage-scale-growth-${portfolio.id}`}
                  label={uiText('grow_by_4db36a8')}
                  name="scale_growth_pct"
                  suggested="10"
                  suggestionLabel={uiText('manageSuggestion', {
                    kind: 'suggest',
                    amount: formatPercent(10, {}, uiLocale),
                    days: 0,
                  })}
                />
                <NumberField
                  control={form.control}
                  id={`manage-scale-cadence-${portfolio.id}`}
                  label={uiText('every_days_df0e6cc')}
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
                  label={uiText('template_16d7c73baa3d', {
                    hasSymbol: symbol ? 'yes' : 'no',
                    symbol: symbol ?? '',
                  })}
                  name="scale_max_daily"
                >
                  <p className="text-xs text-muted-foreground">
                    {uiText('a_ceiling_for_the_daily_total_blank_means_no__22f2126')}
                  </p>
                </NumberField>
              </>
            ) : null}
          </Section>

          <Section
            description={uiText('a_start_date_an_end_date_and_a_budget_with_al_7d4d5d0')}
            id={sectionId('plan')}
            title={uiText('plan_fa8ed0b')}
          >
            <FieldRow
              htmlFor={`manage-lookback-${portfolio.id}`}
              label={uiText('lookback_window_dd152e0')}
            >
              <Select
                onValueChange={(value) =>
                  form.setValue('lookback_window', value as LookbackWindow, {
                    shouldDirty: true,
                  })
                }
                value={lookbackWindow}
              >
                <SelectTrigger id={`manage-lookback-${portfolio.id}`}>
                  <SelectValue
                    items={selectLabels(LOOKBACK_WINDOWS, (window) =>
                      uiText('manageLookback', { window }),
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {LOOKBACK_WINDOWS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {uiText('manageLookback', { window: value })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{lookbackHint.reason}</p>
              {lookbackHint.window !== lookbackWindow ? (
                <SuggestionChip
                  label={uiText('template_1a047c4b6b9e', {
                    v0: uiText('manageLookback', {
                      window: lookbackHint.window,
                    }),
                  })}
                  onClick={() =>
                    form.setValue('lookback_window', lookbackHint.window, {
                      shouldDirty: true,
                    })
                  }
                />
              ) : null}
            </FieldRow>
            <FieldRow
              htmlFor={`manage-flight-${portfolio.id}`}
              label={uiText('flight_window_8b37603')}
            >
              <DateRangeField
                disabled={saving}
                id={`manage-flight-${portfolio.id}`}
                onChange={(range) => {
                  form.setValue('period_start', range.from, {
                    shouldDirty: true,
                  });
                  form.setValue('period_end', range.to, { shouldDirty: true });
                }}
                placeholder={uiText('no_flight_window_607083d')}
                value={{
                  from: values.period_start ?? null,
                  to: values.period_end ?? null,
                }}
              />
              <p className="text-xs text-muted-foreground">
                {values.period_start && values.period_end
                  ? uiText('template_8343cfbd9675', { v0: flightLength ?? '' })
                  : uiText('set_start_and_end_dates_to_pace_against_the_b_8f21454')}
              </p>
              {!(values.period_start && values.period_end) ? (
                <SuggestionChip
                  label={uiText('template_00b47b38da96', {
                    v0: PACING_PERIOD_DAYS,
                  })}
                  onClick={() => {
                    const range = nextFlightWindow(PACING_PERIOD_DAYS);
                    form.setValue('period_start', range.from, {
                      shouldDirty: true,
                    });
                    form.setValue('period_end', range.to, {
                      shouldDirty: true,
                    });
                  }}
                />
              ) : null}
            </FieldRow>
            <FieldRow
              htmlFor={`manage-period-${portfolio.id}`}
              label={uiText('template_a056a92d3df9', {
                v0: unit,
                v1: GRANULARITY_LABEL[budgetGranularity].toLowerCase(),
              })}
            >
              <ToggleGroup
                aria-label={uiText('budget_granularity_d1f47f1')}
                className="flex-wrap"
                onValueChange={(next) => {
                  if (next) handleGranularityChange(next as BudgetGranularity);
                }}
                size="sm"
                type="single"
                value={budgetGranularity}
                variant="outline"
              >
                {(Object.keys(GRANULARITY_LABEL) as BudgetGranularity[]).map((value) => (
                  <ToggleGroupItem className="h-6 px-2 text-xs" key={value} value={value}>
                    {GRANULARITY_LABEL[value]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
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
                    ? uiText('manageSuggestion', {
                        kind: 'match',
                        amount: formatCurrency(Math.round(dailyNum), currency, uiLocale),
                        days: 0,
                      })
                    : budgetGranularity === 'total' && suggestedPeriod != null
                      ? uiText('manageSuggestion', {
                          kind: 'period',
                          amount: formatCurrency(suggestedPeriod, currency, uiLocale),
                          days: PACING_PERIOD_DAYS,
                        })
                      : undefined
                }
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {storedPeriodBudget != null && flightLength != null
                  ? uiText('template_9c98c5150e32', {
                      v0: formatCurrency(storedPeriodBudget, currency, uiLocale),
                      v1: formatCurrency(impliedDaily, currency, uiLocale),
                    })
                  : storedPeriodBudget != null
                    ? uiText('set_a_flight_window_to_pace_this_budget_over__3068314')
                    : uiText('clear_to_leave_the_portfolio_unpaced_c67d350')}
              </p>
            </FieldRow>
          </Section>

          <Section
            description={uiText('off_the_optimizer_compares_each_creative_agai_78bc9af')}
            id={sectionId('creative')}
            title={uiText('creative_analysis_d28c315')}
          >
            <FieldRow label={uiText('ad_level_analysis_bb02be1')} switchRow>
              <div className="flex items-center gap-3">
                <Switch
                  aria-label={uiText('ad_level_analysis_bb02be1')}
                  checked={creativeAnalysis === 'on'}
                  id={`manage-creative-analysis-${portfolio.id}`}
                  onCheckedChange={(checked) =>
                    form.setValue(
                      'creative_analysis',
                      (checked ? 'on' : 'off') as CreativeAnalysis,
                      {
                        shouldDirty: true,
                      },
                    )
                  }
                />
                <Label htmlFor={`manage-creative-analysis-${portfolio.id}`}>
                  {creativeAnalysis === 'on'
                    ? uiText('on_reads_each_creative_s_own_trend_6b31976')
                    : uiText('off_ad_set_level_only_b662a4e')}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {creativeAnalysis === 'on'
                  ? uiText('this_portfolio_can_flag_a_creative_that_is_de_9a64d65')
                  : uiText('turn_on_to_see_which_creatives_are_wearing_ou_84d94b3')}
              </p>
            </FieldRow>
          </Section>

          <Section
            description={uiText('what_this_portfolio_counts_its_results_with_t_5b09000')}
            id={sectionId('attribution')}
            title={uiText('attribution_a902dcc')}
          >
            <AttributionSection brandId={brandId} portfolioId={portfolio.id} />
          </Section>

          {guardrailsRelevant ? (
            <Section
              id={sectionId('guardrails')}
              title={uiText('autopilot_guardrails_4528348')}
              description={uiText('both_caps_are_required_to_turn_autopilot_on_t_055d5db')}
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
                    {isPaused ? uiText('resume_d640c74') : uiText('stop_cae7d57')}
                  </Button>
                ) : null
              }
            >
              {isPaused && portfolio.apply_mode === 'autopilot' ? (
                <p className="mb-1 text-xs text-amber-600 dark:text-amber-400">
                  {uiText('stopped_no_autonomous_budget_writes_until_you_28c28de')}
                </p>
              ) : null}
              <FieldRow label={uiText('what_autopilot_may_approve_05b49e1')} switchRow>
                <AutopilotScopesField
                  disabled={portfolio.apply_mode !== 'autopilot' && !isArmed}
                  noActor={
                    portfolio.apply_mode === 'autopilot' &&
                    portfolio.apply_mode_changed_by === null &&
                    portfolio.autopilot_scopes_changed_by === null
                  }
                  onChange={(scope, enabled) => {
                    setSavingScope(scope);
                    // The promise goes back to the field so it can tell a key the database does
                    // not accept yet from an ordinary failure.
                    return update
                      .mutateAsync({
                        portfolio_id: portfolio.id,
                        patch: { autopilot_scopes: { [scope]: enabled } },
                      })
                      .finally(() => setSavingScope(null));
                  }}
                  portfolioId={portfolio.id}
                  savingScope={savingScope}
                  scopes={portfolio.autopilot_scopes ?? null}
                />
              </FieldRow>
              <NumberField
                control={form.control}
                id={`manage-maxdaily-${portfolio.id}`}
                label={uiText('template_8994591a3490', { v0: unit })}
                name="max_daily_apply_minor"
                suggested={suggestedMaxDaily}
                suggestionLabel={
                  suggestedMaxDaily != null
                    ? uiText('manageSuggestion', {
                        kind: 'suggest',
                        amount: formatCurrency(suggestedMaxDaily, currency, uiLocale),
                        days: 0,
                      })
                    : undefined
                }
              />
              <NumberField
                control={form.control}
                id={`manage-maxpct-${portfolio.id}`}
                label={uiText('max_change_per_cycle_f6b020b')}
                name="max_change_pct_per_cycle"
                suggested={SUGGESTED_MAX_CHANGE_PCT}
                suggestionLabel={uiText('manageSuggestion', {
                  kind: 'suggest',
                  amount: formatPercent(Number(SUGGESTED_MAX_CHANGE_PCT), {}, uiLocale),
                  days: 0,
                })}
              />

              {!isArmed ? (
                <FieldRow label={uiText('before_you_arm_50f5b3e')}>
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
                </FieldRow>
              ) : null}
            </Section>
          ) : null}

          <Section
            id={sectionId('platform-limits')}
            title={uiText('daily_limit_per_platform_6039fa8')}
            description={uiText('the_guardrails_on_this_portfolio_apply_the_sa_bcd20cd')}
          >
            <PlatformCapsField portfolioId={portfolio.id} />
          </Section>

          {holdsNonMeta ? (
            <Section
              id={sectionId('platform-actions')}
              title={uiText('allowed_actions_per_platform_f9ff3a8')}
              description={uiText('what_the_optimizer_may_change_on_each_platfor_8f2ab1a')}
            >
              <PlatformActionsField portfolioId={portfolio.id} />
            </Section>
          ) : null}

          <Section
            id={sectionId('enrolled')}
            title={
              level === 'campaign'
                ? uiText('enrolled_campaigns_a37742e')
                : uiText('enrolled_ad_sets_6b4145f')
            }
          >
            <div
              className="space-y-1.5 outline-none"
              id={`manage-roster-${portfolio.id}`}
              tabIndex={-1}
            >
              <MultiPlatformPicker
                brandId={brandId}
                metaAccount={adAccountId}
                portfolioId={portfolio.id}
                portfolioCurrency={currency ?? null}
              >
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
              </MultiPlatformPicker>
              {toAdd.length > 0 || toRemove.length > 0 ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {toAdd.length > 0 ? uiText('template_84db9eb399da', { v0: toAdd.length }) : ''}
                  {toAdd.length > 0 && toRemove.length > 0 ? ' · ' : ''}
                  {toRemove.length > 0
                    ? uiText('template_7d0593fd76d4', { v0: toRemove.length })
                    : ''}
                </p>
              ) : null}
              <DriftedEnrollments rows={enrolledRead.data} />
            </div>
          </Section>

          <Collapsible
            className="border-border/60 border-t py-4"
            open={advancedOpen}
            onOpenChange={setAdvancedOpen}
          >
            <CollapsibleTrigger
              render={
                <button
                  type="button"
                  className="hit-area flex w-full items-center justify-between text-sm font-semibold tracking-tight"
                >
                  {uiText('advanced_9f088db')}
                  <ChevronDown
                    className={cn(
                      'size-4 text-muted-foreground transition-transform',
                      advancedOpen && 'rotate-180',
                    )}
                  />
                </button>
              }
            />
            <CollapsibleContent className="mt-2">
              <NumberField
                control={form.control}
                id={`manage-velocity-${portfolio.id}`}
                label={uiText('max_move_per_ad_set_cycle_1fd39e8')}
                name="velocity_cap_pct"
              >
                <p className="text-xs text-muted-foreground">
                  {uiText('caps_how_far_any_single_ad_set_s_budget_can_m_cfadd90')}
                </p>
              </NumberField>
            </CollapsibleContent>
          </Collapsible>

          {rootError ? (
            <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {rootError}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive"
                  >
                    <Archive className="size-3.5" />
                    {uiText('archive_66f4804')}
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {uiText.rich('sentence_cfd01f1c97e4', {
                      v0: portfolio.name,
                    })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {uiText('it_stops_running_cycles_and_leaves_your_list__89d698a')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{uiText('cancel_19766ed')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleArchive}>
                    {uiText('archive_66f4804')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onDone?.()}>
                {uiText('cancel_19766ed')}
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={!hasChanges || saving}
                onClick={() => void submit()}
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {saving ? uiText('saving_23e3929') : uiText('save_changes_dd0ae7a')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog
        open={pendingAutopilot}
        onOpenChange={(open) => {
          if (!open) setPendingAutopilot(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {uiText.rich('sentence_d675c7da3ad7', { v0: portfolio.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {uiText('autopilot_begins_writing_real_budgets_to_meta_53f287a')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAutopilot(false)}>
              {uiText('cancel_19766ed')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                form.setValue('apply_mode', 'autopilot', { shouldDirty: true });
                setPendingAutopilot(false);
                setArming(false);
              }}
            >
              {uiText('turn_on_autopilot_67b12ff')}
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
            <AlertDialogTitle>
              {uiText.rich('sentence_04c36bd81aa7', {
                v0: humanize(objective, uiText),
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {uiText.rich('sentence_7c52a44b7ec8', {
                v0: affectedAdsets.length,
                v1: enrolledIds.length,
                v2: metric.resultLabel,
                v3: mismatchLabel,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{uiText('cancel_19766ed')}</AlertDialogCancel>
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
              {uiText('change_objective_save_4f92cab')}
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
              {uiText.rich('sentence_6f9141c809eb', {
                v0:
                  toAdd.length === 1
                    ? uiText('this_ad_set_75e5434')
                    : uiText('these_ad_sets_21b1211'),
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {uiText('an_ad_set_can_only_be_optimized_by_one_portfo_4fd0ef1')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {pendingMoves.map((move) => (
              <li key={move.portfolioName}>
                {uiText.rich('sentence_a9c87121f4de', {
                  count: () => (
                    <span className="font-medium text-foreground">{move.adsetIds.length}</span>
                  ),
                  amount: move.adsetIds.length,
                  name: () => (
                    <span className="font-medium text-foreground">{move.portfolioName}</span>
                  ),
                })}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{uiText('cancel_19766ed')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowMoveConfirm(false);
                saveConfirmed();
              }}
            >
              {uiText('move_save_f4c8f24')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const uiText = useTranslations('scale');
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
    <div className="space-y-2">
      <p className="text-xs font-medium">
        {capsSet
          ? uiText('both_caps_are_set_preview_the_cycle_autopilot_94f5b1a')
          : uiText('set_both_caps_above_to_preview_what_autopilot_8dc3bd9')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
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
          {cyclePreview.isPending
            ? uiText('running_the_engine_b3ef1f3')
            : uiText('preview_what_autopilot_would_do_28525bb')}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          disabled={outcome?.status !== 'ready'}
          onClick={onArm}
        >
          {uiText('arm_autopilot_1e4b7df')}
        </Button>
      </div>
      {capsSet && snapshots.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {uiText('enroll_at_least_one_ad_set_below_there_is_not_baa211c')}
        </p>
      ) : null}
      {outcome?.status === 'unavailable' ? (
        <p className="text-xs text-muted-foreground">
          {uiText('the_optimizer_preview_service_isn_t_reachable_4cb5f7a')}
        </p>
      ) : null}
      {outcome?.status === 'error' ? (
        <p className="text-xs text-muted-foreground">
          {uiText('couldn_t_run_the_preview_just_now_try_again_i_584cdd4')}
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
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
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
      <p className="rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">
        {uiText.rich('sentence_6e1b155aaa82', {
          v0: formatCurrency(dailyTotal, currency, uiLocale),
          v1: formatCurrency(ceilingMajor, currency, uiLocale),
        })}
      </p>
    );
  }

  const applied = forecast.wouldApply.length;
  const held = forecast.wouldHold.length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {uiText.rich('sentence_2812bbaf3093', {
          applied: () => (
            <span className="font-medium text-foreground tabular-nums">{applied}</span>
          ),
          count: applied,
          held: () => <span className="font-medium text-foreground tabular-nums">{held}</span>,
        })}
      </p>
      <ReallocationFlow items={flowItems} currency={currency} />
      <p className="text-xs text-muted-foreground">
        {uiText('a_preview_only_the_engine_ran_read_only_and_n_dba8128')}
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
  const body = (
    <>
      <Input
        className="max-w-[12rem] tabular-nums"
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
        <p className="text-xs text-destructive">{fieldState.error.message}</p>
      ) : null}
    </>
  );
  // An unlabeled field sits inside a row that already carries its label.
  if (!label) return <div className="space-y-1.5">{body}</div>;
  return (
    <FieldRow htmlFor={id} label={label}>
      {body}
    </FieldRow>
  );
}

type SheetSection = { id: string; label: string };

/** The Manage sheet's index: a sticky column beside the sections in a wide container, a
 *  row of scrollable chips above them in a narrow one. The section nearest the top of the
 *  viewport is marked current; clicking scrolls to it. */
function SheetIndex({ sections }: { sections: SheetSection[] }) {
  const uiText = useTranslations('scale');
  const ids = sections.map((section) => section.id);
  const [active, setActive] = useActiveSection(ids);
  return (
    <nav
      aria-label={uiText('manage_sections_98d40fa')}
      className="sticky top-0 z-10 mb-4 flex gap-1 overflow-x-auto bg-background py-1 @3xl/manage:mb-0 @3xl/manage:flex-col @3xl/manage:self-start @3xl/manage:overflow-visible @3xl/manage:py-0"
    >
      {sections.map((section) => (
        <button
          aria-current={active === section.id ? 'location' : undefined}
          className={cn(
            'shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground',
            active === section.id && 'bg-muted font-semibold text-foreground',
          )}
          key={section.id}
          onClick={() => {
            setActive(section.id);
            document
              .getElementById(section.id)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          type="button"
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}

/** Which section the operator is reading: the first one crossing the top 40% of the viewport. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? '');
  const key = ids.join('|');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const order = key.split('|');
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const current = order.find((id) => visible.get(id));
        if (current) setActive(current);
      },
      { rootMargin: '0px 0px -60% 0px' },
    );
    for (const id of order) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key]);
  return [active, setActive] as const;
}

/** One part of the sheet: a hairline above, a heading, a one-line description, then rows. */
function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="scroll-mt-14 border-border/60 border-t py-5 first:border-t-0 first:pt-0 @3xl/manage:scroll-mt-4"
      id={id}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm tracking-tight" id={headingId}>
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Label in a fixed left column, control on the right — stacked when the sheet is narrow.
 *  A switch row drops the label's top offset, which otherwise centres it on a 36px input. */
function FieldRow({
  children,
  htmlFor,
  label,
  switchRow,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  label: string;
  switchRow?: boolean;
}) {
  return (
    <div className="grid gap-1.5 py-2.5 @lg/sheet:grid-cols-[11rem_minmax(0,1fr)] @lg/sheet:gap-6">
      <Label
        className={cn(
          'self-start text-muted-foreground @lg/sheet:pt-2',
          switchRow && '@lg/sheet:pt-0.5',
        )}
        htmlFor={htmlFor}
      >
        {label}
      </Label>
      <div className="min-w-0 space-y-1.5">{children}</div>
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
      // On touch its 44px hit area reached up into the input it fills; the px margin keeps
      // the two apart.
      className="hit-area inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted pointer-coarse:mt-[14px]"
    >
      {label}
      <span aria-hidden="true" className="rounded border border-border/70 bg-background px-1">
        ⇥
      </span>
    </button>
  );
}
