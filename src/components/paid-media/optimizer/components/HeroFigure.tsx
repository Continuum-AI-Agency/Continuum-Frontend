// The one element every tile figure and every hero figure renders through. Four roles,
// one size per role (see ../typeScale): a tile's number, a headline's figure, the account
// lead card's figure, and the portfolio module's anchor number. Provenance attributes from `figureProps` spread straight onto it, so
// the raw value, currency and window keep travelling on the same node as the text.

import { cn } from '@/lib/utils';
import { figureAnchor, figureHeadline, figureLead, figureTile } from '../typeScale';

export type HeroFigureKind = 'tile' | 'headline' | 'lead' | 'anchor';

const KIND_CLASS: Record<HeroFigureKind, string> = {
  tile: figureTile,
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

export function HeroFigure({ kind, as = 'span', className, children, ...rest }: HeroFigureProps) {
  const Tag = as;
  return (
    <Tag className={cn(KIND_CLASS[kind], className)} data-figure-role={kind} {...rest}>
      {children}
    </Tag>
  );
}
