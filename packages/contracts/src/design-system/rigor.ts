// How strictly a brand wants its own system applied — computed, not asked.
//
// Brands govern themselves at very different intensities, and that difference should
// reach generation. But asking at onboarding ("how strict are you?") produces a
// meaningless answer: nobody self-reports as loose, and the question arrives before
// the user has seen what we extracted. The evidence is already in the artifact — a
// system with 84 tokens, a lint config, and two dozen "nunca" rules is telling us
// something a three-swatch PDF is not.
//
// So the tier is DERIVED and the evidence is stored alongside it, which is what makes
// the card able to explain itself ("84 tokens · adherence config · 23 rules") and what
// makes an override meaningful rather than arbitrary. The override exists because a
// brand that authored a rich system and still wants loose application is making a
// legitimate choice we have no standing to refuse.

import { z } from 'zod';
import type { AuthoritySource } from '../creative-system/creative-spec';
import type { DesignAdherence } from './tokens';

export const designRigorTierSchema = z.enum(['strict', 'guided', 'loose']);
export type DesignRigorTier = z.infer<typeof designRigorTierSchema>;

export const designRigorEvidenceSchema = z
  .object({
    tokenCount: z.number().int().nonnegative(),
    /** Rules the source stated imperatively ("never", "always", "only"). */
    imperativeRuleCount: z.number().int().nonnegative(),
    hasAdherenceConfig: z.boolean(),
    /** Sections that came from a machine-readable source rather than prose. */
    declaredSectionCount: z.number().int().nonnegative(),
    exemplarCount: z.number().int().nonnegative(),
  })
  .strict();
export type DesignRigorEvidence = z.infer<typeof designRigorEvidenceSchema>;

/**
 * Thresholds.
 *
 * `strict` requires an adherence config as well as volume, because volume alone is
 * satisfiable by a generated token dump — the config is the part a human had to mean.
 * `guided` is an OR: a system can earn it either by having a real token set or by
 * having been written down carefully in prose, and demanding both would drop most
 * PDF-derived systems to `loose` where they would shape nothing.
 */
export const RIGOR_THRESHOLDS = Object.freeze({
  strictTokens: 40,
  strictRules: 8,
  guidedTokens: 12,
  guidedRules: 4,
});

export function computeRigorTier(evidence: DesignRigorEvidence): DesignRigorTier {
  if (
    evidence.hasAdherenceConfig &&
    evidence.tokenCount >= RIGOR_THRESHOLDS.strictTokens &&
    evidence.imperativeRuleCount >= RIGOR_THRESHOLDS.strictRules
  ) {
    return 'strict';
  }
  if (
    evidence.tokenCount >= RIGOR_THRESHOLDS.guidedTokens ||
    evidence.imperativeRuleCount >= RIGOR_THRESHOLDS.guidedRules
  ) {
    return 'guided';
  }
  return 'loose';
}

/** One-line justification for the card, so the tier is never an unexplained verdict. */
export function describeRigorEvidence(evidence: DesignRigorEvidence): string {
  const parts = [`${evidence.tokenCount} tokens`];
  if (evidence.hasAdherenceConfig) parts.push('adherence config');
  if (evidence.imperativeRuleCount > 0)
    parts.push(`${evidence.imperativeRuleCount} explicit rules`);
  if (evidence.exemplarCount > 0) parts.push(`${evidence.exemplarCount} exemplars`);
  return parts.join(' · ');
}

/**
 * Where a design system sits on the compiler's authority ladder.
 *
 * Only `strict` reaches `brand-hard`, which is a NON_NEGOTIABLE_SOURCE — it cannot be
 * trimmed to fit a provider and it outranks an explicit user selection, which is a
 * strong thing to hand a system on the strength of an automated read. Requiring an
 * adherence config for that tier is what keeps the promotion honest.
 */
export function authorityForRigor(tier: DesignRigorTier): AuthoritySource {
  return tier === 'strict' ? 'brand-hard' : 'brand-preferred';
}

/** Whether a tier's rules should become executable gates rather than only prose. */
export function gatesAtRigor(tier: DesignRigorTier): boolean {
  return tier === 'strict';
}

/**
 * Count statements that read as commands rather than description.
 *
 * Deliberately multilingual: the CBA system is written in Spanish, and an
 * English-only matcher would score it `loose` and then apply almost none of it —
 * a scoring bug that would present as "the design system does not work for LATAM
 * brands". Matching is on whole words to avoid "never" inside "nevertheless" and,
 * more importantly, "no" inside every Spanish word containing it.
 */
const IMPERATIVE_RE =
  /(?:^|[\s(«"'—-])(never|always|must|only|avoid|do not|don't|forbidden|required|no|nunca|siempre|debe|solo|sólo|evitar|prohibido|jamás|sin)(?=$|[\s,.;:)»"'—-])/giu;

export function countImperativeRules(text: string): number {
  return (text.match(IMPERATIVE_RE) ?? []).length;
}
