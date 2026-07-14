'use client';

// Portfolios sub-view — a full-width stack of portfolio cards. Each card shows a
// summary row and two inline disclosures: "Performance" (the latest cycle detail)
// and "Manage" (edit config + add/remove ad sets + archive). A "New portfolio"
// control expands the create form, and an "Archived" section restores soft-deleted
// portfolios. The full width gives the campaign -> ad-set tree room to breathe.

import type { PortfolioListItem } from '@continuum/contracts';
import { Activity, ChevronDown, Maximize2, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ApplyModePill } from '../ApplyModePill';
import { formatCurrency, humanize, portfolioLevelLabel } from '../format';
import { useOptimizerArchivedPortfolios, useOptimizerMutations } from '../useOptimizerData';
import { NewPortfolioSheet } from './NewPortfolioSheet';
import { PortfolioManagePanel } from './PortfolioManagePanel';
import { PortfolioPerformancePanel } from './PortfolioPerformancePanel';

type OptimizerPortfoliosProps = {
  brandId: string;
  adAccountId: string;
  portfolios: PortfolioListItem[];
  currency?: string | null;
  onCreated?: (portfolioId: string) => void;
  onOpenDetail: (portfolioId: string) => void;
};

type CardPanel = 'performance' | 'manage' | null;

function PortfolioCard({
  brandId,
  adAccountId,
  portfolio,
  currency,
  defaultOpen,
  onOpenDetail,
}: {
  brandId: string;
  adAccountId: string;
  portfolio: PortfolioListItem;
  currency?: string | null;
  defaultOpen: boolean;
  onOpenDetail: (portfolioId: string) => void;
}) {
  const [panel, setPanel] = useState<CardPanel>(defaultOpen ? 'performance' : null);
  const toggle = (next: Exclude<CardPanel, null>) =>
    setPanel((current) => (current === next ? null : next));

  return (
    <div className="rounded-lg border border-border/70 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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
            {portfolio.pending_recommendations > 0 ? (
              <Badge variant="secondary" className="text-3xs">
                {portfolio.pending_recommendations} pending
              </Badge>
            ) : null}
          </p>
          <p className="mt-1 text-muted-foreground text-xs tabular-nums">
            {humanize(portfolio.objective)} · {portfolio.adset_count} ad{' '}
            {portfolio.adset_count === 1 ? 'set' : 'sets'} ·{' '}
            {formatCurrency(portfolio.daily_total, currency)}/d
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            aria-label={`Open ${portfolio.name} detail`}
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => onOpenDetail(portfolio.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Maximize2 className="size-3.5" aria-hidden />
            Open
          </Button>
          <Button
            type="button"
            size="sm"
            variant={panel === 'performance' ? 'secondary' : 'ghost'}
            className="h-7 gap-1.5 px-2 text-xs"
            aria-expanded={panel === 'performance'}
            onClick={() => toggle('performance')}
          >
            <Activity className="size-3.5" aria-hidden />
            Performance
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform motion-reduce:transition-none',
                panel === 'performance' && 'rotate-180',
              )}
              aria-hidden
            />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={panel === 'manage' ? 'secondary' : 'ghost'}
            className="h-7 gap-1.5 px-2 text-xs"
            aria-expanded={panel === 'manage'}
            onClick={() => toggle('manage')}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Manage
            <ChevronDown
              className={cn(
                'size-3.5 transition-transform motion-reduce:transition-none',
                panel === 'manage' && 'rotate-180',
              )}
              aria-hidden
            />
          </Button>
        </div>
      </div>

      {panel ? (
        <div className="border-t border-border/60 p-4">
          {panel === 'performance' ? (
            <PortfolioPerformancePanel
              portfolioId={portfolio.id}
              brandId={brandId}
              adAccountId={adAccountId}
              currency={currency}
              applyMode={portfolio.apply_mode}
              objective={portfolio.objective}
            />
          ) : (
            <PortfolioManagePanel
              brandId={brandId}
              adAccountId={adAccountId}
              portfolio={portfolio}
              currency={currency}
              onDone={() => setPanel(null)}
            />
          )}
        </div>
      ) : null}
    </div>
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
  onCreated,
  onOpenDetail,
}: OptimizerPortfoliosProps) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-sm tracking-tight">Portfolios ({portfolios.length})</h3>
        <Button
          type="button"
          size="sm"
          variant={creating ? 'secondary' : 'default'}
          className="gap-1.5"
          aria-expanded={creating}
          onClick={() => setCreating((value) => !value)}
        >
          <Plus className="size-4" aria-hidden />
          New portfolio
        </Button>
      </div>

      {/* A Sheet, not an inline expander. The expander rendered the whole setup body into this
          narrow, scrolling column — re-squeezing the builder and shoving the portfolio list you
          launched from off the screen. */}
      <NewPortfolioSheet
        open={creating}
        onOpenChange={setCreating}
        brandId={brandId}
        adAccountId={adAccountId}
        currency={currency ?? null}
        onCreated={onCreated}
      />

      <div className="space-y-2">
        {portfolios.map((portfolio) => (
          <PortfolioCard
            key={portfolio.id}
            brandId={brandId}
            adAccountId={adAccountId}
            portfolio={portfolio}
            currency={currency}
            defaultOpen={false}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>

      <ArchivedPortfolios brandId={brandId} adAccountId={adAccountId} currency={currency} />
    </div>
  );
}
