'use client';

// The number the portfolio module is anchored on (portafolio-unificado.html, idea D): the
// cost per result, large, in the colour of where it sits against the target. Under it the
// unit and the target — the target clickable into Manage — and the selected range beside the
// one before it, each named by its dates. What it says is decided in ./headlineModel
// (anchorOf); this file only draws it.

import { cn } from '@/lib/utils';
import { HeroFigure } from '../../components/HeroFigure';
import { type FigureWindow, figureProps } from '../../format';
import type { PortfolioAnchor as AnchorModel } from './headlineModel';
import type { HeroSetting } from './heroHeaderModel';
import { SETTING_TEXT } from './PortfolioHeaderLine';

export type PortfolioAnchorProps = {
  anchor: AnchorModel;
  currency: string | null;
  /** The picker's range in the provenance vocabulary. */
  window: FigureWindow;
  onEditSetting: (setting: HeroSetting) => void;
};

const STATE_TEXT: Record<AnchorModel['state'], string> = {
  ok: 'text-success',
  warn: 'text-warning',
  none: 'text-foreground',
};

export function PortfolioAnchor({ anchor, currency, window, onEditSetting }: PortfolioAnchorProps) {
  return (
    <section
      className="flex min-w-0 flex-col gap-2"
      data-state={anchor.state}
      data-testid="portfolio-anchor"
    >
      <HeroFigure
        as="p"
        className={cn('truncate', STATE_TEXT[anchor.state])}
        kind="anchor"
        {...figureProps(
          anchor.figure.key,
          anchor.figure.raw,
          anchor.figure.currency,
          anchor.figure.window,
          anchor.figure.unit,
        )}
      >
        {anchor.value}
      </HeroFigure>
      <div className="flex flex-col gap-0.5 text-muted-foreground text-xs">
        <p className="flex flex-wrap items-center gap-x-1.5" data-testid="anchor-unit">
          <span data-testid={anchor.empty ? 'anchor-empty' : undefined}>
            {anchor.empty ?? anchor.unit}
          </span>
          <span aria-hidden>·</span>
          <button
            className={SETTING_TEXT}
            data-setting="target"
            data-testid="header-chip"
            onClick={() => onEditSetting('target')}
            title="Editar la meta en Manage"
            type="button"
          >
            {anchor.target}
          </button>
          {anchor.vsTarget ? (
            <>
              <span aria-hidden>·</span>
              <span
                className={cn('font-semibold tabular-nums', STATE_TEXT[anchor.state])}
                data-testid="anchor-vs-target"
              >
                {anchor.vsTarget}
              </span>
            </>
          ) : null}
        </p>
        {anchor.windows.length > 0 ? (
          <p className="flex flex-wrap gap-x-1.5" data-testid="anchor-prior">
            {anchor.windows.map((w, index) => (
              <span data-window={w.which} key={w.which}>
                {index > 0 ? <span aria-hidden>· </span> : null}
                {w.label}:{' '}
                <span
                  className="font-mono text-foreground tabular-nums"
                  {...figureProps(`before-after.${w.which}.cost`, w.cost, currency, window)}
                >
                  {w.text}
                </span>
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </section>
  );
}
