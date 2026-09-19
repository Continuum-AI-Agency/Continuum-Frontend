// Audience expansion — the three-bucket proposal an "expand audience" recommendation
// resolves into. The recommendation (F2 saturation / F3 exhaustion) says the pool is used
// up; this is the answer to "expand it with WHAT", in a shape a person can tick and a
// builder can create from.
//
// Three buckets, from the reference methodology (Prism doc 05):
//   1. currently_live — what the ad set already targets, so nothing is proposed twice;
//   2. existing_inventory — saved audiences, lookalike bands and retargeting pools the
//      account already has but this ad set has never used (cheapest expansion);
//   3. net_new_verified — interests the platform catalogue returned IN THIS SESSION, with
//      real ids and size bands. The only bucket that is safe to launch from.
//
// Two invariants the schema enforces rather than the prompt: a net-new interest carries
// a platform id and a verification stamp, and every option that can be created carries
// a size estimate. An option without either is theme-only prose, not a targeting option.

import { z } from 'zod';

export const audienceExpansionBucketSchema = z.enum([
  'currently_live',
  'existing_inventory',
  'net_new_verified',
]);
export type AudienceExpansionBucket = z.infer<typeof audienceExpansionBucketSchema>;

export const audienceExpansionOptionKindSchema = z.enum([
  'interest',
  'behavior',
  'demographic',
  'geo',
  'custom_audience',
  'lookalike',
  'saved_audience',
]);
export type AudienceExpansionOptionKind = z.infer<typeof audienceExpansionOptionKindSchema>;

export const audienceSizeEstimateSchema = z.object({
  lower: z.number().nonnegative(),
  upper: z.number().nonnegative(),
  /** Where the estimate came from: the platform's delivery estimate for a spec, or the
   *  catalogue's audience_size band for a single interest. */
  source: z.enum(['delivery_estimate', 'catalogue_band']),
});
export type AudienceSizeEstimate = z.infer<typeof audienceSizeEstimateSchema>;

export const audienceExpansionOptionSchema = z
  .object({
    bucket: audienceExpansionBucketSchema,
    kind: audienceExpansionOptionKindSchema,
    /** Platform id (interest id, custom audience id, saved audience id). Null only for
     *  demographic / geo widenings, which are spec edits rather than catalogue entries. */
    id: z.string().min(1).nullable().default(null),
    name: z.string().min(1),
    /** The spec fragment that adds this option (Meta targeting JSON), so a builder can
     *  merge options without re-deriving them. */
    spec: z.record(z.string(), z.unknown()).nullable().default(null),
    estimate: audienceSizeEstimateSchema.nullable().default(null),
    /** For net-new interests: the catalogue call verified this id in this session. */
    verified: z.boolean().default(false),
    /** Locale the catalogue answered in; interest catalogues are locale-specific. */
    locale: z.string().nullable().default(null),
    /** Brand-KB rule that would block this option, if any; a blocked option is shown
     *  crossed out with the rule, never silently dropped. */
    blocked_by: z.string().nullable().default(null),
    rationale: z.string().nullable().default(null),
  })
  .superRefine((option, ctx) => {
    if (option.bucket === 'net_new_verified') {
      if (!option.id) {
        ctx.addIssue({
          code: 'custom',
          path: ['id'],
          message: 'a net-new option needs a platform id',
        });
      }
      if (!option.verified) {
        ctx.addIssue({
          code: 'custom',
          path: ['verified'],
          message: 'a net-new option must be verified against the catalogue in this session',
        });
      }
    }
  });
export type AudienceExpansionOption = z.infer<typeof audienceExpansionOptionSchema>;

export const audienceExpansionProposalSchema = z.object({
  adset_id: z.string().min(1),
  adset_name: z.string().nullable().default(null),
  ad_account_id: z.string().min(1),
  /** The saturation evidence the proposal answers (frequency, reach growth, CPA drift). */
  diagnosis: z.string().min(1),
  /** Estimated reach of the ad set's CURRENT targeting, for the "+N" deltas to mean something. */
  current_estimate: audienceSizeEstimateSchema.nullable().default(null),
  options: z.array(audienceExpansionOptionSchema).min(1),
  /** Estimated reach of the proposal with every un-blocked option in the net-new and
   *  inventory buckets applied; null when no estimate could be made. */
  combined_estimate: audienceSizeEstimateSchema.nullable().default(null),
  /** The disclosure every audience answer carries. */
  disclosure: z
    .string()
    .default(
      'Interest ids were verified against the platform catalogue in this session; re-verify in Ads Manager before launch — catalogues are locale-specific and change often.',
    ),
});
export type AudienceExpansionProposal = z.infer<typeof audienceExpansionProposalSchema>;

/** Prism's executability test: can the user create this in the platform right now with the
 *  names, ids and structure provided? Options that fail are theme-only. */
export function executableOptions(proposal: AudienceExpansionProposal): AudienceExpansionOption[] {
  return proposal.options.filter(
    (o) =>
      o.bucket !== 'currently_live' &&
      o.blocked_by === null &&
      (o.kind === 'demographic' || o.kind === 'geo' ? o.spec !== null : o.id !== null),
  );
}
