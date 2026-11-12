'use client';

import { useLocale, useTranslations } from 'next-intl';

// Surfaces the account's CBO ("Advantage Campaign Budget") campaigns as
// not-yet-optimizable, with a one-click "Convert to ad-set budgets" preview. The
// Optimizer stays ad-set-level only: it never reallocates a campaign budget.
// Instead, converting a CBO campaign to ABO (budgets on the ad sets) makes its ad
// sets optimizable by the existing ad-set optimizer.
//
// Money safety: the convert edge does the real Meta write, but the FE only ever
// calls it with dryRun:true — a PREVIEW of the per-ad-set budgets that WOULD be
// set, zero writes. The dialog's "Apply" action is disabled until a sandbox bench
// validates the real write on a Meta test campaign (un-gated in a follow-up PR).

import type { AdSetSnapshot, CycleItemRow } from '@continuum/contracts';
import {
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
    default:
      return error?.trim() || "Couldn't compute the conversion preview. Try again in a moment.";
  }
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
  const uiText = useTranslations('scale');
  const convert = useConvertCbo(brandId);
  const applyNoteId = useId();
  const adsetLabel = `${section.totalCount} ad set${section.totalCount === 1 ? '' : 's'}`;

  // Fire a fresh dryRun preview each time the dialog opens (snapshots may change).
  const requestPreview = () => {
    convert.mutate({ brandId, accountId, campaignId: section.campaignId, dryRun: true });
  };

  const preview = convert.data;
  const previewCurrency = preview?.currency ?? currency;
  const budgets = preview?.ok ? preview.adset_budgets : [];

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
              {uiText.rich('sentence_7050df37716b', { v0: section.campaignName })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {uiText('converting_removes_the_campaign_s_advantage_c_9e63466')}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ConvertPreviewBody
            isPending={convert.isPending}
            isError={convert.isError}
            preview={preview}
            budgets={budgets}
            currency={previewCurrency}
            section={section}
          />

          {preview?.ok && budgets.length > 0 ? (
            <ConvertedPreview
              brandId={brandId}
              accountId={accountId}
              campaignSnapshots={campaignSnapshots}
              budgets={budgets}
              currency={previewCurrency}
            />
          ) : null}

          {/* ONE statement of why Apply is off, and it names the move the user can
              make today. This used to be said twice — once here and once in the
              dialog description — while neither offered an alternative, so the
              flow diagnosed the problem, simulated the fix, and then refused.
              Bound to the button by aria-describedby rather than a `title`: a
              native tooltip on a disabled button is unreliable and unreachable by
              keyboard. */}
          <p className="text-xs text-muted-foreground" id={applyNoteId}>
            {uiText('one_click_convert_is_still_being_validated_ag_77df4ad')}
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel>{uiText('close_7d9eb7a')}</AlertDialogCancel>
            <Button
              aria-describedby={applyNoteId}
              aria-disabled="true"
              className="gap-1.5"
              disabled
              type="button"
            >
              {uiText('apply_31e392d')}
            </Button>
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

function ConvertPreviewBody({
  isPending,
  isError,
  preview,
  budgets,
  currency,
  section,
}: {
  isPending: boolean;
  isError: boolean;
  preview: ReturnType<typeof useConvertCbo>['data'];
  budgets: { adset_id: string; adset_name?: string | null; daily_major: number }[];
  currency: string | null;
  section: CampaignSection;
}) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
        {uiText('computing_per_ad_set_budgets_3b8d97f')}
      </p>
    );
  }

  if (isError || preview == null) {
    return (
      <InlineError>{uiText('couldn_t_compute_the_conversion_preview_try_a_6999dab')}</InlineError>
    );
  }

  if (!preview.ok) {
    return <InlineError>{softFailMessage(preview.reason, preview.error)}</InlineError>;
  }

  if (budgets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {uiText('no_ad_sets_to_convert_in_this_campaign_8847a31')}
      </p>
    );
  }

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
      <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/70">
        {rows.map((row) => (
          <li key={row.adsetId} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm">{row.name}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">
                {row.spend14 == null
                  ? uiText('no_trailing_14d_read_0519917')
                  : uiText('template_3ea51726ffca', {
                      v0: formatCurrency(row.spend14, currency, uiLocale),
                      v1:
                        row.cpa == null
                          ? uiText('no_tracked_results_5f6ef21')
                          : `${formatCurrency(row.cpa, currency, uiLocale)} CPA`,
                    })}
              </span>
            </span>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {uiText.rich('sentence_24e8fe03aac9', {
                v0: formatCurrency(row.newDailyBudget, currency, uiLocale),
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
