// Prompt and context limits, in one place because two places is how they drift.
//
// The current system has no coherent policy at all. Verified on the working tree:
// the positive `prompt` on the Backend image and video request schemas has NO maximum,
// while `negative_prompt` caps at 2,000; the Canvas String node and the shared composer
// both accept unbounded input; saved Prompt and Skill bodies cap at 20,000. So the one
// field that reaches every provider is the one nobody bounded, and a paste of a long
// document fails at the provider with an opaque error instead of in the editor with an
// actionable one.
//
// The policy below is provisional and must be CALIBRATED against measured assembled
// requests rather than trusted as truth — that is why every constant carries the reason
// it was chosen. What is not provisional is the shape: one number, shared by the
// Frontend editor and the Backend validator, returning the same overage semantics on
// both sides. A cap the client enforces and the server does not is not a cap.

import { z } from 'zod';

/**
 * Counted in Unicode CODE POINTS, not UTF-16 units.
 *
 * `'👍'.length === 2` and `'é'` composed from `e` + U+0301 is also 2, so a naive
 * `.length` charges an emoji double and tells a user their prompt is longer than it
 * reads. Both sides must count the same way or the client and server disagree about
 * whether the same string fits.
 */
export const countCodePoints = (value: string): number => [...value].length;

/**
 * A human-authored text field, bounded the way `countCodePoints` counts.
 *
 * Zod's `.min()` / `.max()` measure UTF-16 code units, which is the wrong unit for
 * anything a person typed: `'👍'` costs 2 and a decomposed `'é'` costs 2, so a browser
 * `maxLength` and a server `.max()` disagree about the same string — the exact split the
 * policy above exists to prevent. Every author-facing field in this module therefore
 * goes through this helper, and `.max()` survives only on ASCII machine identifiers
 * (ids, slugs, hashes, uuids, version strings) where the two units cannot diverge.
 *
 * `min` of 0 means the empty string is legal; the lower bound is simply not attached.
 */
export const boundedText = (min: number, max: number): z.ZodString => {
  const bounded = z.string().refine((value) => countCodePoints(value) <= max, {
    message: `must be at most ${max} Unicode code points`,
  });
  if (min <= 0) return bounded;
  return bounded.refine((value) => countCodePoints(value) >= min, {
    message: `must be at least ${min} Unicode code points`,
  });
};

/**
 * An array of bounded text, so the caller states only the array's own cap.
 *
 * Written as a helper because the per-item bound is the part that is easy to forget:
 * `z.array(z.string()).max(10)` bounds the list and leaves each entry unbounded, which
 * is how a ten-element array becomes a document.
 */
export const boundedTextArray = (min: number, max: number): z.ZodArray<z.ZodString> =>
  z.array(boundedText(min, max));

/** Soft ceiling: the editor warns, the request still runs. */
export const FREEFORM_PROMPT_SOFT_LIMIT = 8_000;

/** Hard ceiling: the request is refused, in the editor and at the boundary. */
export const FREEFORM_PROMPT_HARD_LIMIT = 12_000;

/**
 * Negative prompts stay at the Backend's existing 2,000 because that value is already
 * enforced and changing it is a behaviour change with no evidence behind it. Raising a
 * limit on a hunch is exactly the move the fetch-optimization playbook forbids.
 */
export const NEGATIVE_PROMPT_HARD_LIMIT = 2_000;

/**
 * Total assembled context the compiler may hand a provider, before the provider's own
 * profile ceiling is applied. The profile always wins when it is lower — this is an
 * authoring policy, not a claim about any model.
 */
export const ASSEMBLED_CONTEXT_SOFT_LIMIT = 24_000;
export const ASSEMBLED_CONTEXT_HARD_LIMIT = 32_000;

/**
 * Per-block allocations, in code points.
 *
 * Order matters: the compiler places blocks in this order and the un-trimmable ones go
 * first, so a budget shortfall surfaces as a refusal to compile rather than as a
 * silently missing brand rule. `brandDirection` sits at 3,600 to stay in the same order
 * of magnitude as the Organic skill-injection ceilings already in production.
 */
export const BLOCK_BUDGETS = Object.freeze({
  brandDirection: 3_600,
  presetLaws: 2_400,
  exactCopy: 1_200,
  artDirection: 1_600,
  styleBlock: 900,
  polishBlock: 700,
  exclusions: 1_200,
  references: 600,
  skills: 3_200,
  userBrief: FREEFORM_PROMPT_HARD_LIMIT,
  examples: 800,
  providerFraming: 600,
} as const);

export type BudgetBlock = keyof typeof BLOCK_BUDGETS;

/**
 * Blocks that are never trimmed to make room.
 *
 * These carry the guarantees the system makes: what the brand forbids, what the words
 * literally are, what must not appear, and which real asset the output must match.
 * Dropping any of them produces output that looks fine and is wrong, which is worse
 * than a refusal. If they do not fit, compilation fails with the per-block report.
 */
export const UNTRIMMABLE_BLOCKS: readonly BudgetBlock[] = Object.freeze([
  'brandDirection',
  'exactCopy',
  'exclusions',
  'references',
]);

export const isTrimmable = (block: BudgetBlock): boolean => !UNTRIMMABLE_BLOCKS.includes(block);

/** Curation batch size. Five is the documented default; the schema permits 1-10. */
export const DEFAULT_CANDIDATE_COUNT = 5;
export const MIN_CANDIDATE_COUNT = 1;
export const MAX_CANDIDATE_COUNT = 10;

export type OverageState = 'ok' | 'soft-warn' | 'hard-refuse';

/**
 * One shared classifier so the editor's warning and the boundary's refusal cannot
 * disagree about the same string.
 */
export const classifyFreeformLength = (value: string): OverageState => {
  const length = countCodePoints(value);
  if (length > FREEFORM_PROMPT_HARD_LIMIT) return 'hard-refuse';
  if (length > FREEFORM_PROMPT_SOFT_LIMIT) return 'soft-warn';
  return 'ok';
};
