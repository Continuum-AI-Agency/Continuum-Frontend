'use client';

import { Building2, ChevronRight, CircleDashed, Coins } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { formatCredits, formatUsd } from '@/lib/billing/billingViewModel';
import type { MeteredSidebarBilling, SidebarBillingView } from '@/lib/billing/sidebarBilling';
import { cn } from '@/lib/utils';

// The active brand's plan and Canvas credits, bottom left on every signed-in page. The row is a
// link to Settings → Billing (at the credit-pack section when metered); hovering or focusing it
// previews the breakdown. Collapsed, only the icon shows, with the same preview. The preview is
// supplementary: everything in it is on the Billing page, which the link opens.

const periodEndFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function accessibleName(view: SidebarBillingView): string {
  switch (view.kind) {
    case 'metered':
      return `Billing: ${view.planLabel}, ${formatCredits(view.remainingCredits)} credits remaining`;
    case 'managed':
      return 'Billing: Managed plan · unmetered';
    case 'no_plan':
      return 'Billing: No plan';
  }
}

export function SidebarBillingWidget({ view }: { view: SidebarBillingView }) {
  const warn = view.kind === 'metered' && view.low;
  const Icon = view.kind === 'metered' ? Coins : view.kind === 'managed' ? Building2 : CircleDashed;

  return (
    <SidebarMenu className="group-data-[collapsible=icon]:items-center">
      <SidebarMenuItem>
        <HoverCard openDelay={150} closeDelay={100}>
          <HoverCardTrigger
            render={
              <Link
                href={view.href}
                aria-label={accessibleName(view)}
                data-testid="sidebar-billing"
                data-kind={view.kind}
                data-low={warn || undefined}
                className={cn(
                  'group/billing btn-fill [--btn-fill:var(--sidebar-hover-bg)] flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-[var(--color-border)] px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
                  'group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:p-0',
                  warn &&
                    'border-[color-mix(in_srgb,var(--warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)]',
                )}
              />
            }
          >
            <span className="relative inline-flex shrink-0">
              <Icon
                aria-hidden
                className={cn(
                  '!h-[18px] !w-[18px] stroke-[1.8]',
                  warn ? 'text-warning' : 'text-[var(--sidebar-muted)]',
                )}
              />
              {warn ? (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 hidden size-1.5 rounded-full bg-warning group-data-[collapsible=icon]:block"
                />
              ) : null}
            </span>
            <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
              <WidgetLines view={view} />
            </span>
            <ChevronRight
              aria-hidden
              className="size-3.5 shrink-0 text-[var(--sidebar-muted-dim)] transition-transform group-hover/billing:translate-x-0.5 group-data-[collapsible=icon]:hidden motion-reduce:transition-none"
            />
          </HoverCardTrigger>
          <HoverCardContent
            side="right"
            align="end"
            sideOffset={12}
            data-testid="sidebar-billing-card"
            className="w-72 p-0"
          >
            <BillingPreview view={view} />
          </HoverCardContent>
        </HoverCard>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function WidgetLines({ view }: { view: SidebarBillingView }) {
  switch (view.kind) {
    case 'metered':
      return (
        <>
          <span className="truncate text-[0.72rem] font-medium tracking-[0.01em] text-[var(--sidebar-muted)]">
            {view.planLabel}
          </span>
          <span
            className={cn(
              'truncate font-mono text-[0.8rem] font-semibold tabular-nums',
              view.low ? 'text-warning' : 'text-[var(--sidebar-foreground)]',
            )}
          >
            {formatCredits(view.remainingCredits)} credits
          </span>
        </>
      );
    // Same two lines as a metered plan; the hidden separator keeps it reading as one phrase.
    case 'managed':
      return (
        <>
          <span className="truncate text-[0.72rem] font-medium tracking-[0.01em] text-[var(--sidebar-muted)]">
            Managed plan
          </span>
          <span className="sr-only"> · </span>
          <span className="truncate text-[0.8rem] font-semibold tracking-[0.01em] text-[var(--sidebar-foreground)] capitalize">
            unmetered
          </span>
        </>
      );
    case 'no_plan':
      return (
        <>
          <span className="truncate text-[0.78rem] font-medium tracking-[0.01em] text-[var(--sidebar-foreground)]">
            No plan
          </span>
          <span className="truncate text-[0.7rem] text-[var(--sidebar-muted)]">
            Choose one in Billing
          </span>
        </>
      );
  }
}

function PreviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-foreground tabular-nums">{children}</dd>
    </div>
  );
}

function BillingPreview({ view }: { view: SidebarBillingView }) {
  if (view.kind === 'managed') {
    return (
      <div className="space-y-1 p-4">
        <p className="text-sm font-semibold text-foreground">Managed plan</p>
        <p className="text-xs text-muted-foreground">
          This brand's access is set by Continuum, and Canvas use isn't metered. Open Billing for
          what it includes.
        </p>
      </div>
    );
  }
  if (view.kind === 'no_plan') {
    return (
      <div className="space-y-1 p-4">
        <p className="text-sm font-semibold text-foreground">No plan</p>
        <p className="text-xs text-muted-foreground">
          Choose Organic Plus or Performance Plus in Billing to unlock Canvas, Organic and paid
          media.
        </p>
      </div>
    );
  }
  return <MeteredPreview view={view} />;
}

function MeteredPreview({ view }: { view: MeteredSidebarBilling }) {
  return (
    <div>
      <div className="space-y-0.5 border-b border-border px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">{view.planLabel}</p>
        <p
          className={cn(
            'font-mono text-lg font-semibold tabular-nums',
            view.low ? 'text-warning' : 'text-foreground',
          )}
        >
          {formatCredits(view.remainingCredits)}{' '}
          <span className="font-sans text-xs font-normal text-muted-foreground">
            credits remaining
          </span>
        </p>
      </div>
      <dl className="space-y-1.5 px-4 py-3 text-xs">
        <PreviewRow label="Included left this period">
          {formatCredits(view.includedRemainingCredits)} of {formatCredits(view.includedCredits)}
        </PreviewRow>
        <PreviewRow label="Rollover">{formatCredits(view.rolloverCredits)}</PreviewRow>
        <PreviewRow label="Purchased packs">{formatCredits(view.purchasedCredits)}</PreviewRow>
        {view.periodEnd ? (
          <PreviewRow label="Period ends">
            {periodEndFormat.format(new Date(view.periodEnd))}
          </PreviewRow>
        ) : null}
        <PreviewRow label="Auto-billing">
          {view.autoBilling.on
            ? `On${view.autoBilling.capUsd !== null ? ` · up to ${formatUsd(view.autoBilling.capUsd)}/mo` : ''}`
            : 'Off'}
        </PreviewRow>
      </dl>
      <p
        className={cn(
          'border-t border-border px-4 py-2.5 text-xs',
          view.exhausted ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        {view.exhausted
          ? 'Out of credits. Buy a pack or turn on auto-billing to keep generating.'
          : 'Click to buy credit packs in Billing.'}
      </p>
    </div>
  );
}
