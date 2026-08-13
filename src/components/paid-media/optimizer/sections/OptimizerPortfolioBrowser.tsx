'use client';

// Every portfolio the BRAND owns, grouped by the ad account that owns it — the answer to
// "which account is that portfolio on?", which previously required guessing and switching
// accounts one at a time. The brand-level list is already in hand (optimizer_list_portfolios
// is brand-scoped; the account narrowing is a client-side filter), so this costs no extra read.
//
// Rows on the selected account open directly. Rows on another account switch the selected ad
// account FIRST and then open — see planPortfolioOpen in ./portfolioAccounts for why that
// ordering is load-bearing. Rows whose owning account the picker cannot resolve are shown but
// not openable, because switching to an id the picker does not list would strand the user.

import type { PortfolioListItem } from '@continuum/contracts';
import { ArrowRightLeftIcon, Maximize2, ShieldQuestionIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApplyModePill } from '../ApplyModePill';
import { humanize } from '../format';
import { pendingActionCount } from '../reportModel';
import type { PortfolioAccountGroup, PortfolioOpenPlan } from './portfolioAccounts';

type OptimizerPortfolioBrowserProps = {
  groups: PortfolioAccountGroup[];
  /** Given a row, the decision about what opening it costs. Supplied by the owner so the
   *  browser stays presentation-only and the decision stays pure/testable. */
  planOpen: (portfolio: PortfolioListItem) => PortfolioOpenPlan;
  onOpen: (plan: PortfolioOpenPlan) => void;
};

function PortfolioBrowserRow({
  portfolio,
  plan,
  onOpen,
}: {
  portfolio: PortfolioListItem;
  plan: PortfolioOpenPlan;
  onOpen: (plan: PortfolioOpenPlan) => void;
}) {
  const openable = plan.kind !== 'unavailable';
  const crossAccount = plan.kind === 'switch-then-open';

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-3 py-2">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium text-sm tracking-tight">
          <span className="truncate">{portfolio.name}</span>
          <ApplyModePill
            applyMode={portfolio.apply_mode}
            autopilotPaused={portfolio.autopilot_paused}
          />
          {pendingActionCount(portfolio) > 0 ? (
            <Badge variant="secondary" className="text-3xs">
              {pendingActionCount(portfolio)} pending
            </Badge>
          ) : null}
        </p>
        <p className="mt-0.5 text-muted-foreground text-xs tabular-nums">
          {humanize(portfolio.objective)} · {portfolio.adset_count} ad{' '}
          {portfolio.adset_count === 1 ? 'set' : 'sets'}
        </p>
      </div>

      {openable ? (
        <Button
          aria-label={
            crossAccount
              ? `Switch ad account and open ${portfolio.name}`
              : `Open ${portfolio.name} detail`
          }
          className="h-7 shrink-0 gap-1.5 px-2 text-xs"
          onClick={() => onOpen(plan)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {crossAccount ? (
            <ArrowRightLeftIcon className="size-3.5" aria-hidden />
          ) : (
            <Maximize2 className="size-3.5" aria-hidden />
          )}
          {crossAccount ? 'Switch & open' : 'Open'}
        </Button>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
          <ShieldQuestionIcon className="size-3.5" aria-hidden />
          Account not assigned
        </span>
      )}
    </li>
  );
}

export function OptimizerPortfolioBrowser({
  groups,
  planOpen,
  onOpen,
}: OptimizerPortfolioBrowserProps) {
  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-border/70 border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
        This brand has no portfolios yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.accountId} className="space-y-2">
          <header className="flex items-center gap-2 px-1">
            <h4 className="truncate font-semibold text-xs tracking-tight">{group.label}</h4>
            {group.isSelected ? (
              <Badge variant="teal" className="text-3xs">
                Selected
              </Badge>
            ) : null}
            <span className="text-muted-foreground text-xs tabular-nums">
              {group.portfolios.length}
            </span>
          </header>
          <ul className="space-y-2">
            {group.portfolios.map((portfolio) => (
              <PortfolioBrowserRow
                key={portfolio.id}
                portfolio={portfolio}
                plan={planOpen(portfolio)}
                onOpen={onOpen}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
