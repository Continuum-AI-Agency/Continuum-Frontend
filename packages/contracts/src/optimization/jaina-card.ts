// Citing an optimizer card inside a Jaina answer.
//
// THE SHAPE IS THE GATE. A cited card carries an ID and never a figure, because there is no
// field for one. Today a model is stopped from inventing a number by `allowedNumberTokens`
// against `numbersOutsidePacket` — a regex over its prose, run after the fact and hoped to be
// exhaustive. Inside a card there is nothing to police: Jaina chooses WHICH comparison to show
// and writes the sentence around it, and cannot author what the chart says. A gate that cannot
// be argued with beats a gate that has to be checked.
//
// TWO RULES THAT KEEP A CITATION FROM ROTTING, both encoded here:
//
//   `read_id` pins the card to a stored read. A citation renders from THAT read, never from
//   live data — ask about last Tuesday and you get Tuesday's figures with Tuesday's date on
//   them, not today's numbers under last week's sentence, which is the worst thing a cited
//   chart can do.
//
//   A candidate that no longer exists still renders, with its date and a line saying it
//   cleared. A citation that disappears takes the answer's evidence with it and leaves prose
//   that now looks invented.

import { z } from 'zod';

/**
 * How much of the frame a citation takes.
 *
 * `chip` when the figure belongs inside a sentence; `card` when the whole answer rests on one
 * comparison; `strip` when the answer is "here are the three things". More than three is not
 * an answer, it is the account read — link to it instead.
 */
export const jainaCardSizeSchema = z.enum(['chip', 'card', 'strip']);
export type JainaCardSize = z.infer<typeof jainaCardSizeSchema>;

export const jainaOptimizerCardSchema = z
  .object({
    /** The stored read this citation is pinned to. */
    read_id: z.string().min(1),
    /**
     * '<detector>:<scope>' — the same stable id a cooldown recognises. A strip carries three;
     * never four, and the schema is where that is enforced rather than in a renderer.
     */
    candidate_ids: z.array(z.string().min(1)).min(1).max(3),
    size: jainaCardSizeSchema,
  })
  .strict();
export type JainaOptimizerCard = z.infer<typeof jainaOptimizerCardSchema>;

/** A `strip` means three; a `chip` or a `card` means one. Stated once, tested once. */
export function citationIsWellFormed(card: JainaOptimizerCard): boolean {
  return card.size === 'strip' ? card.candidate_ids.length === 3 : card.candidate_ids.length === 1;
}

/** What a reader is told when the run that produced a citation has moved on. */
export const CITATION_CLEARED_NOTE = 'This one cleared — the figures are from the read it cites.';
