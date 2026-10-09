// "What the Optimizer found": how the day's findings sit on the page, and why the LIST decides it.
//
// The findings used to be a row of framed cards — three equal columns, each card floored to an
// aspect band so its evidence picture had room. The one-bar redesign (P1, "Lectura continua")
// reads them as a list instead: one finding per line, a coloured tag on the left, the claim and
// its reason in the middle, the action on the right, hairlines between them and no frame at all.
// The evidence picture is still drawn, one click away under each finding (./CardBand).
//
// Every breakpoint is measured on the PANE (a container query), never the viewport, because the
// detail pane is not the window and a side panel narrows it. Below the tablet width the tag sits
// above the claim and the action drops under it, so a 390px panel never scrolls sideways.

/** The pane width, in rem, at which a finding spreads into its three columns. */
export const FINDING_ROW_BREAKPOINT_REM = 36;

/** How many findings the list shows before the rest go behind "N more findings". */
export const NEWS_ROW_SIZE = 3;

/**
 * The name the pane registers under, so the list's breakpoint asks about the pane and not
 * about the window.
 */
export const NEWS_PANE = '@container/news';

/** The list: hairlines between findings, never a frame around them. */
export const NEWS_LIST = 'flex flex-col divide-y divide-border/60';

/**
 * One finding's line, written out because Tailwind reads source text and cannot see a template
 * literal. `cardShape.test.ts` parses the rem value back out of this string and checks it
 * against `FINDING_ROW_BREAKPOINT_REM`, so the two cannot drift apart silently.
 */
export const FINDING_ROW =
  'grid grid-cols-1 gap-x-5 gap-y-2 py-3 @[36rem]/news:grid-cols-[8rem_minmax(0,1fr)_auto] @[36rem]/news:items-baseline';
