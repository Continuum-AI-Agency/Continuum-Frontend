// The one type scale for optimizer/ — Performance+ redesign, stage 1a
// (docs/performance-plus-redesign/index.html; the tables at the end of portafolio.html).
//
// Before this file the same headline figure was drawn at four sizes depending on the file,
// and 377 class sites sat below 12px (two micro sizes, 10px and 11px). Now every role is written here
// once and imported: a label is a `label`, a figure goes through `<HeroFigure kind=…>`.
// Nothing on the surface renders below 12px.
//
// Body copy is Tailwind's own `text-sm` (14px) and `text-xs` (12px, secondary lines and
// captions); those two are the scale too, and the tokens below are what a component reaches
// for when it names the role rather than the size.

/** Uppercase section and tile label — 12px, spaced. Weight and colour stay with the site. */
export const label = 'text-xs uppercase tracking-wide';

/** Body copy — 14px. */
export const body = 'text-sm';

/** Card title copy — 15px. */
export const bodyLg = 'text-[15px]';

/** Secondary line under a figure or a title — 12px, the floor of the scale. */
export const caption = 'text-xs';

/** The number in a tile — 22px mono, one size in every tile. */
export const figureTile = 'font-mono font-semibold text-[22px] tabular-nums leading-none';

/** The figure a headline leads with — 21px mono. */
export const figureHeadline = 'font-mono font-semibold text-[21px] tabular-nums leading-tight';

/** The account lead card's figure — never larger than a headline figure. */
export const figureLead = 'font-mono font-semibold text-[21px] tabular-nums leading-tight';
