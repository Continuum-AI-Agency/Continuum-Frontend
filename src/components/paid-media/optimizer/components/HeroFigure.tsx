// The one element every tile figure and every hero figure renders through. Five roles,
// one size per role (see ../typeScale): a tile's number, an inline row's protagonist, a
// headline's figure, the account lead card's figure, and the portfolio module's anchor number. Provenance attributes from `figureProps` spread straight onto it, so
// the raw value, currency and window keep travelling on the same node as the text.
//
// A money figure at a large role dims its symbol and its code (M1: "$85.47 MXN" with the "$"
// and "MXN" small and muted) so the number carries the weight and reads the same width in
// every currency. The text content stays exactly what the formatter produced, so the parity
// bench reads the same string a smaller role would print.

import { type MoneyParts, splitMoney } from '@/lib/money/display';
import { cn } from '@/lib/utils';
import { figureAnchor, figureHeadline, figureHero, figureLead, figureTile } from '../typeScale';

export type HeroFigureKind = 'tile' | 'hero' | 'headline' | 'lead' | 'anchor';

const KIND_CLASS: Record<HeroFigureKind, string> = {
  tile: figureTile,
  hero: figureHero,
  headline: figureHeadline,
  lead: figureLead,
  anchor: figureAnchor,
};

type HeroFigureProps = React.HTMLAttributes<HTMLElement> & {
  kind: HeroFigureKind;
  /** `span` inline in a sentence (the default); `p` when the figure is its own line. */
  as?: 'span' | 'p';
  children: React.ReactNode;
};

/** Roles large enough that a full-size symbol and code would outweigh the figure. */
const DIMS_UNITS: ReadonlySet<HeroFigureKind> = new Set(['tile', 'hero', 'lead', 'anchor']);

const UNIT = 'font-medium text-muted-foreground';

export function HeroFigure({ kind, as = 'span', className, children, ...rest }: HeroFigureProps) {
  const Tag = as;
  const money = DIMS_UNITS.has(kind) && typeof children === 'string' ? splitMoney(children) : null;
  return (
    <Tag className={cn(KIND_CLASS[kind], className)} data-figure-role={kind} {...rest}>
      {money ? <DimmedMoney parts={money} /> : children}
    </Tag>
  );
}

function DimmedMoney({ parts }: { parts: MoneyParts }) {
  return (
    <>
      {parts.sign}
      {parts.glyph ? (
        <span
          className={cn(UNIT, 'mr-[0.04em] align-[0.32em] text-[max(12px,0.6em)]')}
          data-money="symbol"
        >
          {parts.glyph}
        </span>
      ) : null}
      {parts.body}
      {parts.code ? (
        <span className={cn(UNIT, 'text-[max(12px,0.45em)] tracking-[0.02em]')} data-money="code">
          {` ${parts.code}`}
        </span>
      ) : null}
    </>
  );
}
