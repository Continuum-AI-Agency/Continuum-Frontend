'use client';

import { useTranslations as useBetaTranslations, useLocale, useTranslations } from 'next-intl';

// Surfaces the account's CBO ("Advantage Campaign Budget") campaigns as
// not-yet-optimizable, with a one-click "Convert to ad-set budgets". The
// Optimizer stays ad-set-level only: it never reallocates a campaign budget.
// Instead, converting a CBO campaign to ABO (budgets on the ad sets) makes its ad
// sets optimizable by the existing ad-set optimizer.
//
// Money safety: the convert dialog is the approval card (decision 3, Ramiro
// 2026-11-01). Opening it asks the convert edge for a dryRun PREVIEW of the
// per-ad-set budgets, zero writes. Only Apply, clicked inside the dialog while a
// preview with budgets is on screen, asks for the real Meta write, and it carries
// exactly the previewed budgets: the edge writes those, or answers preview_changed
// with the new split and writes nothing.

import type {
  AdSetSnapshot,
  AdsetBudget,
  ConvertCboRequest,
  ConvertCboResponse,
  CycleItemRow,
} from '@continuum/contracts';
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  Loader2Icon,
  MegaphoneIcon,
  SplitIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type * as React from 'react';
import { useId, useMemo, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ReallocationFlow } from '../charts/ReallocationFlow';
import { formatCurrency } from '../format';
import type { CampaignSection } from '../picker/campaignGroups';
import {
  type ConvertBudget,
  type ConvertPreviewRow,
  convertPreviewRows,
  convertPreviewTotals,
  resolvePreviewObjective,
  synthesizePostConvertSnapshots,
} from '../preview/convertPreview';
import { useConvertCbo, useCyclePreview } from '../useOptimizerData';

type CboCampaignsProps = {
  brandId: string;
  accountId: string;
  currency: string | null;
  sections: CampaignSection[];
  // Raw account snapshots (engine input) the parent already reads via
  // useOptimizerAccountSnapshots — filtered per campaign to synthesize the
  // post-convert ad sets the "Preview as converted" expander scores.
  snapshots: AdSetSnapshot[];
};

// A soft failure from the convert edge → an actionable, non-technical message.
function softFailMessage(
  reason: string | null | undefined,
  error: string | null | undefined,
): string {
  switch (reason) {
    case 'not_permitted':
      return "This ad account isn't assigned to this brand. Assign it in Settings → Integrations, then try again.";
    case 'no_adsets':
      return 'This campaign has no ad sets to convert yet.';
    case 'no_token':
      return 'Reconnect Meta to preview the conversion.';
    case 'preview_changed':
      return 'The budgets changed since this preview, so nothing was written. The new budgets are below — Apply again to approve them.';
    default:
      return error?.trim() || "Couldn't compute the conversion preview. Try again in a moment.";
  }
}

/** The convert mutation as the approval card reads it. `variables` is the last request
 *  sent: a preview (dryRun:true) or the real convert Apply asked for (dryRun:false). */
type ConvertState = {
  data: ConvertCboResponse | null | undefined;
  isPending: boolean;
  isError: boolean;
  variables: ConvertCboRequest | undefined;
};

/** Where the approval card stands. `working`/`failed` say whether it was the real convert
 *  (`applying`) or a preview; `changed` is the edge refusing a stale approval with the split
 *  it computes now. */
type ConvertStage =
  | { kind: 'working'; applying: boolean }
  | { kind: 'failed'; applying: boolean }
  | { kind: 'refused'; reason: string | undefined; error: string | undefined }
  | { kind: 'preview'; budgets: AdsetBudget[] }
  | { kind: 'changed'; budgets: AdsetBudget[] }
  | { kind: 'converted'; response: ConvertCboResponse };

function convertStage(convert: ConvertState): ConvertStage {
  const applying = convert.variables?.dryRun === false;
  if (convert.isPending) return { kind: 'working', applying };
  const response = convert.data;
  if (convert.isError || response == null) return { kind: 'failed', applying };
  if (response.ok) {
    // The convert ledger's "already converted today" answer carries no dryRun flag.
    return response.dryRun === false || response.deduped === true
      ? { kind: 'converted', response }
      : { kind: 'preview', budgets: response.adset_budgets };
  }
  if (response.reason === 'preview_changed' && response.adset_budgets.length > 0) {
    return { kind: 'changed', budgets: response.adset_budgets };
  }
  return { kind: 'refused', reason: response.reason, error: response.error };
}

/** The budgets on screen the person can approve: an ok preview's, or the new split a changed
 *  preview came back with. Null when there is nothing to approve. */
function approvableBudgets(stage: ConvertStage): AdsetBudget[] | null {
  if (stage.kind !== 'preview' && stage.kind !== 'changed') return null;
  return stage.budgets.length > 0 ? stage.budgets : null;
}

export function CboCampaigns({
  brandId,
  accountId,
  currency,
  sections,
  snapshots,
}: CboCampaignsProps) {
  const uiText = useTranslations('scale');
  if (sections.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <MegaphoneIcon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">
          {uiText('campaigns_using_cbo_0a67190')}
        </h3>
        <span className="text-xs text-muted-foreground">
          {uiText('not_yet_optimizable_058ba94')}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {uiText('these_campaigns_budget_at_the_campaign_level__4b6ea64')}
      </p>
      <div className="space-y-2">
        {sections.map((section) => (
          <CboCampaignRow
            key={section.campaignId}
            brandId={brandId}
            accountId={accountId}
            currency={currency}
            section={section}
            snapshots={snapshots}
          />
        ))}
      </div>
    </section>
  );
}

function CboCampaignRow({
  brandId,
  accountId,
  currency,
  section,
  snapshots,
}: {
  brandId: string;
  accountId: string;
  currency: string | null;
  section: CampaignSection;
  snapshots: AdSetSnapshot[];
}) {
  const betaUiText = useBetaTranslations('scale');

  const uiText = useTranslations('scale');
  const convert = useConvertCbo(brandId);
  const applyNoteId = useId();
  const adsetLabel = `${section.totalCount} ad set${section.totalCount === 1 ? '' : 's'}`;

  // Fire a fresh dryRun preview each time the dialog opens (snapshots may change).
  const requestPreview = () => {
    convert.mutate({
      brandId,
      accountId,
      campaignId: section.campaignId,
      dryRun: true,
    });
  };

  const stage = convertStage(convert);
  const approvable = approvableBudgets(stage);
  const stageCurrency = convert.data?.currency ?? currency;

  // Apply is the approval: the real convert, bound to exactly the budgets on screen. The edge
  // writes those or answers preview_changed with the split it computes now.
  const apply = () => {
    if (!approvable) return;
    convert.mutate({
      brandId,
      accountId,
      campaignId: section.campaignId,
      dryRun: false,
      expectedAdsetBudgets: approvable.map(({ adset_id, daily_budget }) => ({
        adset_id,
        daily_budget,
      })),
    });
  };

  // The held CBO ad sets of THIS campaign, from the raw account snapshots — the input to
  // synthesizing their post-convert (ABO) state for the "Preview as converted" expander.
  const campaignSnapshots = useMemo(
    () => snapshots.filter((snapshot) => snapshot.campaignId === section.campaignId),
    [snapshots, section.campaignId],
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight">{section.campaignName}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {uiText.rich('sentence_b47703db2cc5', { v0: adsetLabel })}
        </p>
      </div>

      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 gap-1.5 px-3 text-xs"
              onClick={requestPreview}
            >
              <SplitIcon className="size-3.5" />
              {uiText('convert_to_ad_set_budgets_28729cf')}
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {uiText.rich('sentence_7050df37716b', {
                v0: section.campaignName,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {uiText('converting_removes_the_campaign_s_advantage_c_9e63466')}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ConvertDialogBody stage={stage} currency={stageCurrency} section={section} />

          {stage.kind === 'preview' && stage.budgets.length > 0 ? (
            <ConvertedPreview
              brandId={brandId}
              accountId={accountId}
              campaignSnapshots={campaignSnapshots}
              budgets={stage.budgets}
              currency={stageCurrency}
            />
          ) : null}

          {/* What clicking Apply does, bound to the button by aria-describedby rather than
              a `title` (a native tooltip is unreliable and unreachable by keyboard). */}
          {approvable ? (
            <p className="text-xs text-muted-foreground" id={applyNoteId}>
              {betaUiText('beta_fbf77fbc14c7')}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>{betaUiText('beta_7d9eb7acb13e')}</AlertDialogCancel>
            {stage.kind === 'converted' ? null : (
              <Button
                aria-describedby={approvable ? applyNoteId : undefined}
                className="gap-1.5"
                disabled={!approvable}
                onClick={apply}
                type="button"
              >
                {betaUiText('beta_31e392d1c037')}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// The "as-if-converted" full preview: run the ACTUAL optimizer engine over the synthesized
// post-convert ad sets (held CBO ad sets given their dryRun ABO budgets) and render what it
// WOULD reallocate — the same ReallocationFlow a real scored cycle shows. Lazy: the engine
// preview only runs once the operator opens the expander. Read-only end to end.
function ConvertedPreview({
  brandId,
  accountId,
  campaignSnapshots,
  budgets,
  currency,
}: {
  brandId: string;
  accountId: string;
  campaignSnapshots: AdSetSnapshot[];
  budgets: ConvertBudget[];
  currency: string | null;
}) {
  const uiText = useTranslations('scale');
  const [open, setOpen] = useState(false);
  const cyclePreview = useCyclePreview();
  const ranRef = useRef(false);

  const postConvert = useMemo(
    () => synthesizePostConvertSnapshots(campaignSnapshots, budgets),
    [campaignSnapshots, budgets],
  );

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || ranRef.current || postConvert.length === 0) return;
    ranRef.current = true;
    const objective = resolvePreviewObjective(postConvert);
    const total = postConvert.reduce((sum, snapshot) => sum + snapshot.currentBudget, 0);
    cyclePreview.mutate({
      brandId,
      accountId,
      snapshots: postConvert,
      objective,
      mode: 'balanced',
      total,
    });
  };

  return (
    <div className="rounded-md border border-border/60 bg-muted/10">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {uiText.rich('sentence_6fe8c2e1375d', {
          v0: () => (
            <ChevronDownIcon
              className={`size-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          ),
          v1: () => (
            <span className="font-normal text-muted-foreground">
              {uiText('what_the_optimizer_would_do_600f2e8')}
            </span>
          ),
        })}
      </button>
      {open ? (
        <div className="border-t border-border/60 p-3">
          <ConvertedPreviewBody
            hasSnapshots={postConvert.length > 0}
            outcome={cyclePreview.data}
            isPending={cyclePreview.isPending}
            currency={currency}
          />
        </div>
      ) : null}
    </div>
  );
}

function ConvertedPreviewBody({
  hasSnapshots,
  outcome,
  isPending,
  currency,
}: {
  hasSnapshots: boolean;
  outcome: ReturnType<typeof useCyclePreview>['data'];
  isPending: boolean;
  currency: string | null;
}) {
  const uiText = useTranslations('scale');
  if (!hasSnapshots) {
    return (
      <p className="text-xs text-muted-foreground">
        {uiText('no_converted_ad_sets_to_preview_this_campaign_a04f295')}
      </p>
    );
  }
  if (isPending || outcome == null) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
        {uiText('running_the_optimizer_over_the_converted_ad_s_2ae509c')}
      </p>
    );
  }
  // The service (or its edge) isn't deployed yet — degrade quietly, never an error wall.
  if (outcome.status === 'unavailable') {
    return (
      <p className="text-xs text-muted-foreground">
        {uiText('preview_isn_t_available_yet_the_optimizer_pre_69abaa6')}
      </p>
    );
  }
  if (outcome.status === 'error') {
    return (
      <p className="text-xs text-muted-foreground">
        {uiText('couldn_t_run_the_preview_just_now_try_reopeni_01b0c35')}
      </p>
    );
  }

  const { preview } = outcome;
  const flowItems: CycleItemRow[] = preview.items.map((item) => ({
    adset_id: item.adset_id,
    current_budget: item.current_budget,
    final_budget: item.final_budget,
    change_abs: item.change_abs,
    change_pct: item.change_pct,
    diagnostics: item.diagnostics ?? null,
  }));
  const recCount = preview.recommendations.length;

  return (
    <div className="space-y-2">
      <ReallocationFlow items={flowItems} currency={currency} />
      <p className="text-xs text-muted-foreground">
        {recCount === 0
          ? uiText('no_action_recommendations_raised_on_the_conve_3992d68')
          : uiText('template_f6e762d3d09b', { count: recCount })}
      </p>
    </div>
  );
}

function ConvertDialogBody({
  stage,
  currency,
  section,
}: {
  stage: ConvertStage;
  currency: string | null;
  section: CampaignSection;
}) {
  const betaUiText = useBetaTranslations('scale');

  switch (stage.kind) {
    case 'working':
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
          {stage.applying ? betaUiText('beta_fad51b4ff77c') : betaUiText('beta_3b8d97ffbfe8')}
        </p>
      );
    case 'failed':
      // A real convert that did not come back may still have reached Meta. The convert
      // ledger allows one convert per campaign per UTC day, so a second Apply cannot write
      // twice.
      return stage.applying ? (
        <InlineError> {betaUiText('beta_28efd5750f07')} </InlineError>
      ) : (
        <InlineError> {betaUiText('beta_6999dab30a48')} </InlineError>
      );
    case 'refused':
      return <InlineError>{softFailMessage(stage.reason, stage.error)}</InlineError>;
    case 'changed':
      return (
        <div className="space-y-2">
          <InlineError>{softFailMessage('preview_changed', undefined)}</InlineError>
          <BudgetPreview budgets={stage.budgets} currency={currency} section={section} />
        </div>
      );
    case 'preview':
      return stage.budgets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{betaUiText('beta_8847a31fbf88')}</p>
      ) : (
        <BudgetPreview budgets={stage.budgets} currency={currency} section={section} />
      );
    case 'converted':
      return <ConvertOutcome currency={currency} response={stage.response} section={section} />;
  }
}

/** The changeover the card asks to approve: the campaign-held budget today against the
 *  per-ad-set daily budgets that would replace it. */
function BudgetPreview({
  budgets,
  currency,
  section,
}: {
  budgets: ConvertBudget[];
  currency: string | null;
  section: CampaignSection;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();

  const rows = convertPreviewRows(section, budgets);
  const totals = convertPreviewTotals(section, rows);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {uiText.rich('sentence_f82affe02f0f', {
          budget: () => (
            <span className="font-medium text-foreground tabular-nums">
              {formatCurrency(totals.campaignBudgetToday, currency, uiLocale)}
            </span>
          ),
          count: totals.adsetCount,
          total: () => (
            <span className="font-medium text-foreground tabular-nums">
              {uiText.rich('sentence_24e8fe03aac9', {
                v0: formatCurrency(totals.newDailyTotal, currency, uiLocale),
              })}
            </span>
          ),
        })}
      </p>
      <BudgetList currency={currency} rows={rows} />
    </div>
  );
}

function BudgetList({ rows, currency }: { rows: ConvertPreviewRow[]; currency: string | null }) {
  const betaUiText = useBetaTranslations('scale');

  return (
    <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/70">
      {rows.map((row) => (
        <li key={row.adsetId} className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="min-w-0">
            <span className="block truncate text-sm">{row.name}</span>
            <span className="block text-xs text-muted-foreground tabular-nums">
              {row.spend14 == null
                ? betaUiText('beta_05199171506f')
                : betaUiText('beta_65063f4c3579', {
                    value0: String(formatCurrency(row.spend14, currency)),
                    value1: String(
                      row.cpa == null
                        ? betaUiText('cboNoTrackedResults')
                        : `${formatCurrency(row.cpa, currency)} CPA`,
                    ),
                  })}
            </span>
          </span>
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {formatCurrency(row.newDailyBudget, currency)}/d
          </span>
        </li>
      ))}
    </ul>
  );
}

/** What Apply did on Meta: the change in plain words, the daily budget each ad set now holds,
 *  and whether reading the campaign back confirmed it. */
function ConvertOutcome({
  response,
  currency,
  section,
}: {
  response: ConvertCboResponse;
  currency: string | null;
  section: CampaignSection;
}) {
  const betaUiText = useBetaTranslations('scale');

  const rows = convertPreviewRows(section, response.adset_budgets);

  return (
    <div className="space-y-2">
      <p className="flex items-start gap-2 text-sm text-foreground" role="status">
        <CheckCircle2Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
        <span>
          {response.deduped ? betaUiText('beta_92db7e39c7e5') : betaUiText('beta_763cea00f724')}
        </span>
      </p>
      {rows.length > 0 ? <BudgetList currency={currency} rows={rows} /> : null}
      <ReadBackNote response={response} />
    </div>
  );
}

/** The edge reads the campaign and its ad sets back after the write (PP-DT-A-convert-edge-no-
 *  readback); Meta's own answer only says the request was accepted. */
function ReadBackNote({ response }: { response: ConvertCboResponse }) {
  const betaUiText = useBetaTranslations('scale');

  if (response.verified === true) {
    return <p className="text-xs text-muted-foreground">{betaUiText('beta_8f5d6f2f9c39')}</p>;
  }
  if (response.verified === false) {
    return (
      <InlineError>
        {response.read_back?.verdict === 'mismatch'
          ? betaUiText('beta_2a705b58695d')
          : betaUiText('beta_18f1489effe0')}
      </InlineError>
    );
  }
  return null;
}

function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
