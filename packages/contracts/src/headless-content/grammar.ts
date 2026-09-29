// The reel grammars and variation axes: their own module so effects.ts and styles.ts can read them
// while index.ts reads those (no import cycle).

import { z } from 'zod';

/** A reel's story shape. offer-direct is the original grammar (the offer in the hook); the others
 * are chosen by the caller, never by the director. */
export const headlessGrammarSchema = z.enum([
  'offer-direct',
  'problem-solution',
  'street-interview',
  // Named for the concept round (2026-09-29); each is refused by the director until its file exists
  // under Continuum-Backend/App/paid/creative-swap/grammars/.
  'street-price-guess',
  'reply-to-comment',
  'car-storytime',
  'expectation-vs-reality',
  'pov',
  'unpopular-opinion',
  'busy-day-routine',
]);
export type HeadlessGrammar = z.infer<typeof headlessGrammarSchema>;
/** The one thing a variant changes against its base, in the order a winner is iterated. `effect`
 * re-styles the base's own takes (no re-shoot), so it costs nothing to try. */
export const headlessVariationAxisSchema = z.enum([
  'hook',
  'face',
  'location',
  'grammar',
  'effect',
]);
export type HeadlessVariationAxis = z.infer<typeof headlessVariationAxisSchema>;
