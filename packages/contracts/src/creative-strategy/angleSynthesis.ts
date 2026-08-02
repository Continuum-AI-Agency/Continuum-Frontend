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
