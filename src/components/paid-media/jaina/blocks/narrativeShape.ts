// The shape of a narrative block's reading: three fields or one body.
//
// Shared by the block that draws it and the section that lays it out, and kept out of
// `NarrativeBlock.tsx` so `JainaJustificationSection` can decide a stratum without pulling
// the lazy block component into the main bundle.

import type { NarrativeBlockV2 } from '@/lib/jaina/schemas';

/** The three fields of a J2 narrative, present together or not at all. */
export type NarrativeThree = { what: string; so_what: string; now_what: string };

const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * A narrative that says what happened, what it means and what to do as three separate
 * fields is the J2 shape (Prism's three boxes). All three or none: a block carrying one
 * or two is today's single body with stray fields, and drawing two boxes and an empty
 * third would be the card inventing a section the model never wrote.
 *
 * And only when the three hold every paragraph of the body (decision 4, Phase 3): the boxes are
 * a resource for findings that fit in three, never a replacement for the body. A diagnostic
 * that closed seven hypotheses writes one paragraph per finding, and boxes cut from it by
 * sentence position hid the findings behind them — that body is drawn whole instead.
 */
export function narrativeThreeOf(
  block: Pick<NarrativeBlockV2, 'what' | 'so_what' | 'now_what' | 'body'>,
): NarrativeThree | null {
  const what = block.what?.trim() ?? '';
  const soWhat = block.so_what?.trim() ?? '';
  const nowWhat = block.now_what?.trim() ?? '';
  if (!what || !soWhat || !nowWhat) return null;
  const boxes = squash(`${what} ${soWhat} ${nowWhat}`);
  const holdsBody = block.body
    .split(/\n{2,}/)
    .map(squash)
    .every((paragraph) => paragraph.length === 0 || boxes.includes(paragraph));
  return holdsBody ? { what, so_what: soWhat, now_what: nowWhat } : null;
}
