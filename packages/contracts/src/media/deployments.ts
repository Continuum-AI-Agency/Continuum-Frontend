// Creative DNA — the deployment ledger and the performance read that hangs off it.
//
// A "deployment" is a place a creative actually RAN: a Meta ad, or a published
// organic post. media.asset_deployments records the link; nothing here stores a
// metric. The performance shapes below mirror what
// public.media_get_asset_performance returns, which JOINS out to the stores that
// already own the numbers (paid_media.ads.windows, organic.post_metric_snapshots)
// so the Library and the Optimizer can never quote different figures.
//
// Read these types as "what we know, and how well we know it" — every deployment
// carries the method that produced it and a confidence, because a visual-embedding
// match is a guess and must never be rendered as if it were a fact.

import { z } from 'zod';
// The paid metric window is ONE vocabulary, owned by creative-strategy/paid.ts.
// Re-declaring it here made the root star-export ambiguous ("Export named
// 'paidMetricWindowSchema' cannot be resolved due to ambiguous multiple bindings"),
// which breaks EVERY consumer importing it from the root entry — the only import
// style the Backend supports.
import { paidMetricWindowSchema } from '../creative-strategy/paid';
import {
  OptimizerDecisionOutcomeSummarySchema,
  PaidAdViralitySummarySchema,
} from '../optimization/service';

// Where a creative ran.
export const deploymentSurfaceSchema = z.enum(['meta_ad', 'organic_post']);
export type DeploymentSurface = z.infer<typeof deploymentSurfaceSchema>;

// How the link was established, strongest first:
//   declared         — the app knew the asset id at publish/creation time.
//   import           — the Library asset was created FROM this ad creative.
//   storage_path     — the media URL resolved to <brandId>/<assetId>/ (exact:
//                      storage paths are unique and asset-scoped).
//   byte_hash        — sha256 of the ad's media bytes matched media.assets.checksum.
//   visual_embedding — nearest-neighbour on the 1408-dim multimodal embedding.
//                      This one is an INFERENCE. It survives Meta's re-encode,
//                      which byte_hash does not, but it can be wrong.
export const deploymentLinkMethodSchema = z.enum([
  'declared',
  'import',
  'storage_path',
  'byte_hash',
  'visual_embedding',
]);
export type DeploymentLinkMethod = z.infer<typeof deploymentLinkMethodSchema>;

/** The only link method that is a guess rather than a fact. */
export const isInferredLinkMethod = (method: DeploymentLinkMethod): boolean =>
  method === 'visual_embedding';

// Trust flags travel with the numbers, everywhere the numbers travel.
//   low_evidence    — below the paid evidence floors ($50 spend AND 3,000
//                     impressions — the same floors the win-rate cohorts use).
//   inferred_link   — at least one contributing link was a visual-embedding
//                     guess, so these figures may belong to a different creative.
//   unknown_version — the link could not know which version ran (a Meta ad cannot
//                     tell you which cut of your file it was built from).
export const deploymentTrustFlagSchema = z.enum([
  'low_evidence',
  'inferred_link',
  'unknown_version',
]);
export type DeploymentTrustFlag = z.infer<typeof deploymentTrustFlagSchema>;

// ---------------------------------------------------------------------------
// Per-deployment performance
// ---------------------------------------------------------------------------

// The paid metric vocabulary. Everything is nullable because a missing
// measurement is NOT a measurement of zero: `roas: null` means "we never captured
// revenue for this window", while `roas: 0` means "it earned nothing". Rendering
// the first as the second is how a dashboard lies.
export const adWindowMetricsSchema = z
  .object({
    spend: z.number().nullable().optional(),
    impressions: z.number().nullable().optional(),
    reach: z.number().nullable().optional(),
    /** Impressions per person. Rising frequency + falling CTR = creative fatigue. */
    frequency: z.number().nullable().optional(),

    /**
     * ALL clicks. Meta counts likes, comments, shares and page clicks in here — not
     * only clicks to your site — so a "cheap click" can be a tapped reaction. Kept
     * because Meta's own headline CPC/CTR are computed on it; `linkClicks` is the
     * honest one. On a live account these read $3.58 vs $6.10 for the SAME ad.
     */
    clicks: z.number().nullable().optional(),
    /** Clicks that actually went to the destination (inline_link_clicks). */
    linkClicks: z.number().nullable().optional(),
    ctr: z.number().nullable().optional(),
    linkCtr: z.number().nullable().optional(),
    cpc: z.number().nullable().optional(),
    /** The cost of an actual visit. Usually materially higher than `cpc`. */
    costPerLinkClick: z.number().nullable().optional(),
    cpm: z.number().nullable().optional(),

    purchases: z.number().nullable().optional(),
    leads: z.number().nullable().optional(),
    revenue: z.number().nullable().optional(),
    roas: z.number().nullable().optional(),
    costPerPurchase: z.number().nullable().optional(),
    costPerLead: z.number().nullable().optional(),

    hookRate: z.number().nullable().optional(),
    holdRate: z.number().nullable().optional(),
    /** Of those who started the video, how many finished it. */
    completionRate: z.number().nullable().optional(),

    // Meta's own verdict on this creative against everything else bidding for the
    // same impression (BELOW_AVERAGE_10/20/35 | AVERAGE | ABOVE_AVERAGE). Ad-level
    // only, and not reconstructable from any math we can do — it is the platform
    // grading your creative against its competitors.
    qualityRanking: z.string().nullable().optional(),
    engagementRateRanking: z.string().nullable().optional(),
    conversionRateRanking: z.string().nullable().optional(),
  })
  .strip();
export type AdWindowMetrics = z.infer<typeof adWindowMetricsSchema>;

/** A Meta ranking that says the creative is losing its auction on quality. */
export const isUnderperformingRanking = (ranking: string | null | undefined): boolean =>
  typeof ranking === 'string' && ranking.startsWith('BELOW_AVERAGE');

export const deploymentAdSchema = z
  .object({
    adId: z.string(),
    adName: z.string().nullable().optional(),
    campaignName: z.string().nullable().optional(),
    adsetName: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    objective: z.string().nullable().optional(),
    verdict: z.enum(['kill', 'scale', 'iterate', 'watch']).nullable().optional(),
    verdictReason: z.string().nullable().optional(),
    verdictFlags: z.array(z.string()).default([]),
    funnelStage: z.string().nullable().optional(),
    // The shared 8-way taxonomy — the same vocabulary organic, competitor-spy and
    // the iteration briefs speak, so a version delta needs no translation layer.
    hookArchetype: z.string().nullable().optional(),
    window: z.string(),
    metrics: adWindowMetricsSchema,
    virality: PaidAdViralitySummarySchema.nullable().optional(),
    outcome: OptimizerDecisionOutcomeSummarySchema.nullable().optional(),
    attributionSetting: z.string().nullable().optional(),
  })
  .strip();
export type DeploymentAd = z.infer<typeof deploymentAdSchema>;

export const assetAdAttributionSchema = z.object({
  metrics: adWindowMetricsSchema,
  virality: PaidAdViralitySummarySchema.nullable(),
  outcome: OptimizerDecisionOutcomeSummarySchema.nullable(),
  attributionSetting: z.string().nullable(),
});
export const assetAdAttributionMapSchema = z.record(z.string(), assetAdAttributionSchema);
export type AssetAdAttributionMap = z.infer<typeof assetAdAttributionMapSchema>;

// Named for the DEPLOYMENT, not for organic: `organicPostMetricsSchema` already
// means something else in organic/metrics.ts, and two different shapes under one
// name made the contracts root export ambiguous — which breaks every consumer that
// imports from the root entry (the only style the Backend supports).
export const deploymentPostMetricsSchema = z
  .object({
    reach: z.number().nullable().optional(),
    views: z.number().nullable().optional(),
    likes: z.number().nullable().optional(),
    comments: z.number().nullable().optional(),
    shares: z.number().nullable().optional(),
    saved: z.number().nullable().optional(),
    totalInteractions: z.number().nullable().optional(),
    engagementRate: z.number().nullable().optional(),
    capturedDate: z.string().nullable().optional(),
  })
  .strip();
export type DeploymentPostMetrics = z.infer<typeof deploymentPostMetricsSchema>;

export const deploymentPostSchema = z
  .object({
    platformPostId: z.string(),
    platform: z.string(),
    postType: z.string().nullable().optional(),
    permalink: z.string().nullable().optional(),
    publishedAt: z.string().nullable().optional(),
    metrics: deploymentPostMetricsSchema,
  })
  .strip();
export type DeploymentPost = z.infer<typeof deploymentPostSchema>;

// One row of "where this creative ran". `ad` is present iff surface==='meta_ad',
// `post` iff surface==='organic_post'.
export const assetDeploymentSchema = z
  .object({
    deploymentId: z.string(),
    surface: deploymentSurfaceSchema,
    // null = the link could not determine the version (see unknown_version).
    versionNumber: z.number().int().positive().nullable().optional(),
    linkMethod: deploymentLinkMethodSchema,
    confidence: z.number().min(0).max(1),
    linkedAt: z.string(),
    ad: deploymentAdSchema.nullable().optional(),
    post: deploymentPostSchema.nullable().optional(),
  })
  .strip();
export type AssetDeployment = z.infer<typeof assetDeploymentSchema>;

// ---------------------------------------------------------------------------
// Per-version rollup — "which version is winning"
// ---------------------------------------------------------------------------
export const assetVersionRollupSchema = z
  .object({
    versionNumber: z.number().int().positive().nullable().optional(),
    adCount: z.number().int().nonnegative().default(0),
    postCount: z.number().int().nonnegative().default(0),
    spend: z.number().default(0),
    impressions: z.number().default(0),
    clicks: z.number().default(0),
    ctr: z.number().nullable().optional(),
    purchases: z.number().default(0),
    leads: z.number().default(0),
    revenue: z.number().default(0),
    roas: z.number().nullable().optional(),
    costPerPurchase: z.number().nullable().optional(),
    costPerLead: z.number().nullable().optional(),
    organicReach: z.number().default(0),
    organicInteractions: z.number().default(0),
    // e.g. { kill: 2, scale: 1 } — how the ads running this version were judged.
    verdictMix: z.record(z.string(), z.number()).default({}),
    trustFlags: z.array(deploymentTrustFlagSchema).default([]),
  })
  .strip();
export type AssetVersionRollup = z.infer<typeof assetVersionRollupSchema>;

// The wire shape of public.media_get_asset_performance.
export const assetPerformanceSchema = z
  .object({
    assetId: z.string(),
    window: paidMetricWindowSchema,
    deployments: z.array(assetDeploymentSchema).default([]),
    versionRollups: z.array(assetVersionRollupSchema).default([]),
    // Filled in by the reader from the cache, not by the RPC.
    insight: z.string().nullable().optional(),
  })
  .strip();
export type AssetPerformance = z.infer<typeof assetPerformanceSchema>;

// ---------------------------------------------------------------------------
// "Used in" — the non-performance half: assets generated FROM this asset.
// ---------------------------------------------------------------------------
export const derivedAssetSchema = z
  .object({
    assetId: z.string(),
    fileName: z.string(),
    title: z.string().nullable().optional(),
    kind: z.string(),
    source: z.string(),
    createdAt: z.string(),
    // Exact graph metadata. Legacy JSON-only relations may not have version IDs,
    // but normalized lineage always does. `depth` makes transitive descendants
    // visible without flattening them into immediate children.
    depth: z.number().int().positive().default(1),
    operation: z.string().nullable().optional(),
    sourceVersionId: z.string().nullable().optional(),
    derivedVersionId: z.string().nullable().optional(),
  })
  .strip();
export type DerivedAsset = z.infer<typeof derivedAssetSchema>;

export const assetUsageSchema = z
  .object({
    derivedAssets: z.array(derivedAssetSchema).default([]),
  })
  .strip();
export type AssetUsage = z.infer<typeof assetUsageSchema>;

// ---------------------------------------------------------------------------
// Writer input (server-side only — the ledger is never written from a client).
// ---------------------------------------------------------------------------

/**
 * Which Continuum surface DECIDED a deployment.
 *
 * Absent is a real answer, not a missing one: a matcher or an importer discovers a link
 * after the fact, and "we found this" must stay distinguishable from "we did this".
 * Polymorphic — the id lives in a different table per kind — which is why the pair is
 * validated here rather than carried by a foreign key.
 */
export const deploymentProducerKindSchema = z.enum([
  'creative_swap_job',
  'api_render_job',
  'canvas_replacement',
]);
export type DeploymentProducerKind = z.infer<typeof deploymentProducerKindSchema>;

export const recordDeploymentInputSchema = z
  .object({
    brandId: z.string().min(1),
    assetId: z.string().min(1),
    versionNumber: z.number().int().positive().nullable().optional(),
    surface: deploymentSurfaceSchema,
    creativeRowId: z.string().min(1).nullable().optional(),
    adId: z.string().min(1).nullable().optional(),
    platformPostId: z.string().min(1).nullable().optional(),
    platform: z.string().min(1).nullable().optional(),
    linkMethod: deploymentLinkMethodSchema,
    confidence: z.number().min(0).max(1).default(1),
    createdBy: z.string().min(1).nullable().optional(),
    producerKind: deploymentProducerKindSchema.nullable().optional(),
    producerId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    // Mirrors the asset_deployments_surface_refs CHECK: a row points at exactly
    // one surface's refs. Catching it here turns a 23514 from Postgres into a
    // readable error at the boundary.
    if (input.surface === 'meta_ad' && !input.creativeRowId) {
      ctx.addIssue({
        code: 'custom',
        path: ['creativeRowId'],
        message: 'creativeRowId is required for a meta_ad deployment',
      });
    }
    if (input.surface === 'organic_post' && !input.platformPostId) {
      ctx.addIssue({
        code: 'custom',
        path: ['platformPostId'],
        message: 'platformPostId is required for an organic_post deployment',
      });
    }
    // Mirrors asset_deployments_producer_pair_chk. The pair moves together or not at
    // all: a kind with no id names a decision nobody can look up, and an id with no
    // kind names a row in an unknown table. Either half alone is unjoinable, which is
    // the one thing this column exists to prevent.
    const hasKind = input.producerKind != null;
    const hasId = input.producerId != null;
    if (hasKind !== hasId) {
      ctx.addIssue({
        code: 'custom',
        path: [hasKind ? 'producerId' : 'producerKind'],
        message: 'producerKind and producerId must be supplied together, or not at all',
      });
    }
  });
export type RecordDeploymentInput = z.infer<typeof recordDeploymentInputSchema>;
