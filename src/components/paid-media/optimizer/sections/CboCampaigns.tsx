'use client';

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

import { Loader2Icon, MegaphoneIcon, SplitIcon, TriangleAlertIcon } from 'lucide-react';
import type * as React from 'react';

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
import { formatCurrency } from '../format';
import type { CampaignSection } from '../picker/campaignGroups';
import { useConvertCbo } from '../useOptimizerData';

type CboCampaignsProps = {
  brandId: string;
  accountId: string;
  currency: string | null;
  sections: CampaignSection[];
};

// A soft failure from the convert edge → an actionable, non-technical message.
function softFailMessage(
  reason: string | null | undefined,
  error: string | null | undefined,
): string {
  switch (reason) {
    case 'not_permitted':
      return "This ad account isn't linked to the current brand — reconnect it in Integrations, then try again.";
    case 'no_adsets':
      return 'This campaign has no ad sets to convert yet.';
    case 'no_token':
      return 'Reconnect Meta to preview the conversion.';
    default:
      return error?.trim() || "Couldn't compute the conversion preview. Try again in a moment.";
  }
}

export function CboCampaigns({ brandId, accountId, currency, sections }: CboCampaignsProps) {
  if (sections.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <MegaphoneIcon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">Campaigns using CBO</h3>
        <span className="text-xs text-muted-foreground">not yet optimizable</span>
      </div>
      <p className="text-xs text-muted-foreground">
        These campaigns budget at the campaign level (Advantage Campaign Budget), so their ad sets
        aren&rsquo;t optimizable yet. Convert one to ad-set budgets and the optimizer will manage
        its ad sets.
      </p>
      <div className="space-y-2">
        {sections.map((section) => (
          <CboCampaignRow
            key={section.campaignId}
            brandId={brandId}
            accountId={accountId}
            currency={currency}
            section={section}
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
}: {
  brandId: string;
  accountId: string;
  currency: string | null;
  section: CampaignSection;
}) {
  const convert = useConvertCbo(brandId);
  const adsetLabel = `${section.totalCount} ad set${section.totalCount === 1 ? '' : 's'}`;

  // Fire a fresh dryRun preview each time the dialog opens (snapshots may change).
  const requestPreview = () => {
    convert.mutate({ brandId, accountId, campaignId: section.campaignId, dryRun: true });
  };

  const preview = convert.data;
  const previewCurrency = preview?.currency ?? currency;
  const budgets = preview?.ok ? preview.adset_budgets : [];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight">{section.campaignName}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {adsetLabel} · uses Advantage Campaign Budget (CBO)
        </p>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1.5 px-3 text-xs"
            onClick={requestPreview}
          >
            <SplitIcon className="size-3.5" />
            Convert to ad-set budgets
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Convert &ldquo;{section.campaignName}&rdquo; to ad-set budgets
            </AlertDialogTitle>
            <AlertDialogDescription>
              Preview — applying is validated on a Meta test campaign first. Converting removes the
              campaign&rsquo;s Advantage Campaign Budget and gives each ad set its own daily budget
              so the optimizer can manage them.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ConvertPreviewBody
            isPending={convert.isPending}
            isError={convert.isError}
            preview={preview}
            budgets={budgets}
            currency={previewCurrency}
          />

          <p className="text-2xs text-muted-foreground">
            Applying is disabled while the real write is validated on a Meta test campaign.
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button type="button" disabled aria-disabled="true" className="gap-1.5">
              Apply
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ConvertPreviewBody({
  isPending,
  isError,
  preview,
  budgets,
  currency,
}: {
  isPending: boolean;
  isError: boolean;
  preview: ReturnType<typeof useConvertCbo>['data'];
  budgets: { adset_id: string; adset_name?: string | null; daily_major: number }[];
  currency: string | null;
}) {
  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />
        Computing per-ad-set budgets…
      </p>
    );
  }

  if (isError || preview == null) {
    return (
      <InlineError>
        Couldn&rsquo;t compute the conversion preview. Try again in a moment.
      </InlineError>
    );
  }

  if (!preview.ok) {
    return <InlineError>{softFailMessage(preview.reason, preview.error)}</InlineError>;
  }

  if (budgets.length === 0) {
    return <p className="text-sm text-muted-foreground">No ad sets to convert in this campaign.</p>;
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        Each ad set&rsquo;s new daily budget
      </p>
      <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-md border border-border/70">
        {budgets.map((budget) => (
          <li
            key={budget.adset_id}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate">{budget.adset_name?.trim() || budget.adset_id}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {formatCurrency(budget.daily_major, currency)}/d
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
