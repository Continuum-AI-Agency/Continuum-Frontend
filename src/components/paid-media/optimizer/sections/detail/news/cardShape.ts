// How wide a news card is allowed to be, and why that is a property of the CARD.
//
// THE BUG THIS EXISTS TO MAKE UNREACHABLE. Two insight cards were mounted in
// `grid sm:grid-cols-2` with no cap, so each one was half of whatever the detail pane
// happened to be. At a 1440px viewport that is a 700px-wide card holding about 140px of
// content — a 5:1 letterbox. Nothing about the card asked for that width; the SLOT had it
// and the card was stretched to fill it. A card whose shape is decided by where it was
// mounted will be the wrong shape again the next time somebody mounts it somewhere else.
//
// So the cap and the floor live on the card's own root element, and neither card component
// takes a `className`. A caller can mount a news card in a 2000px grid cell and get a
// 336px card with 1664px of gutter beside it. "Two cards across the full width" is not
// something a caller can ask for any more; there is no parameter for it.
//
// The floor is the other half. A max-width alone still allows a 544px card holding 150px of
// content, which is 3.6:1. `min-h` is the width divided by the widest ratio we will accept,
// so the box cannot be flatter than the band no matter how little the card holds — and the
// action row carries `mt-auto`, so the slack falls between the argument and the buttons
// rather than trailing off the bottom.

/**
 * The band a news card's box sits in, as width ÷ height.
 *
 * Below `min` a card is a tall ribbon and its figure has nowhere to sit beside its argument;
 * above `max` it is the letterbox this module exists to prevent. Square is 1. The lead is
 * allowed to be a little wider than an insight because it carries a chart, which is the one
 * element that genuinely wants horizontal room.
 */
export const CARD_ASPECT_BAND = { min: 0.5, max: 1.5 } as const;

export type NewsCardRole = 'lead' | 'insight';

/** The cap, in rem. The lead is a reading measure; an insight is a column. */
export const CARD_MAX_WIDTH_REM: Record<NewsCardRole, number> = { lead: 34, insight: 21 };

/** The floor the cap implies: a card at its full width may not be flatter than the band. */
export function cardMinHeightRem(role: NewsCardRole): number {
  // Quarter-rem steps, rounded UP: rounding down would put the widest card a hair outside
  // the band it is supposed to prove it sits in.
  return Math.ceil((CARD_MAX_WIDTH_REM[role] / CARD_ASPECT_BAND.max) * 4) / 4;
}

/**
 * The frame classes, written out because Tailwind reads source text and cannot see a
 * template literal. `cardShape.test.ts` parses these strings back into numbers and checks
 * them against the constants above, so the two cannot drift apart silently.
 */
export const CARD_FRAME: Record<NewsCardRole, string> = {
  lead: 'w-full max-w-[34rem] min-h-[22.75rem]',
  insight: 'w-full max-w-[21rem] min-h-[14rem]',
};

/**
 * The track the insights sit in: as many columns as fit, each one capped at an insight's own
 * width, and the leftover pushed into the gutter rather than into the cards.
 *
 * `justify-start` is load-bearing. Without it a two-column `auto-fit` grid distributes the
 * slack into the tracks, and although the card's own `max-w` would still hold, the cards
 * would float apart with a ragged gap between them.
 */
export const INSIGHT_TRACK =
  'grid justify-start gap-2 grid-cols-[repeat(auto-fit,minmax(15rem,21rem))]';

/**
 * The width at which a justification block earns its angled layout.
 *
 * A CONTAINER width, never the viewport. The three layouts were written with `sm:`, which is
 * a viewport query: on a desktop an insight card 336px wide still matched `sm:` and laid its
 * figure and its argument into two ~150px columns, which is the other half of "the cards did
 * not hold". A block only splits when the BLOCK has room to split.
 */
export const JUSTIFICATION_SPLIT_REM = 28;
