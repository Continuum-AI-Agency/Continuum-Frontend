// The brand's own proven art directions, as something browsable.
//
// A direction that already worked for THIS brand is better evidence than anything a
// model invents cold, and once `artDirection` persists on every reel scene the brand
// accumulates them for free. What was missing was a way to see them.
//
// The shape follows the progressive-disclosure contract the skills system already uses
// (`SkillSummary` in the prompt, full body loaded on demand): an index entry is a label
// plus provenance, small enough that a dozen cost nothing in context, and the full
// `artDirection` is fetched only for the one the agent chooses to build on.

import { z } from 'zod';
import { artDirectionSchema } from './art-direction';

export const provenDirectionSchema = z
  .object({
    /** `summarizeArtDirection` output — the scannable one-liner. */
    summary: z.string().min(1),
    /** The draft this direction was used on, so the agent can go look at the result. */
    draftId: z.string().min(1),
    role: z.string().min(1).nullable().optional(),
    /**
     * Why this one is in the index — "3.1% hook rate, top decile". Optional because a
     * brand with no metrics yet still has directions worth reusing for consistency.
     */
    performanceNote: z.string().max(200).nullable().optional(),
    direction: artDirectionSchema,
  })
  .strict();
export type ProvenDirection = z.infer<typeof provenDirectionSchema>;

/**
 * The index block, name-and-provenance only.
 *
 * Deliberately NOT the full directions: a dozen complete `artDirection` objects would
 * cost more context than the agent's whole system prompt, and the point of an index is
 * to choose before you load.
 */
export function renderDirectionIndex(entries: readonly ProvenDirection[]): string {
  if (entries.length === 0) return '';
  const rows = entries.map((entry, index) => {
    const provenance = entry.performanceNote ? ` — ${entry.performanceNote}` : '';
    const role = entry.role ? ` (${entry.role})` : '';
    return `${index + 1}. ${entry.summary}${role}${provenance} [draft ${entry.draftId}]`;
  });
  return [
    'Art directions that already ran for this brand — prefer building on one of these over inventing a look:',
    ...rows,
  ].join('\n');
}

/**
 * The most recent proven directions, best-first, deduplicated by look.
 *
 * Deduplicated on `summary` because a brand that shot five reels in one style would
 * otherwise fill the whole index with the same frame, which is the opposite of useful:
 * an index exists to offer a choice.
 */
export function selectDirectionIndex(
  entries: readonly ProvenDirection[],
  limit = 8,
): ProvenDirection[] {
  const seen = new Set<string>();
  const chosen: ProvenDirection[] = [];
  for (const entry of entries) {
    const key = entry.summary.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push(entry);
    if (chosen.length >= limit) break;
  }
  return chosen;
}
