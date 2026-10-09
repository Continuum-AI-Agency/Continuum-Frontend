'use client';

// Portfolios sub-view — a live table, one ROW per portfolio (Performance+ one-bar redesign,
// unit L1). Each row is a single click target that navigates INTO the portfolio's dedicated
// detail workspace. Columns: the name with its badges and one muted line under it, cost per
// result against its target, daily budget, ad sets, decisions waiting, and the state in words.
// A "New portfolio" control opens the create page state, and a collapsed "Archived" section
// restores soft-deleted portfolios.
//
// A scope toggle switches between this account's portfolios (the default — the table below)
// and the brand-wide browser grouped by owning ad account. The toggle only appears when the
// account filter is actually hiding something.
//
// The muted line under each name is today's best finding INSIDE that portfolio, in the
// vocabulary the account read speaks — detector name, the detector's own figure. The cost
// column reads the same efficiency series the Overview's rows do. Both are the same React
// Query keys the Overview already warms, so arriving here from the Overview costs nothing.
//
// The brand-wide scope deliberately has NO finding line. Its rows span every ad account the
// brand owns, and an account read is per ACCOUNT — a line there would mean one read per account
// group to decorate a list whose entire job is to get you into a portfolio.

import type { AccountCandidate, PortfolioListItem } from '@continuum/contracts';
import { ACCOUNT_DETECTOR_META, clipLine } from '@continuum/contracts';
import { ChevronRight, Plus, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ApplyModePill } from '../ApplyModePill';
import {
  figureProps,
  formatCurrency,
  formatHeadline,
  humanize,
  portfolioLevelLabel,
} from '../format';
import { pendingWorkCount } from '../reportModel';
import {
  useOptimizerAccountRead,
  useOptimizerArchivedPortfolios,
  useOptimizerMutations,
  useOptimizerPortfolioEfficiency,
} from '../useOptimizerData';
import { headlineFigureUnit } from './account/candidateHeadline';
import { type PortfolioWindow, portfolioWindow } from './account/overviewModel';
import { OptimizerPortfolioBrowser } from './OptimizerPortfolioBrowser';
import {
  CostVsTargetCell,
  FigureCell,
  PendingCell,
  PortfolioRow,
  PortfolioRowName,
  PortfolioTableHeader,
  portfolioLeads,
  portfolioTarget,
  StalenessNote,
  StatusCell,
} from './PortfolioRowCard';
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

const TABLE_LABELS = [
  'Portfolio',
  'Cost vs target',
  'Per day',
  'Ad sets',
  'Pending',
  'Status',
] as const;

/** Today's finding inside the portfolio, compressed to the one muted line under its name: the
 *  detector's name, then its own figure in its own words. Money stays on the Overview's card. */
function LeadLine({
  candidate,
  currency,
  figureKey,
}: {
  candidate: AccountCandidate;
  currency?: string | null;
  figureKey: string;
}) {
  const headline = candidate.headline;
  const lead = headline
    ? formatHeadline(headline, currency)
    : { figure: formatCurrency(candidate.impact_per_day, currency), label: '/day' };
  const provenance = headline
    ? figureProps(
        `${figureKey}.figure`,
        headline.value,
        currency,
        'none',
        headlineFigureUnit(headline.unit),
      )
    : figureProps(`${figureKey}.figure`, candidate.impact_per_day, currency);
  return (
    <p
      className="mt-0.5 truncate text-muted-foreground text-xs"
      data-detector={candidate.detector}
      data-testid="portfolio-lead"
    >
      {clipLine(ACCOUNT_DETECTOR_META[candidate.detector]?.label ?? candidate.detector)} ·{' '}
      <span className="font-mono text-foreground tabular-nums" {...provenance}>
        {lead.figure}
      </span>{' '}
      {lead.label}
    </p>
  );
}

function PortfolioTableRow({
  portfolio,
  currency,
  window,
  onOpenDetail,
  onPrefetch,
  lead = null,
}: {
  portfolio: PortfolioListItem;
  currency?: string | null;
  window: PortfolioWindow | null;
  onOpenDetail: (portfolioId: string) => void;
  onPrefetch?: () => void;
  /** Today's best finding inside this portfolio. Absent, the line under the name says what the
   *  portfolio buys instead — a portfolio with nothing to say says nothing more. */
  lead?: AccountCandidate | null;
}) {
  const figureKey = (name: string) => `portfolios.${portfolio.id}.${name}`;
  return (
    <PortfolioRow
      aria-label={`Open ${portfolio.name}`}
      cells={
        <>
          <CostVsTargetCell
            currency={currency}
            figureKey={figureKey}
            target={window ? window.target : portfolioTarget(portfolio)}
            testId="portfolio-cost"
            window={window}
          />
          <FigureCell
            currency={currency}
            figureKey={figureKey('daily')}
            narrowSuffix="/day"
            raw={portfolio.daily_total}
            text={formatCurrency(portfolio.daily_total, currency)}
          />
          <FigureCell
            narrowSuffix={portfolio.adset_count === 1 ? ' ad set' : ' ad sets'}
            raw={portfolio.adset_count}
            text={String(portfolio.adset_count)}
            unit="count"
          />
          <PendingCell count={pendingWorkCount(portfolio)} />
          <StatusCell window={window} />
        </>
      }
      data-portfolio-id={portfolio.id}
      data-state={window?.state ?? 'none'}
      lead={
        <>
          <PortfolioRowName
            badges={
              <>
                <Badge variant="teal" className="text-xs">
                  {humanize(portfolio.mode)}
                </Badge>
                <Badge variant="muted" className="text-xs">
                  {portfolioLevelLabel(portfolio.level)}
                </Badge>
                <ApplyModePill
                  applyMode={portfolio.apply_mode}
                  autopilotPaused={portfolio.autopilot_paused}
                />
                <StalenessNote portfolio={portfolio} />
              </>
            }
            name={portfolio.name}
          />
          {lead ? (
            <LeadLine candidate={lead} currency={currency} figureKey={figureKey('lead')} />
          ) : (
            <p className="mt-0.5 truncate text-muted-foreground text-xs">
              {humanize(portfolio.objective)}
            </p>
          )}
        </>
      }
      onClick={() => onOpenDetail(portfolio.id)}
      onFocus={onPrefetch}
      onMouseEnter={onPrefetch}
    />
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
    <Collapsible open={open} onOpenChange={setOpen} className="border-border/60 border-t pt-2">
      <CollapsibleTrigger className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-medium text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        Archived ({archived.length})
        <ChevronRight
          className="size-3.5 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="divide-y divide-border/60">
          {archived.map((portfolio) => (
            <li
              key={portfolio.id}
              className="flex items-center justify-between gap-3 px-2 py-2.5 text-muted-foreground"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{portfolio.name}</p>
                <p className="text-xs tabular-nums">
                  {humanize(portfolio.objective)} · {portfolio.adset_count} ad{' '}
                  {portfolio.adset_count === 1 ? 'set' : 'sets'} ·{' '}
                  <span
                    {...figureProps(
                      `portfolios.archived.${portfolio.id}.daily`,
                      portfolio.daily_total,
                      currency,
                    )}
                  >
                    {formatCurrency(portfolio.daily_total, currency)}
                  </span>
                  /d
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 gap-1.5 px-2 text-xs"
                disabled={restore.isPending}
                onClick={() => restore.mutate({ portfolio_id: portfolio.id, name: portfolio.name })}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Restore
              </Button>
            </li>
          ))}
        </ul>
        {restore.isError ? (
          <p className="px-2 pt-1 text-destructive text-xs">
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
  // The SAME query keys the Overview warms, so arriving from there is a cache hit and this
  // view never asks twice. No approvals read beside them: the lead line prints figures, and
  // only a candidate's STATE moves under an approval.
  const accountRead = useOptimizerAccountRead(brandId, adAccountId);
  const { leads } = useMemo(
    () => portfolioLeads(accountRead.data?.read?.candidates ?? []),
    [accountRead.data?.read?.candidates],
  );
  const portfolioIds = useMemo(() => portfolios.map((portfolio) => portfolio.id), [portfolios]);
  const efficiency = useOptimizerPortfolioEfficiency(portfolioIds);
  const windows = useMemo(() => {
    const byId = new Map<string, PortfolioWindow>();
    portfolios.forEach((portfolio, index) => {
      const window = portfolioWindow(portfolio, efficiency.series[index] ?? []);
      if (window) byId.set(portfolio.id, window);
    });
    return byId;
  }, [portfolios, efficiency.series]);
  // Offering "All accounts" when it shows exactly the same rows is noise, so the toggle
  // appears only once the account filter is genuinely holding portfolios back.
  const hasOtherAccountPortfolios = brandPortfolioCount > portfolios.length;
  const browsingBrand = scope === 'brand' && hasOtherAccountPortfolios;

  return (
    <div className="space-y-4">
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
          <div data-testid="portfolio-table">
            {portfolios.length > 0 ? <PortfolioTableHeader labels={TABLE_LABELS} /> : null}
            {portfolios.map((portfolio) => (
              <PortfolioTableRow
                key={portfolio.id}
                portfolio={portfolio}
                currency={currency}
                window={windows.get(portfolio.id) ?? null}
                lead={leads.get(portfolio.id) ?? null}
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
