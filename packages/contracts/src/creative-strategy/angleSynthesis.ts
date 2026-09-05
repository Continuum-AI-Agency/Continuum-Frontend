// Angle synthesis — the contract between the evidence assembler and the worker
// that PROPOSES brand creative concepts from that evidence.
//
// Governing rule (the reason this file exists as a contract rather than a prompt):
//
//   The worker never mints an ID, and the worker can never invent an angle.
//
// Every concept it proposes must carry an `angleId` drawn from the CLOSED global
// vocabulary handed to it in `allowedAngles`. A value outside that list is a HARD
// REJECT of the proposal — it is NOT coerced to 'unknown', because a coerce would
// launder a hallucinated strategy into the store as a legitimate-looking row.
// Likewise `mergeCandidateConceptId` and `proposedBrandAngleSlug` may only point at
// identifiers the caller already supplied in `existingConcepts`; the worker proposes,
// the caller resolves and mints.
//
// `proposedConceptSchema` deliberately contains ZERO numeric fields. The worker is a
// language model reading evidence; it does not get to assert counts, spend, lift,
// confidence scores, or any other number. Every number in the system comes from the
// measured store, and the worker's only tie back to those numbers is `groundedOn` —
// node ids it must cite from the evidence it was given.

import { z } from 'zod';

import { ANGLE_VOCAB_VERSION, globalAngleIdSchema } from './angles';

/**
 * A single citation back into the evidence graph the worker was handed. `claim` is the
 * worker-visible sentence; `nodeId` is what makes it checkable. `observedAt` is when the
 * underlying fact was measured, `asOf` when the evidence snapshot was assembled — they
 * differ whenever cached evidence is replayed, and both are needed to judge staleness.
 */
export const evidenceCitationSchema = z.object({
  kind: z.enum([
    'audience_node',
    'creative_node',
    'winrate_row',
    'breakdown_row',
    'targeting_node',
    'competitor_family',
    'asset_deployment',
  ]),
  nodeId: z.string(),
  claim: z.string(),
  observedAt: z.string(),
  asOf: z.string(),
});
export type EvidenceCitation = z.infer<typeof evidenceCitationSchema>;

/**
 * Everything the synthesis worker is allowed to see. `vocabVersion` is pinned to the
 * vocabulary the caller built `allowedAngles` from, so a proposal produced under an
 * older vocabulary can never be replayed against a newer one unnoticed.
 */
export const angleSynthesisContextSchema = z.object({
  brandId: z.string(),
  vocabVersion: z.literal(ANGLE_VOCAB_VERSION),
  allowedAngles: z.array(
    z.object({
      angleId: globalAngleIdSchema,
      label: z.string(),
      definition: z.string(),
    }),
  ),
  existingConcepts: z.array(
    z.object({
      conceptId: z.string(),
      slug: z.string(),
      label: z.string(),
      angleId: z.string(),
      status: z.string(),
    }),
  ),
  evidence: z.object({
    performance: z.array(evidenceCitationSchema),
    analytics: z.array(evidenceCitationSchema),
    audiences: z.array(evidenceCitationSchema),
    catalog: z.array(evidenceCitationSchema),
    creatives: z.array(evidenceCitationSchema),
  }),
});
export type AngleSynthesisContext = z.infer<typeof angleSynthesisContextSchema>;

/**
 * One proposed brand creative concept. Note the absence of any numeric field — see the
 * file header. `groundedOn` must be non-empty: an ungrounded concept is an opinion, and
 * the whole point of the synthesis pass is that opinions do not enter the store.
 */
export const proposedConceptSchema = z.object({
  angleId: globalAngleIdSchema,
  proposedBrandAngleSlug: z.string().nullable(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,48}$/),
  label: z.string().max(80),
  description: z.string().max(400),
  groundedOn: z.array(z.string()).min(1),
  mergeCandidateConceptId: z.string().nullable(),
});
export type ProposedConcept = z.infer<typeof proposedConceptSchema>;

// ---------------------------------------------------------------------------
// The review pass — the file header's rules, enforced instead of described.
// ---------------------------------------------------------------------------

/**
 * How many concepts this evidence can actually support.
 *
 * 3–5 is a RANGE, and the evidence decides where in it you land. An ad set running one
 * creative has nothing to contrast, so five "distinguished" angles from it are five
 * guesses wearing the costume of analysis — which is the exact failure this whole line of
 * work exists to stop. The ceiling is therefore the number of distinct creatives actually
 * observed, capped at five.
 */
export function proposalBudget(context: AngleSynthesisContext): {
  min: number;
  max: number;
  reason: string;
} {
  const distinctCreatives = new Set(context.evidence.creatives.map((c) => c.nodeId)).size;
  if (distinctCreatives <= 1) {
    return {
      min: 1,
      max: 1,
      reason:
        distinctCreatives === 0
          ? 'no creative evidence: nothing to contrast, so nothing may be distinguished'
          : 'one creative observed: there is no comparison to draw an angle from',
    };
  }
  const max = Math.min(distinctCreatives, 5);
  return {
    min: Math.min(3, max),
    max,
    reason: `${distinctCreatives} distinct creatives observed`,
  };
}

export type RejectedConcept = { concept: ProposedConcept; reason: string };

export type ConceptReview = {
  accepted: ProposedConcept[];
  rejected: RejectedConcept[];
};

/**
 * Judge what the worker proposed against what it was allowed to see.
 *
 * Three rules, each of which has a specific way of going wrong quietly:
 *
 *  1. An angle outside `allowedAngles` is REJECTED, never coerced to 'unknown'. A coerce
 *     launders a hallucinated strategy into the store as a legitimate-looking row.
 *  2. Every citation in `groundedOn` must name a nodeId that was actually in the evidence.
 *     A model that cites an id nobody gave it has invented its justification, and an
 *     invented justification is worse than none: it reads as checked.
 *  3. `mergeCandidateConceptId` may only point at a concept the caller supplied. The
 *     worker proposes; the caller resolves and mints.
 *
 * Rejections are returned rather than thrown so one bad concept does not discard four good
 * ones — but a rejected concept never reaches the store.
 */
export function reviewProposedConcepts(
  context: AngleSynthesisContext,
  concepts: readonly ProposedConcept[],
): ConceptReview {
  const allowed = new Set(context.allowedAngles.map((a) => a.angleId));
  const knownNodes = new Set(
    Object.values(context.evidence)
      .flat()
      .map((citation) => citation.nodeId),
  );
  const knownConcepts = new Set(context.existingConcepts.map((c) => c.conceptId));

  const accepted: ProposedConcept[] = [];
  const rejected: RejectedConcept[] = [];

  for (const concept of concepts) {
    if (!allowed.has(concept.angleId)) {
      rejected.push({
        concept,
        reason: `angle "${concept.angleId}" is not in this portfolio's allowed list`,
      });
      continue;
    }
    const uncited = concept.groundedOn.filter((nodeId) => !knownNodes.has(nodeId));
    if (uncited.length > 0) {
      rejected.push({
        concept,
        reason: `cites evidence it was never given: ${uncited.join(', ')}`,
      });
      continue;
    }
    if (
      concept.mergeCandidateConceptId !== null &&
      !knownConcepts.has(concept.mergeCandidateConceptId)
    ) {
      rejected.push({
        concept,
        reason: `merge target "${concept.mergeCandidateConceptId}" is not an existing concept`,
      });
      continue;
    }
    accepted.push(concept);
  }

  return { accepted, rejected };
}
