'use client';

// The last cycle in one line (portafolio.html, idea 09, folded into the module of
// portafolio-unificado.html, idea D): what the last cycle proposed and what landed, and the
// cost the pending pauses would leave. The window before and the window after moved up under
// the anchor number (./PortfolioAnchor), with the same provenance keys; this is the caption
// at the module's foot, above Jaina's bar. What it says is decided in ./beforeAfterModel.

import { type FigureWindow, figureProps, formatCurrency } from '../../format';
import type { BeforeAfter } from './beforeAfterModel';

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

export function BeforeAfterStrip({
  model,
  currency,
  words,
  window,
  target,
}: BeforeAfterStripProps) {
  const { lastCycle, projection } = model;
  return (
    <section
      className="text-muted-foreground text-xs"
      data-source={model.source}
      data-testid="portfolio-before-after"
    >
      <p>
        <span data-testid="before-after-cycle">
          {lastCycle
            ? `Último ciclo, ${lastCycle.when}: ${
                lastCycle.proposed
                  ? `${lastCycle.proposed}; ${lastCycle.applied}.`
                  : 'sin propuestas.'
              }`
            : 'Sin ciclo todavía.'}
        </span>
        {projection ? (
          <>
            {' '}
            <span data-testid="before-after-projection">
              {projection.cost == null ? (
                <>
                  Si se{' '}
                  {projection.pauses === 1
                    ? 'aplica la pausa'
                    : `aplican las ${projection.pauses} pausas`}
                  , los {count(projection.remaining)} conjuntos restantes no compraron {words.many}{' '}
                  en esta ventana.
                </>
              ) : (
                <>
                  Si se{' '}
                  {projection.pauses === 1
                    ? 'aplica la pausa'
                    : `aplican las ${projection.pauses} pausas`}
                  , el costo proyectado con los {count(projection.remaining)} conjuntos restantes es{' '}
                  <span
                    className="font-mono text-foreground tabular-nums"
                    {...figureProps(
                      'before-after.projection.cost',
                      projection.cost,
                      currency,
                      window,
                    )}
                  >
                    {formatCurrency(projection.cost, currency)}
                  </span>
                  {projection.vsTarget && target != null
                    ? `, ${projection.vsTarget} el objetivo de ${formatCurrency(target, currency)}`
                    : ''}
                  .
                </>
              )}
            </span>
          </>
        ) : null}
      </p>
    </section>
  );
}
