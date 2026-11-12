'use client';
import { useLocale, useTranslations } from 'next-intl';

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
  /** The range's window in the provenance vocabulary — the window the anchor's two
   *  figures cover (the projection names its own). */
  window: FigureWindow;
  /** Target in the metric's display unit. */
  target: number | null;
};

const count = (n: number): string =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);

const ifThePausesLand = (pauses: number): string =>
  pauses === 1 ? 'If the pause lands' : `If the ${pauses} pauses land`;

export function BeforeAfterStrip({ model, currency, words, target }: BeforeAfterStripProps) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
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
            ? uiText('template_2363ae960d35', {
                v0: lastCycle.when,
                v1: lastCycle.proposed
                  ? `${lastCycle.proposed}; ${lastCycle.applied}.`
                  : uiText('nothing_proposed_dadf78b'),
              })
            : uiText('no_cycle_yet_4d642d8')}
        </span>
        {projection ? (
          <>
            {' '}
            <span data-testid="before-after-projection">
              {projection.cost == null ? (
                <>
                  {uiText.rich('sentence_07a4edb57386', {
                    pauses: projection.pauses,
                    remaining: projection.remaining,
                    results: words.many,
                  })}
                </>
              ) : (
                <>
                  {uiText.rich('sentence_d6cde29543f7', {
                    pauses: projection.pauses,
                    remaining: projection.remaining,
                    cost: () => (
                      <span
                        className="font-mono text-foreground tabular-nums"
                        {...figureProps(
                          'before-after.projection.cost',
                          projection.cost,
                          currency,
                          projection.window,
                        )}
                      >
                        {formatCurrency(projection.cost, currency, uiLocale)}
                      </span>
                    ),
                    comparison: target != null ? (projection.vsTarget ?? 'none') : 'none',
                    target: target != null ? formatCurrency(target, currency, uiLocale) : '',
                  })}
                </>
              )}
            </span>
          </>
        ) : null}
      </p>
    </section>
  );
}
