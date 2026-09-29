'use client';

// Before and after the last cycle (portafolio.html, idea 09): what the last cycle proposed
// and what landed, the window before beside the window after, and the cost the pending
// pauses would leave. Three quiet cells and two lines of prose — no bar, no colour by
// magnitude. What it says is decided in ./beforeAfterModel.

import { HeroFigure } from '../../components/HeroFigure';
import { type FigureWindow, figureProps, formatCurrency } from '../../format';
import * as typeScale from '../../typeScale';
import type { BeforeAfter, WindowTotals } from './beforeAfterModel';

export type BeforeAfterStripProps = {
  model: BeforeAfter;
  currency: string | null;
  words: { one: string; many: string };
  /** The range's window in the provenance vocabulary. */
  window: FigureWindow;
  /** Target in the metric's display unit. */
  target: number | null;
};

const count = (n: number): string =>
  new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(n);

function Window({
  which,
  totals,
  currency,
  words,
  window,
}: {
  which: 'before' | 'after';
  totals: WindowTotals;
  currency: string | null;
  words: { one: string; many: string };
  window: FigureWindow;
}) {
  const results = Math.round(totals.results);
  return (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/70 bg-card px-3 py-2.5"
      data-testid={`before-after-${which}`}
    >
      <p className={`${typeScale.label} text-muted-foreground`}>
        {which === 'before' ? 'Antes' : 'Después'} · {totals.label}
      </p>
      <p className="text-foreground text-sm">
        <HeroFigure
          kind="tile"
          {...figureProps(`before-after.${which}.results`, results, null, window, 'count')}
        >
          {count(results)}
        </HeroFigure>{' '}
        {results === 1 ? words.one : words.many}
        {totals.cost != null ? (
          <>
            {' a '}
            <span
              className="font-mono tabular-nums"
              {...figureProps(`before-after.${which}.cost`, totals.cost, currency, window)}
            >
              {formatCurrency(totals.cost, currency)}
            </span>
          </>
        ) : null}
        <span className="text-muted-foreground">{' · '}</span>
        <span
          className="font-mono tabular-nums"
          {...figureProps(`before-after.${which}.spend`, totals.spend, currency, window)}
        >
          {formatCurrency(totals.spend, currency)}
        </span>
      </p>
    </div>
  );
}

export function BeforeAfterStrip({
  model,
  currency,
  words,
  window,
  target,
}: BeforeAfterStripProps) {
  const { lastCycle, before, after, projection } = model;
  return (
    <section
      className="flex flex-col gap-2"
      data-source={model.source}
      data-testid="portfolio-before-after"
    >
      {lastCycle ? (
        <p className="text-foreground text-sm" data-testid="before-after-cycle">
          Último ciclo, {lastCycle.when}:{' '}
          {lastCycle.proposed ? `${lastCycle.proposed}; ${lastCycle.applied}.` : 'sin propuestas.'}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm" data-testid="before-after-cycle">
          Sin ciclo todavía.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {before ? (
          <Window
            currency={currency}
            totals={before}
            which="before"
            window={window}
            words={words}
          />
        ) : (
          <div
            className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/70 border-dashed px-3 py-2.5 text-muted-foreground text-sm"
            data-testid="before-after-before"
          >
            <p className={`${typeScale.label}`}>Antes</p>
            <p>Sin periodo anterior con datos.</p>
          </div>
        )}
        {after ? (
          <Window currency={currency} totals={after} which="after" window={window} words={words} />
        ) : (
          <div
            className="flex min-w-0 flex-col gap-1 rounded-lg border border-border/70 border-dashed px-3 py-2.5 text-muted-foreground text-sm"
            data-testid="before-after-after"
          >
            <p className={`${typeScale.label}`}>Después</p>
            <p>Sin datos en este rango todavía.</p>
          </div>
        )}
      </div>
      {projection ? (
        <p className="text-muted-foreground text-sm" data-testid="before-after-projection">
          {projection.cost == null ? (
            <>
              Si se{' '}
              {projection.pauses === 1
                ? 'aplica la pausa'
                : `aplican las ${projection.pauses} pausas`}
              , los {count(projection.remaining)} conjuntos restantes no compraron {words.many} en
              esta ventana.
            </>
          ) : (
            <>
              Si se{' '}
              {projection.pauses === 1
                ? 'aplica la pausa'
                : `aplican las ${projection.pauses} pausas`}
              , el costo proyectado con los {count(projection.remaining)} conjuntos restantes es{' '}
              <span
                className="font-mono tabular-nums text-foreground"
                {...figureProps('before-after.projection.cost', projection.cost, currency, window)}
              >
                {formatCurrency(projection.cost, currency)}
              </span>
              {projection.vsTarget && target != null
                ? `, ${projection.vsTarget === 'en' ? 'en' : projection.vsTarget} el objetivo de ${formatCurrency(target, currency)}`
                : ''}
              .
            </>
          )}
        </p>
      ) : null}
    </section>
  );
}
