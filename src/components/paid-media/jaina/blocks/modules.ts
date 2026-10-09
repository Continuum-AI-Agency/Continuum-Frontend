// How a Jaina answer is grouped: tinted modules, never boxes.
//
// An answer used to be a bordered card holding bordered tiles, bordered tables and bordered
// callouts — a box inside a box inside a box, every one of them at the same weight. A module
// here has no border at all: a very soft fill and a rounded corner say "this belongs
// together", and the gap between modules (`gap-3`) says "this is the next thing". No divider
// lines between modules either; whitespace is the separator.
//
// Three fills, each with one meaning:
//
//   neutral   the reading, the evidence, a chart — material the answer rests on
//   decision  Jaina asking for a move (the actions, an approval): the primary tint, because
//             purple is reserved for what asks a decision
//   tinted    a tile whose figure moved against its prior or its target: a faint green or red
//             wash from the top that fades into the neutral fill. The wash says "this moved";
//             the FIGURE carries the colour, never the whole card (see `reading.ts`).
//
// `data-jaina-module` marks a module's root so a container that is itself a module (the
// evidence fold) can flatten the one nested inside it instead of stacking two fills.

import type { Judgement } from '../reading';

const MODULE_SHAPE = 'rounded-xl p-3 sm:p-4';

export const JAINA_MODULE = {
  neutral: `${MODULE_SHAPE} bg-muted/40`,
  decision: `${MODULE_SHAPE} bg-primary/10`,
} as const;

/** The gap between modules. The only separator an answer uses. */
export const JAINA_MODULE_GAP = 'gap-3';

/**
 * A tile's fill for the direction its figure moved. Only a judged movement tints: an
 * unremarkable or unjudged figure keeps the neutral fill, because a wash on a figure nobody
 * judged would claim a verdict nobody gave.
 */
export const MODULE_TINT: Record<Judgement, string> = {
  positive: 'bg-gradient-to-b from-success/10 to-muted/40 to-85%',
  risk: 'bg-gradient-to-b from-destructive/10 to-muted/40 to-85%',
  watch: 'bg-muted/40',
  neutral: 'bg-muted/40',
  unjudged: 'bg-muted/40',
};

/**
 * Flattens a block module nested inside a module container (the evidence fold), so the
 * container's fill is the only one and the block keeps its content.
 */
export const FLATTEN_NESTED_MODULE =
  '[&_[data-jaina-module=block]]:rounded-none [&_[data-jaina-module=block]]:bg-transparent [&_[data-jaina-module=block]]:p-0';

/**
 * The answer's lead sentence: the `answer` step of the scale (`JAINA_TYPE.answer`, 20px) at
 * semibold, so the one sentence that answers the question outweighs every module under it.
 * Layered over `JAINA_ANSWER_PROSE` with `cn`, which resolves the weight.
 */
export const JAINA_LEAD = 'font-semibold tracking-[-0.01em]';
