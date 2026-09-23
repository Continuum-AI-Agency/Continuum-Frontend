// The news row: how the day's cards share the width, and why the ROW decides it.
//
// THE COMPLAINT THIS ANSWERS. The lead card sat alone on the left at 34rem with fourteen
// hundred pixels of nothing beside it, then a line of prose, then two smaller cards that
// again filled half the pane. Each card had been given its own width cap so that no grid
// could stretch it into a letterbox — which was correct about the letterbox and wrong about
// the screen: the cap moved the blank from inside the cards to beside them. A card that
// cannot be stretched can still be stranded.
//
// So the width is now the row's to give. The row is three equal columns on a desktop pane,
// two on a tablet, one on a phone — measured on the PANE (a container query), never the
// viewport, because the detail pane is not the window and a side panel narrows it. Every
// card fills its column, and the cards in one row share one height.
//
// The letterbox is still unreachable, by a different mechanism. Each cell is a container of
// its own and the card floors its height against the CELL's width — `min-h` in `cqw` — so a
// card can never be flatter than the aspect band no matter how wide the pane is. The band
// is enforced on the card's own root; the row cannot switch it off.

/**
 * The band a news card's box sits in, as width ÷ height.
 *
 * Below `min` a card is a tall ribbon and its figure has nowhere to sit beside its argument;
 * above `max` it is the letterbox the floor exists to prevent. Square is 1.
 */
export const CARD_ASPECT_BAND = { min: 0.5, max: 1.5 } as const;

/** The pane widths, in rem, at which the row earns another column. */
export const NEWS_ROW_BREAKPOINT_REM = { tablet: 36, desktop: 56 } as const;

/** The columns the row holds at each width. */
export const NEWS_ROW_COLUMNS = { phone: 1, tablet: 2, desktop: 3 } as const;

/** How many cards the first row shows before the rest go behind a disclosure. */
export const NEWS_ROW_SIZE = NEWS_ROW_COLUMNS.desktop;

/** The gap between cells, in rem, so a cell's width can be reasoned about. */
export const NEWS_ROW_GAP_REM = 0.75;

/**
 * The name the pane registers under, so the row's breakpoints ask about the pane and not
 * about the window.
 */
export const NEWS_PANE = '@container/news';

/**
 * The row's classes, written out because Tailwind reads source text and cannot see a
 * template literal. `cardShape.test.ts` parses the rem values back out of this string and
 * checks them against `NEWS_ROW_BREAKPOINT_REM`, so the two cannot drift apart silently.
 */
export const NEWS_ROW =
  'grid items-stretch gap-3 grid-cols-1 @[36rem]/news:grid-cols-2 @[56rem]/news:grid-cols-3';

/** A cell: a container, so the card inside can floor its height against the cell's width. */
export const NEWS_CELL = '@container/news-cell min-w-0';

/**
 * How far the recap prose reaches when it sits BESIDE the cards rather than under them: it
 * takes every column the cards left empty, so one card plus its recap is still a full row.
 */
export const RECAP_BESIDE_SPAN: Record<1 | 2, string> = {
  1: '@[36rem]/news:col-span-1 @[56rem]/news:col-span-2',
  2: '@[36rem]/news:col-span-2 @[56rem]/news:col-span-1',
};

/** The floor the band implies, as a share of the cell's width: 100 ÷ the widest ratio. */
export function cardMinHeightCqw(): number {
  return Math.round((100 / CARD_ASPECT_BAND.max) * 100) / 100;
}

/**
 * The frame on every card's root. One frame, because the cards in a row share a column
 * width and a height; a lead is louder than an insight in its type, never in its box.
 *
 * `h-full` is what makes the cards in one row the same height, and `min-h` in `cqw` is what
 * keeps a card inside the aspect band at any column width.
 */
export const CARD_FRAME = 'flex h-full w-full min-h-[66.67cqw]';

/**
 * The cell width, in rem, at a given pane width and column count.
 */
export function cellWidthRem(paneRem: number, columns: number): number {
  return (paneRem - NEWS_ROW_GAP_REM * (columns - 1)) / columns;
}

/**
 * The width at which a justification block earns its angled layout.
 *
 * A CONTAINER width, never the viewport. The three layouts were written with `sm:`, which is
 * a viewport query: on a desktop an insight card 336px wide still matched `sm:` and laid its
 * figure and its argument into two ~150px columns, which is the other half of "the cards did
 * not hold". A block only splits when the BLOCK has room to split — which, in a three-column
 * row, is a pane wider than about 85rem.
 */
export const JUSTIFICATION_SPLIT_REM = 28;
