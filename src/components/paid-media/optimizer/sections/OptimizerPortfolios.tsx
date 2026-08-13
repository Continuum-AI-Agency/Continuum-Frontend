'use client';

// Portfolios sub-view — a full-width stack of portfolio cards. Each card is a single
// click target that navigates INTO the portfolio's dedicated detail workspace (no inline
// accordion, no split "performance vs open" views). A "New portfolio" control opens the
// dedicated create page state, and an "Archived" section restores soft-deleted portfolios.
//
// A scope toggle switches between this account's portfolios (the default — the card
// stack below) and the brand-wide browser grouped by owning ad account. The toggle only
// appears when the account filter is actually hiding something.

import type { PortfolioListItem } from '@continuum/contracts';
import { ChevronDown, ChevronRight, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { ApplyModePill } from '../ApplyModePill';
import { formatCurrency, humanize, portfolioLevelLabel } from '../format';
import { pendingActionCount } from '../reportModel';
import { useOptimizerArchivedPortfolios, useOptimizerMutations } from '../useOptimizerData';
import { OptimizerPortfolioBrowser } from './OptimizerPortfolioBrowser';
import type { PortfolioAccountGroup, PortfolioOpenPlan } from './portfolioAccounts';

/** Which portfolios the sub-view is showing: only the selected ad account's (default), or
 *  every portfolio the brand owns, grouped by account. */
export type PortfolioBrowseScope = 'account' | 'brand';

type OptimizerPortfoliosProps = {
  brandId: string;
  adAccountId: string;
  portfolios: PortfolioListItem[];
  currency?: string | null;
  onCreate: () => void;
  onOpenDetail: (portfolioId: string) => void;
  /** Warm a portfolio's detail reads on card hover/focus so opening it paints from cache. */
  onPrefetchPortfolio?: (portfolioId: string) => void;
  /** Every portfolio the brand owns, grouped by owning ad account — powers the "All
   *  accounts" scope. Already fetched; no second read. */
  brandGroups: PortfolioAccountGroup[];
  brandPortfolioCount: number;
  planOpen: (portfolio: PortfolioListItem) => PortfolioOpenPlan;
  onOpenAcrossAccounts: (plan: PortfolioOpenPlan) => void;
};

function PortfolioCard({
  portfolio,
  currency,
  onOpenDetail,
  onPrefetch,
}: {
  portfolio: PortfolioListItem;
  currency?: string | null;
  onOpenDetail: (portfolioId: string) => void;
  onPrefetch?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Open ${portfolio.name}`}
      onClick={() => onOpenDetail(portfolio.id)}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-4 py-3 text-left transition-colors',
        'hover:border-primary/50 hover:bg-accent/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-semibold text-sm tracking-tight">
          <span className="truncate">{portfolio.name}</span>
          <Badge variant="muted" className="text-3xs">
            {portfolioLevelLabel(portfolio.level)}
          </Badge>
          <Badge variant="teal" className="text-3xs">
            {humanize(portfolio.mode)}
          </Badge>
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
        <p className="mt-1 text-muted-foreground text-xs tabular-nums">
          {humanize(portfolio.objective)} · {portfolio.adset_count} ad{' '}
          {portfolio.adset_count === 1 ? 'set' : 'sets'} ·{' '}
          {formatCurrency(portfolio.daily_total, currency)}/d
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

function ArchivedPortfolios({
  brandId,
  adAccountId,
  currency,
}: {
  brandId: string;
  adAccountId: string;
  currency?: string | null;
}) {
  const archivedRead = useOptimizerArchivedPortfolios(brandId, adAccountId);
  const { restore } = useOptimizerMutations(brandId, adAccountId);
  const [open, setOpen] = useState(false);
  const archived = archivedRead.data;

  if (archived.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left font-medium text-muted-foreground text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ChevronDown
          className="size-3.5 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
        Archived ({archived.length})
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-1">
        {archived.map((portfolio) => (
          <div
            key={portfolio.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 border-dashed bg-muted/20 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{portfolio.name}</p>
              <p className="text-muted-foreground text-xs">
                {humanize(portfolio.objective)} · {portfolio.adset_count} ad{' '}
                {portfolio.adset_count === 1 ? 'set' : 'sets'} ·{' '}
                {formatCurrency(portfolio.daily_total, currency)}/d
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={restore.isPending}
              onClick={() => restore.mutate({ portfolio_id: portfolio.id, name: portfolio.name })}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Restore
            </Button>
          </div>
        ))}
        {restore.isError ? (
          <p className="text-destructive text-xs">
            {restore.error instanceof Error ? restore.error.message : 'Could not restore.'}
          </p>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function OptimizerPortfolios({
  brandId,
  adAccountId,
  portfolios,
  currency,
  onCreate,
  onOpenDetail,
  onPrefetchPortfolio,
  brandGroups,
  brandPortfolioCount,
  planOpen,
  onOpenAcrossAccounts,
}: OptimizerPortfoliosProps) {
  const [scope, setScope] = useState<PortfolioBrowseScope>('account');
  // Offering "All accounts" when it shows exactly the same rows is noise, so the toggle
  // appears only once the account filter is genuinely holding portfolios back.
  const hasOtherAccountPortfolios = brandPortfolioCount > portfolios.length;
  const browsingBrand = scope === 'brand' && hasOtherAccountPortfolios;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold text-sm tracking-tight">
            Portfolios ({browsingBrand ? brandPortfolioCount : portfolios.length})
          </h3>
          {hasOtherAccountPortfolios ? (
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={scope}
              onValueChange={(value) => {
                if (value) setScope(value as PortfolioBrowseScope);
              }}
              aria-label="Portfolio scope"
            >
              <ToggleGroupItem value="account" className="h-7 px-2 text-xs">
                This account
              </ToggleGroupItem>
              <ToggleGroupItem value="brand" className="h-7 px-2 text-xs">
                All accounts · {brandPortfolioCount}
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null}
        </div>
        <Button type="button" size="sm" variant="default" className="gap-1.5" onClick={onCreate}>
          <Plus className="size-4" aria-hidden />
          New portfolio
        </Button>
      </div>

      {browsingBrand ? (
        <OptimizerPortfolioBrowser
          groups={brandGroups}
          planOpen={planOpen}
          onOpen={onOpenAcrossAccounts}
        />
      ) : (
        <>
          <div className="space-y-2">
            {portfolios.map((portfolio) => (
              <PortfolioCard
                key={portfolio.id}
                portfolio={portfolio}
                currency={currency}
                onOpenDetail={onOpenDetail}
                onPrefetch={
                  onPrefetchPortfolio ? () => onPrefetchPortfolio(portfolio.id) : undefined
                }
              />
            ))}
          </div>

          <ArchivedPortfolios brandId={brandId} adAccountId={adAccountId} currency={currency} />
        </>
      )}
    </div>
  );
}
