'use client';

// The four-step portfolio wizard. Owns the draft, the step, and the one create+enroll
// pipeline both paths (a suggestion, from scratch) share — the two hand-duplicated
// pipelines this replaces could disagree about what a portfolio was created with.
//
// Data paths are unchanged from before: suggestions from optimizer-suggest, the picker from
// paid-media-metrics snapshots + inventory, create through optimizer_create_portfolio,
// enroll through optimizer-enroll (by ad-set ids, or by campaign id when whole campaigns
// were chosen), then a first cycle. Creating in Autopilot is allowed here because the
// create RPC now stores the guardrails the DB requires.

import type { AdSetSnapshot, PortfolioSuggestion } from '@continuum/contracts';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, Loader2Icon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSetupAdvice } from '../../advisor/SetupAdvisor';
import { buildClaimMap, previewMoves } from '../../picker/campaignGroups';
import { buildPortfolioPickerEntities } from '../../picker/portfolioPickerEntities';
import {
  useOptimizerAccountEnrollments,
  useOptimizerAdsetInventory,
  useOptimizerMutations,
} from '../../useOptimizerData';
import { StepAssets } from './StepAssets';
import { StepGoal } from './StepGoal';
import { StepPlan } from './StepPlan';
import { Stepper } from './Stepper';
import { StepStart, type SuggestionOverride } from './StepStart';
import { WizardSummary } from './WizardSummary';
import {
  buildCreateConfig,
  draftFromSuggestion,
  effectiveTargetMetric,
  emptyDraft,
  stepIssues,
  WIZARD_STEPS,
  type WizardDraft,
  type WizardStep,
} from './wizardModel';

type PortfolioWizardProps = {
  brandId: string;
  adAccountId: string;
  currency: string | null;
  suggestions: PortfolioSuggestion[];
  suggestionsLoading: boolean;
  suggestionsError: boolean;
  suggestionsEmptyMessage: string;
  snapshots: AdSetSnapshot[];
  snapshotsLoading: boolean;
  snapshotsError: boolean;
  onCreated?: (portfolioId: string) => void;
  /** Rendered under the suggestions on step 1 (CBO campaigns, projections). */
  startExtras?: React.ReactNode;
};

const STEP_ORDER: WizardStep[] = WIZARD_STEPS.map((step) => step.id);

export function PortfolioWizard({
  brandId,
  adAccountId,
  currency,
  suggestions,
  suggestionsLoading,
  suggestionsError,
  suggestionsEmptyMessage,
  snapshots,
  snapshotsLoading,
  snapshotsError,
  onCreated,
  startExtras,
}: PortfolioWizardProps) {
  const [step, setStep] = useState<WizardStep>('start');
  const [draft, setDraft] = useState<WizardDraft>(emptyDraft);
  const [completed, setCompleted] = useState<Set<WizardStep>>(new Set());
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const { create, enroll, run } = useOptimizerMutations(brandId, adAccountId);
  const inventoryRead = useOptimizerAdsetInventory(brandId, adAccountId, true);
  const accountEnrollmentsRead = useOptimizerAccountEnrollments(brandId, adAccountId);
  const claims = useMemo(
    () => buildClaimMap(accountEnrollmentsRead.data, null),
    [accountEnrollmentsRead.data],
  );
  const pickerEntities = useMemo(
    () => buildPortfolioPickerEntities({ snapshots, inventory: inventoryRead.data, enrolled: [] }),
    [inventoryRead.data, snapshots],
  );

  const patch = useCallback((next: Partial<WizardDraft>) => {
    setDraft((prev) => ({ ...prev, ...next }));
  }, []);

  const selectedBudgetSum = useMemo(() => {
    const ids = new Set(draft.adsetIds);
    return pickerEntities
      .filter((entity) => ids.has(entity.id))
      .reduce((sum, entity) => sum + (entity.currentBudget ?? 0), 0);
  }, [pickerEntities, draft.adsetIds]);
  const inactiveCount = useMemo(() => {
    const ids = new Set(draft.adsetIds);
    return pickerEntities.filter(
      (entity) =>
        ids.has(entity.id) &&
        'providerLifecycle' in entity &&
        entity.providerLifecycle !== 'active',
    ).length;
  }, [pickerEntities, draft.adsetIds]);
  const blockedCount = useMemo(
    () =>
      draft.adsetIds.filter((id) => {
        const claim = claims.get(id);
        return claim ? !claim.canRelease : false;
      }).length,
    [draft.adsetIds, claims],
  );
  const moves = useMemo(() => previewMoves(draft.adsetIds, claims), [draft.adsetIds, claims]);

  const advice = useSetupAdvice({
    snapshots,
    selectedIds: draft.adsetIds,
    objective: effectiveTargetMetric(draft),
    mode: draft.mode,
    dailyTotal: draft.dailyTotal,
    target: draft.target,
  });

  const issues = stepIssues(draft, step, { selectedBudgetSum, blockedCount });
  const stepIndex = STEP_ORDER.indexOf(step);
  const isLast = stepIndex === STEP_ORDER.length - 1;
  const busy = create.isPending || enroll.isPending;

  function goTo(next: WizardStep) {
    setStep(next);
  }
  function advance() {
    if (issues.length > 0) return;
    setCompleted((prev) => new Set(prev).add(step));
    const next = STEP_ORDER[stepIndex + 1];
    if (next) setStep(next);
  }
  function back() {
    const prev = STEP_ORDER[stepIndex - 1];
    if (prev) setStep(prev);
  }

  function pickSuggestion(suggestion: PortfolioSuggestion, override?: SuggestionOverride) {
    const seeded = draftFromSuggestion(suggestion);
    setDraft(
      override
        ? {
            ...seeded,
            objective: override.objective,
            mode: override.mode,
            targetMetric: null,
            target: override.objective === suggestion.objective ? seeded.target : '',
          }
        : seeded,
    );
    setCompleted(new Set(['start']));
    setStep('assets');
  }
  function startScratch() {
    setDraft({ ...emptyDraft(), source: 'scratch' });
    setCompleted(new Set(['start']));
    setStep('assets');
  }

  async function submit() {
    if (issues.length > 0 || busy) return;
    setFailure(null);
    const config = buildCreateConfig(draft, {
      currency,
      selectedBudgetSum,
      level: draft.assetMode,
    });
    try {
      const { portfolio_id } = await create.mutateAsync({
        brand_id: brandId,
        ad_account_id: adAccountId,
        config,
      });
      setCreatedId(portfolio_id);
      if (draft.assetMode === 'campaign' && draft.campaignIds.length > 0) {
        // One enroll per campaign: the server takes every eligible ad set in it.
        for (const campaignId of draft.campaignIds) {
          await enroll.mutateAsync({ portfolio_id, campaign_id: campaignId });
        }
      } else {
        const nameById = new Map(pickerEntities.map((entity) => [entity.id, entity.name]));
        const adset_names: Record<string, string> = {};
        for (const id of draft.adsetIds) {
          const name = nameById.get(id);
          if (name && name.trim().length > 0) adset_names[id] = name;
        }
        await enroll.mutateAsync({
          portfolio_id,
          adset_ids: draft.adsetIds,
          ...(Object.keys(adset_names).length > 0 ? { adset_names } : {}),
        });
      }
      run.mutate(portfolio_id);
      onCreated?.(portfolio_id);
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Could not create the portfolio.');
    }
  }

  const showSummary = step !== 'start';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Stepper completed={completed} current={step} onSelect={goTo} />

      <div
        className={
          showSummary
            ? 'grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]'
            : 'min-h-0 flex-1'
        }
      >
        <div className="min-h-0 overflow-y-auto pr-1">
          {step === 'start' ? (
            <StepStart
              accountId={adAccountId}
              brandId={brandId}
              currency={currency}
              emptyMessage={suggestionsEmptyMessage}
              extras={startExtras}
              isError={suggestionsError}
              isLoading={suggestionsLoading}
              onPick={pickSuggestion}
              onScratch={startScratch}
              snapshots={snapshots}
              suggestions={suggestions}
            />
          ) : null}
          {step === 'assets' ? (
            <StepAssets
              accountId={adAccountId}
              assetMode={draft.assetMode}
              brandId={brandId}
              campaignIds={draft.campaignIds}
              claims={claims}
              currency={currency}
              disabled={busy}
              entities={pickerEntities}
              inventoryFreshness={{
                fetchedAt: inventoryRead.fetchedAt,
                refresh: inventoryRead.refresh,
                canRefresh: inventoryRead.canRefresh,
                isRefreshing: inventoryRead.isRefreshing,
                partial: inventoryRead.partial,
                truncated: inventoryRead.truncated,
                isError: inventoryRead.isError,
              }}
              isError={snapshotsError}
              isLoading={snapshotsLoading || inventoryRead.isLoading}
              objective={draft.objective}
              onAssetModeChange={(assetMode) => patch({ assetMode })}
              onChangeCampaigns={(campaignIds) => patch({ campaignIds })}
              onChangeSelection={(adsetIds) => patch({ adsetIds })}
              selectedIds={draft.adsetIds}
              warnings={{ inactiveCount, blockedCount, moves }}
            />
          ) : null}
          {step === 'goal' ? (
            <StepGoal
              advice={advice}
              currency={currency}
              disabled={busy}
              draft={draft}
              onChange={patch}
            />
          ) : null}
          {step === 'plan' ? (
            <StepPlan
              advice={advice}
              currency={currency}
              disabled={busy}
              draft={draft}
              onChange={patch}
              selectedBudgetSum={selectedBudgetSum}
            />
          ) : null}
        </div>

        {showSummary ? (
          <div className="min-h-0 lg:overflow-y-auto">
            <WizardSummary
              advice={advice}
              brandId={brandId}
              currency={currency}
              disabled={busy}
              draft={draft}
              onChangeSelection={(adsetIds) => patch({ adsetIds, campaignIds: [] })}
              onUseBudget={(value) => patch({ dailyTotal: value })}
              onUseTarget={(value) => patch({ target: value })}
              selectedBudgetSum={selectedBudgetSum}
            />
          </div>
        ) : null}
      </div>

      {step !== 'start' ? (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-border/60 border-t pt-3">
          <div className="min-w-0 flex-1">
            {failure ? (
              <p className="text-destructive text-xs" role="alert">
                {failure}
                {createdId
                  ? ' The portfolio exists — fix the above and press Create again to enroll, or add ad sets from Manage.'
                  : ''}
              </p>
            ) : issues.length > 0 ? (
              <p className="text-2xs text-muted-foreground" role="status">
                {issues[0]}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button className="gap-1.5" onClick={back} size="sm" type="button" variant="outline">
              <ArrowLeftIcon aria-hidden className="size-3.5" />
              Back
            </Button>
            {isLast ? (
              <Button
                className="gap-1.5"
                disabled={issues.length > 0 || busy}
                onClick={() => void submit()}
                size="sm"
                type="button"
              >
                {busy ? (
                  <Loader2Icon aria-hidden className="size-3.5 animate-spin" />
                ) : (
                  <CheckIcon aria-hidden className="size-3.5" />
                )}
                {busy
                  ? 'Creating…'
                  : `Create & enroll ${draft.adsetIds.length} ad set${draft.adsetIds.length === 1 ? '' : 's'}`}
              </Button>
            ) : (
              <Button
                className="gap-1.5"
                disabled={issues.length > 0}
                onClick={advance}
                size="sm"
                type="button"
              >
                Next
                <ArrowRightIcon aria-hidden className="size-3.5" />
              </Button>
            )}
          </div>
        </footer>
      ) : null}
    </div>
  );
}
