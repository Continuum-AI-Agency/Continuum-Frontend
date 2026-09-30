// A pacing verdict the packet does not carry may not survive in the prose.
//
// The growth sentence is written by a model from a packet, and the packet's `growth.pacing`
// is the verdict: `status: null` means the engine measured nothing against a plan, because
// the portfolio runs no flight. A sentence that still ends "and is on track" beside a null
// verdict is the invented half of a reading joined to the measured half by an "and" — the
// exact sentence the Backend's `pacingVerdict` was written to stop. But a brief written by a
// Backend from before that fix is still the brief on the screen, so the screen has to hold
// the line too.
//
// This strips the CLAUSE, not the word: ", and is on track" goes, "which is above the 35
// target" stays. The vocabulary is the small one the prompt asks for ("pace"), plus the
// obvious synonyms; a sentence with no such clause comes back untouched.

const PACE_WORDS =
  '(?:on|off|under|over|ahead of|behind)\\s+(?:track|pace|schedule|plan)|(?:under|over)-?pacing|pacing\\s+(?:well|normally|as planned|ahead|behind)';

/**
 * The clause: an optional joiner, an optional subject and verb, the pace words, and whatever
 * follows them up to the next clause boundary. Lazy on the tail so "on track and cost is 12%
 * over target" loses "on track" alone.
 */
const PACE_CLAUSE = new RegExp(
  `\\s*[,;]?\\s*(?:and|but|while|yet|so)?\\s*(?:it|the portfolio|spend|delivery|pacing|which)?\\s*(?:is|remains|stays|are|was|'s)?\\s*(?:currently|still|also)?\\s*(?:${PACE_WORDS})[^.,;]*?(?=[.,;]|\\s+(?:and|but|while)\\b|$)`,
  'gi',
);

/** The sentence with every pace clause removed, or the sentence itself when it made none. */
export function stripPaceClaim(sentence: string): string {
  if (!PACE_CLAUSE.test(sentence)) return sentence;
  PACE_CLAUSE.lastIndex = 0;
  const stripped = sentence
    .replace(PACE_CLAUSE, '')
    // A joiner the clause left at the front — "and cost is …" — or at the back.
    .replace(/^\s*(?:[,;·]|and|but|while|yet|so)\s*/i, '')
    .replace(/\s*(?:[,;·]|and|but|while|yet|so)\s*$/i, '')
    .replace(/\s+([.,;])/g, '$1')
    .replace(/,\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Nothing but punctuation is nothing: the sentence was the claim.
  if (!/[\p{L}\d]/u.test(stripped)) return '';
  const capitalised = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return /[.!?]$/.test(sentence) && !/[.!?]$/.test(capitalised) ? `${capitalised}.` : capitalised;
}
