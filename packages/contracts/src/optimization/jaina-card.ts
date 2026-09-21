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

import { accountDetectorSchema } from './account-strategy';

/**
 * How much of the frame a citation takes.
 *
 * `chip` when the figure belongs inside a sentence; `card` when the whole answer rests on one
 * comparison; `strip` when the answer is "here are the three things". More than three is not
 * an answer, it is the account read — link to it instead.
 */
export const jainaCardSizeSchema = z.enum(['chip', 'card', 'strip']);
export type JainaCardSize = z.infer<typeof jainaCardSizeSchema>;

/**
 * The half of a candidate id that gets PRINTED must be a detector we know.
 *
 * `.strict()` is a shape gate, not a digit gate: it keeps a number out of every field, and
 * then `candidate_ids` is a free string that the renderer splits on ':' and shows. So
 * `['$4,200/day wasted:acct']` rode the wire intact and rendered a figure on screen, under a
 * sentence claiming it came from the stored read — the one thing the whole figure-free
 * payload exists to prevent. The scope after the colon may legitimately be numeric (a Meta
 * object id), so it stays free; the detector may not.
 */
function hasKnownDetectorPrefix(id: string): boolean {
  return accountDetectorSchema.safeParse(id.split(':')[0]).success;
}

export const jainaOptimizerCardSchema = z
  .object({
    /** The stored read this citation is pinned to. */
    read_id: z.string().min(1),
    /**
     * '<detector>:<scope>' — the same stable id a cooldown recognises. A strip carries three;
     * never four, and the schema is where that is enforced rather than in a renderer.
     */
    candidate_ids: z.array(z.string().min(1).refine(hasKnownDetectorPrefix)).min(1).max(3),
    size: jainaCardSizeSchema,
  })
  .strict();
export type JainaOptimizerCard = z.infer<typeof jainaOptimizerCardSchema>;

/** A `strip` means three; a `chip` or a `card` means one. Stated once, tested once. */
export function citationIsWellFormed(card: JainaOptimizerCard): boolean {
  return card.size === 'strip' ? card.candidate_ids.length === 3 : card.candidate_ids.length === 1;
}

/** What a reader is told when the run that produced a citation has moved on. */
/**
 * The finding is genuinely gone: the read this citation names IS the read being served, and
 * the candidate is not in it any more.
 */
export const CITATION_CLEARED_NOTE = 'This one cleared — the figures are from the read it cites.';

/**
 * A different, and much commoner, thing: the cited read is not the one being served.
 *
 * `optimizer_get_account_read` serves only the LATEST ready read per ad account, and
 * transcripts persist — so every citation looked at after its own day lands here. Saying
 * "this one cleared" there tells the reader the finding was FIXED, which is a claim about
 * the account rather than an absence of data, and it would be wrong nearly every time.
 */
/**
 * We could not ask. An RLS denial, a function that is not deployed, a dropped request.
 *
 * This is a third thing, and it used to wear the sentence below — so a failure whose reason
 * the resolver deliberately preserves was reported to the reader as a stale citation, and a
 * citation still LOADING said the same. Three states, one sentence, two of them false.
 */
export const CITATION_UNREACHABLE_NOTE =
  'Could not reach the read this cites — the figures are not lost, just not on hand right now.';

export const CITATION_NOT_SERVED_NOTE =
  'From an earlier read — only today’s is kept, so its figures are no longer on hand.';

/**
 * The `state.delta` variant a citation travels on, Backend-side.
 *
 * A citation needed no new frame type: `state.delta` is already forwardable and already
 * fans out by `source` (`objectives_init` → the plan, `checkpoint_summary` → the summary).
 * Adding a twenty-ninth frame type would have meant two more allowlists to keep in parity,
 * for a payload that is three fields wide. The literal lives here because the emitter and
 * the chunk adapter are different modules and a string they both retype is a string that
 * eventually disagrees.
 */
export const JAINA_OPTIMIZER_CARD_DELTA_SOURCE = 'optimizer_card';
