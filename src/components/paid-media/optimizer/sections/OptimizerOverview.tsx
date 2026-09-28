'use client';

// Overview — the optimizer's front page, as the Performance+ redesign orders it (proposal O1,
// docs/performance-plus-redesign/overview.html). Above the fold, in this order and nothing
// else: one sentence with figures (what the account spent over the window, what each result
// kind cost against its target, how many decisions wait); a sub-line with the window and when
// the read was taken; the band that asks Jaina; four to six tiles whose top border is a state;
// the recommendation cards in impact order with the lead marked; and the portfolios as
// one-line rows, sortable by distance to target.
//
// Nothing here is a chart and nothing is prose written by a model. The sentence and the tiles
// are composed from the same typed rows — the portfolio list and the optimizer's own
// efficiency series per portfolio — in ./account/overviewModel.ts, so a figure in the sentence
// is always one the reader can find again in a tile or a row. The cards come from today's
// account read; the read's own narrative, its footnotes and its charts are not shown.

import type { PortfolioListItem } from '@continuum/contracts';
import { applyApprovals } from '@continuum/contracts';
import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { KpiTile, type KpiTileState } from '../components/KpiTile';
import { figureProps, formatCpa, formatCurrency } from '../format';
import { pendingWorkCount } from '../reportModel';
import * as typeScale from '../typeScale';
import {
  useAccountApprovals,
  useOptimizerAccountRead,
  useOptimizerPortfolioEfficiency,
  useRequestAccountRead,
} from '../useOptimizerData';
import { AccountRead } from './account/AccountRead';
import { AccountReadFreshness } from './account/AccountReadFreshness';
import {
  accountSpend,
  autopilotSummary,
  decisionsLabel,
  headlineClauses,
  joinClauses,
  latestCycle,
  type PortfolioWindow,
  portfolioWindow,
  type ResultKind,
  type RowSortDir,
  type RowSortKey,
  resultKinds,
  sortPortfolioRows,
  WINDOW_DAYS,
  windowLabel,
} from './account/overviewModel';
import { JainaEntryChips } from './JainaEntryChips';
import { jainaAccountEntryPrompts } from './jainaEntryModel';
import { PortfolioRowCard } from './PortfolioRowCard';
import { underManagement } from './portfolioStaleness';

/** Room for six tiles: spend, up to three result kinds, decisions, autopilot. */
const MAX_KIND_TILES = 3;

/** Spend against the daily plan reads as ok inside this band, warn outside it. */
const PLAN_TOLERANCE_PCT = 10;

type OptimizerOverviewProps = {
  brandId: string;
  /** The account the read is about. Null while no account is selected. */
  adAccountId: string | null;
  portfolios: PortfolioListItem[];
  pendingCount: number;
  currency?: string | null;
  onOpenActions: () => void;
  onSelectPortfolio: (portfolioId: string) => void;
  onCreatePortfolio: () => void;
  onPrefetchPortfolio?: (portfolioId: string) => void;
};

/** Spend per day against the plan, as a tile state. Unjudgeable without a plan. */
export function spendState(perDay: number, plannedPerDay: number): KpiTileState {
  if (plannedPerDay <= 0) return 'none';
  const pct = Math.abs(perDay / plannedPerDay - 1) * 100;
  return pct <= PLAN_TOLERANCE_PCT ? 'ok' : 'warn';
}

/** The tile's second line for one result kind: cost, target, and last week — or why not. */
export function kindTileSub(kind: ResultKind, currency: string | null | undefined): string {
  if (kind.costPerResult == null) {
    return kind.spend > 0 ? `${formatCurrency(kind.spend, currency)} sin resultado` : 'sin gasto';
  }
  const parts = [formatCpa(kind.costPerResult, currency)];
  if (kind.targetRange == null) parts.push('sin objetivo');
  else if (kind.targetRange.min === kind.targetRange.max)
    parts.push(`objetivo ${formatCpa(kind.targetRange.min, currency)}`);
  else
    parts.push(
      `objetivo ${formatCpa(kind.targetRange.min, currency)}–${formatCpa(kind.targetRange.max, currency)}`,
    );
  if (kind.priorCostPerResult != null)
    parts.push(`sem. ant. ${formatCpa(kind.priorCostPerResult, currency)}`);
  return parts.join(' · ');
}

/** The tile's second line for autopilot: who only recommends, or what is stopped. */
export function autopilotTileSub(summary: ReturnType<typeof autopilotSummary>): string {
  if (summary.paused > 0)
    return `${summary.paused} ${summary.paused === 1 ? 'detenido' : 'detenidos'}`;
  if (summary.recommending.length === 0) return 'todos aplican solos';
  if (summary.recommending.length <= 2)
    return `${summary.recommending.join(' y ')} ${summary.recommending.length === 1 ? 'recomienda, no aplica' : 'recomiendan, no aplican'}`;
  return `${summary.recommending.length} recomiendan, no aplican`;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function OptimizerOverview({
  brandId,
  adAccountId,
  portfolios,
  pendingCount,
  currency,
  onOpenActions,
  onSelectPortfolio,
  onCreatePortfolio,
  onPrefetchPortfolio,
}: OptimizerOverviewProps) {
  const [sortKey, setSortKey] = useState<RowSortKey>('distance');
  const [sortDir, setSortDir] = useState<RowSortDir>('asc');
  const portfolioIds = useMemo(() => portfolios.map((portfolio) => portfolio.id), [portfolios]);
  const efficiency = useOptimizerPortfolioEfficiency(portfolioIds);
  // The account read opens the cards when the worker has written one. Absent is absent:
  // no spinner, no empty shell — the sentence and the tiles stand on their own.
  const accountRead = useOptimizerAccountRead(brandId, adAccountId);
  const approvalMaps = useAccountApprovals(brandId, adAccountId);
  const requestRead = useRequestAccountRead(brandId, adAccountId);

  const windows = useMemo(() => {
    const byId = new Map<string, PortfolioWindow>();
    portfolios.forEach((portfolio, index) => {
      const window = portfolioWindow(portfolio, efficiency.series[index] ?? []);
      if (window) byId.set(portfolio.id, window);
    });
    return byId;
  }, [portfolios, efficiency.series]);
  const names = useMemo(
    () => new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.name])),
    [portfolios],
  );

  const spend = accountSpend(windows);
  // A sum over the portfolios that answered is not the account's spend.
  const complete = efficiency.failed === 0;
  const kinds = useMemo(() => resultKinds(portfolios, windows), [portfolios, windows]);
  const autopilot = autopilotSummary(portfolios);
  const book = underManagement(portfolios);
  const dailyTotal = portfolios.reduce((sum, portfolio) => sum + (portfolio.daily_total ?? 0), 0);
  const portfoliosWithDecisions = portfolios.filter(
    (portfolio) => pendingWorkCount(portfolio) > 0,
  ).length;
  const window = windowLabel(latestCycle(windows));
  const clauses = headlineClauses(kinds, (value) => formatCpa(value, currency), names);
  const sorted = sortPortfolioRows(portfolios, windows, sortKey, sortDir);

  const read = accountRead.data?.read ?? null;
  // The stored read is a nightly snapshot, so the state baked into it is last night's. Apply
  // what has been approved SINCE, against the very ceilings that read was composed under.
  const shown = useMemo(() => {
    if (!read) return null;
    const maps = approvalMaps.data;
    if (!maps) return read;
    const defaults = read.ceiling_defaults as never;
    return {
      ...read,
      candidates: applyApprovals(read.candidates, { ...maps, defaults }),
      guards: applyApprovals(read.guards, { ...maps, defaults }),
    };
  }, [read, approvalMaps.data]);

  const jainaEntries = useMemo(() => {
    let worst: { name: string; pct: number } | null = null;
    let silent: string | null = null;
    for (const portfolio of portfolios) {
      const row = windows.get(portfolio.id);
      if (!row) continue;
      if (row.vsTargetPct != null && row.vsTargetPct > 0 && (!worst || row.vsTargetPct > worst.pct))
        worst = { name: portfolio.name, pct: row.vsTargetPct };
      if (silent == null && row.spend > 0 && row.results === 0) silent = portfolio.name;
    }
    return jainaAccountEntryPrompts({
      accountLabel: adAccountId,
      portfolios: portfolios.map((portfolio) => ({
        name: portfolio.name,
        objective: portfolio.objective,
      })),
      worstOverTarget: worst?.name ?? null,
      noResults: silent,
    });
  }, [portfolios, windows, adAccountId]);

  const portfolioNoun = portfolios.length === 1 ? 'portafolio' : 'portafolios';

  return (
    <div className="space-y-3" data-testid="optimizer-overview">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs font-semibold text-foreground" data-testid="book-line">
          {portfolios.length} {portfolioNoun} · {book.managed}{' '}
          {book.managed === 1 ? 'conjunto' : 'conjuntos'}
          {book.gone > 0 ? (
            <span className="font-normal text-muted-foreground">
              {' '}
              · {book.gone} {book.gone === 1 ? 'perdido' : 'perdidos'}
            </span>
          ) : null}
        </p>
        <div className="flex items-center gap-2">
          {pendingCount > 0 ? (
            <Button
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={onOpenActions}
              size="sm"
              type="button"
              variant="secondary"
            >
              Revisar {pendingCount} {pendingCount === 1 ? 'pendiente' : 'pendientes'}
              <ArrowRightIcon aria-hidden="true" className="size-3.5" />
            </Button>
          ) : null}
          <Button
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={onCreatePortfolio}
            size="sm"
            type="button"
          >
            <PlusIcon aria-hidden="true" className="size-3.5" />
            Nuevo portafolio
          </Button>
        </div>
      </div>

      {/* 1 — the sentence. Every figure in it is one of the tiles below, said in a row. */}
      <section className="space-y-1 px-1" data-testid="overview-hero">
        {efficiency.failed > 0 && !efficiency.pending ? (
          <p
            className={`${typeScale.bodyLg} font-semibold leading-snug text-muted-foreground`}
            data-incomplete="true"
            data-testid="overview-headline"
          >
            No se pudo leer el ciclo de {efficiency.failed}{' '}
            {efficiency.failed === 1 ? 'portafolio' : 'portafolios'}, así que la cifra de la cuenta
            no está completa.{' '}
            <button
              className="text-primary underline-offset-2 hover:underline"
              data-testid="overview-retry"
              onClick={efficiency.retryFailed}
              type="button"
            >
              Reintentar
            </button>
          </p>
        ) : spend ? (
          <p
            className={`${typeScale.bodyLg} font-semibold leading-snug text-foreground`}
            data-testid="overview-headline"
          >
            La cuenta gastó{' '}
            <span
              className="tabular-nums"
              {...figureProps('overview.spend', spend.spend, currency, 'd7')}
            >
              {formatCurrency(spend.spend, currency)}
            </span>{' '}
            en {WINDOW_DAYS} días
            {clauses.length > 0 ? ': ' : '.'}
            {clauses.map((clause, index) => (
              <span key={clause.kind.kind}>
                {index > 0 ? (index === clauses.length - 1 ? ' y ' : ', ') : ''}
                {clause.shape === 'cost' ? (
                  <>
                    {clause.kind.words.many} a{' '}
                    <span
                      className="tabular-nums"
                      {...figureProps(
                        `overview.kind.${clause.kind.kind}.cost`,
                        clause.kind.costPerResult,
                        currency,
                        'd7',
                      )}
                    >
                      {clause.cost}
                    </span>{' '}
                    ({clause.distance})
                  </>
                ) : (
                  <>
                    <span
                      className="tabular-nums"
                      {...figureProps(
                        `overview.kind.${clause.kind.kind}.results`,
                        clause.kind.results,
                        null,
                        'd7',
                        'count',
                      )}
                    >
                      {clause.count}
                    </span>
                    {clause.where ? ` en ${clause.where}` : ''}
                  </>
                )}
              </span>
            ))}
            {clauses.length > 0 ? '. ' : ' '}
            <span className="tabular-nums" data-testid="overview-decisions">
              {capitalise(decisionsLabel(pendingCount))}.
            </span>
          </p>
        ) : (
          <p
            className={`${typeScale.bodyLg} font-semibold leading-snug text-muted-foreground`}
            data-pending={efficiency.pending ? 'true' : undefined}
            data-testid="overview-headline"
          >
            {efficiency.pending
              ? 'Leyendo los ciclos de la cuenta…'
              : `Ningún portafolio tiene un ciclo medido todavía. ${capitalise(decisionsLabel(pendingCount))}.`}
          </p>
        )}
        {/* 2 — the sub-line: the window the figures cover, and when the read was taken. */}
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
          data-testid="overview-subline"
        >
          {window ? <span data-testid="overview-window">{window}</span> : null}
          {window && accountRead.data ? <span aria-hidden="true">·</span> : null}
          {accountRead.data ? (
            <AccountReadFreshness
              error={requestRead.error instanceof Error ? requestRead.error.message : null}
              onRequest={() => requestRead.mutate()}
              readyAt={accountRead.data.ready_at}
              refresh={accountRead.data.refresh}
              requesting={requestRead.isPending}
              utcDay={accountRead.data.utc_day}
            />
          ) : null}
        </div>
      </section>

      {/* 3 — the band that asks Jaina, with the account's own questions. */}
      <JainaEntryChips entries={jainaEntries} label="Preguntale a Jaina" />

      {/* 4 — the radiography: four to six tiles, each with a state on its top border. */}
      <div
        className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6"
        data-testid="account-tiles"
      >
        <KpiTile
          figure={figureProps('tiles.spend', spend?.spend ?? null, currency, 'd7')}
          label={`Gasto · ${WINDOW_DAYS} días`}
          state={complete && spend ? spendState(spend.spend / WINDOW_DAYS, dailyTotal) : 'none'}
          sub={
            !complete
              ? `lectura incompleta · plan ${formatCurrency(dailyTotal, currency)} por día`
              : spend
                ? `${formatCurrency(spend.spend / WINDOW_DAYS, currency)} por día · plan ${formatCurrency(dailyTotal, currency)}`
                : `plan ${formatCurrency(dailyTotal, currency)} por día`
          }
          testId="tile-spend"
          value={complete && spend ? formatCurrency(spend.spend, currency) : '—'}
        />
        {kinds.slice(0, MAX_KIND_TILES).map((kind) => (
          <KpiTile
            figure={figureProps(`tiles.kind.${kind.kind}`, kind.results, null, 'd7', 'count')}
            key={kind.kind}
            label={capitalise(kind.words.many)}
            state={kind.state}
            sub={kindTileSub(kind, currency)}
            testId={`tile-kind-${kind.kind}`}
            value={kind.results.toLocaleString('es-MX')}
          />
        ))}
        <KpiTile
          action={
            pendingCount > 0 ? (
              <button
                className="text-xs text-primary hover:underline"
                onClick={onOpenActions}
                type="button"
              >
                Revisar
              </button>
            ) : null
          }
          figure={figureProps('tiles.decisions-waiting', pendingCount, null, 'none', 'count')}
          label="Decisiones"
          sub={
            pendingCount > 0
              ? `en ${portfoliosWithDecisions} ${portfoliosWithDecisions === 1 ? 'portafolio' : 'portafolios'}`
              : 'nada espera tu decisión'
          }
          testId="tile-decisions"
          value={String(pendingCount)}
        />
        <KpiTile
          figure={figureProps('tiles.on-autopilot', autopilot.autopilot, null, 'none', 'count')}
          label="Autopilot"
          state={autopilot.paused > 0 ? 'warn' : 'none'}
          sub={autopilotTileSub(autopilot)}
          testId="tile-autopilot"
          value={`${autopilot.autopilot} de ${autopilot.total}`}
        />
      </div>

      {/* 5 — the recommendation cards, in impact order, the lead marked. */}
      {shown ? (
        <section className="space-y-2" data-testid="overview-recommendations">
          <p className={`${typeScale.label} px-1 font-semibold text-muted-foreground`}>
            Recomendaciones de Jaina
          </p>
          <AccountRead
            candidates={[...shown.candidates, ...shown.guards]}
            currency={shown.currency ?? currency ?? null}
            dailySpend={shown.scale_per_day ?? dailyTotal}
            onOpenPortfolio={onSelectPortfolio}
            portfolioNames={names}
          />
        </section>
      ) : null}

      {/* 6 — the portfolios, one line each, sortable by distance to target. */}
      <section className="space-y-2" data-testid="portfolio-rows">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className={`${typeScale.label} font-semibold text-muted-foreground`}>Portafolios</p>
          <div className="flex items-center gap-1.5">
            <ToggleGroup
              aria-label="Ordenar portafolios por"
              onValueChange={(value) => {
                if (value) setSortKey(value as RowSortKey);
              }}
              size="sm"
              type="single"
              value={sortKey}
              variant="outline"
            >
              <ToggleGroupItem className="h-7 px-2 text-xs" value="distance">
                Distancia al objetivo
              </ToggleGroupItem>
              <ToggleGroupItem className="h-7 px-2 text-xs" value="name">
                Nombre
              </ToggleGroupItem>
              <ToggleGroupItem className="h-7 px-2 text-xs" value="daily">
                Presupuesto
              </ToggleGroupItem>
              <ToggleGroupItem className="h-7 px-2 text-xs" value="pending">
                Pendientes
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              aria-label={sortDir === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
              className="size-7 p-0"
              onClick={() => setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))}
              size="sm"
              type="button"
              variant="ghost"
            >
              {sortDir === 'asc' ? (
                <ArrowUpIcon aria-hidden="true" className="size-3.5" />
              ) : (
                <ArrowDownIcon aria-hidden="true" className="size-3.5" />
              )}
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          {sorted.map((portfolio) => (
            <PortfolioRowCard
              currency={currency}
              key={portfolio.id}
              onPrefetch={onPrefetchPortfolio ? () => onPrefetchPortfolio(portfolio.id) : undefined}
              onSelect={() => onSelectPortfolio(portfolio.id)}
              portfolio={portfolio}
              window={windows.get(portfolio.id) ?? null}
            />
          ))}
          {sorted.length === 0 ? (
            <p className="text-xs text-muted-foreground">Todavía no hay portafolios.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
