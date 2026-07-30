// The paid-media ad brief — the Meta-ad-shaped input the creative sub-agent turns
// into a video ad. This REPLACES the organic placement/schedule seam: where the
// organic harness is driven by a posting placement, the paid path is driven by an
// ad objective + funnel stage + adset/audience context. The sub-agent maps this
// brief onto the reused organic generation spine (buildPaidAdBrief → CreativeBrief).
//
// Loose object (not .strict()): this is an input DTO an agent may populate, and an
// extra key should never fail parse — same rule as creative-strategy/virality.

import { z } from 'zod';

// Where in the funnel this ad plays — drives angle, hook posture, and which
// win-rate slice grounds the generation (prospecting vs retargeting vs retention).
// Named paidAd* (not paidFunnelStage*) to avoid colliding with creative-strategy's
// analytical `paidFunnelStageSchema` (tof/mof/bof/unknown) — this is the distinct
// audience-temperature funnel a paid ad is targeted at.
export const paidAdFunnelStageSchema = z.enum(['prospecting', 'retargeting', 'retention']);
export type PaidAdFunnelStage = z.infer<typeof paidAdFunnelStageSchema>;

// The creative format to produce. 'reel' is the default and reuses the reel/Veo
// scene spine; 'video' is the same spine as a single video ad; 'image' is a static;
// 'carousel' is N slides through the organic carousel spine.
//
// This is the PAID/Meta vocabulary, deliberately — 'image' is what Meta calls a
// static ad, and `PAID_FORMAT_TO_ORGANIC_FORMAT` already maps it to organic's
// 'post'. Adding a second name for the same concept is exactly the drift the
// contracts package exists to prevent, so there is no 'post' member here.
export const paidAdFormatSchema = z.enum(['reel', 'video', 'image', 'carousel']);
export type PaidAdFormat = z.infer<typeof paidAdFormatSchema>;

/**
 * The generation spine each format runs through. Every consumer that has to branch
 * on format — the placement builder, the orchestrator's stage matrix, the chat
 * artifact frame — reads this instead of re-deriving `format === 'reel' || format
 * === 'video'` and drifting the day a fifth format lands.
 */
export const PAID_FORMAT_MEDIA_KIND = {
  reel: 'video',
  video: 'video',
  image: 'static',
  carousel: 'carousel',
} as const satisfies Record<PaidAdFormat, 'video' | 'static' | 'carousel'>;

export type PaidFormatMediaKind = (typeof PAID_FORMAT_MEDIA_KIND)[PaidAdFormat];

/**
 * Meta caps a carousel ad at 10 cards. Organic's `CarouselBlueprintOutputSchema`
 * allows 12 — generating 11 or 12 would burn image spend on slides that can never
 * ship, so paid clamps tighter than its own spine. Min 2 because a one-slide
 * carousel is a static post and should be built as `format: 'image'`.
 */
export const PAID_CAROUSEL_SLIDE_BOUNDS = { min: 2, max: 10 } as const;

export const paidAdBriefSchema = z.object({
  brandId: z.string().min(1),
  // Optional Meta targets the ad is destined for. Null in Phase 1 (generate + tag
  // ad-ready only); the optimizer resolves/confirms these at Phase-2 launch.
  campaignId: z.string().nullable().default(null),
  adsetId: z.string().nullable().default(null),
  // Meta campaign objective (e.g. OUTCOME_SALES). Kept a loose string — the Meta
  // objective vocabulary drifts and the optimizer owns the authoritative value.
  objective: z.string().min(1),
  funnelStage: paidAdFunnelStageSchema,
  // Freeform description of who this ad set targets — audience/targeting context
  // that grounds copy and hook, without coupling to a Meta targeting spec here.
  audienceContext: z.string().default(''),
  // The strategic angle and the scroll-stopping opener. These seed generation and
  // the hook is what the virality gate scores before anything is tagged ad-ready.
  angle: z.string().min(1),
  hook: z.string().min(1),
  format: paidAdFormatSchema.default('reel'),
  destinationUrl: z.string().nullable().default(null),
  cta: z.string().nullable().default(null),
  // Provenance: set when this brief promotes an existing winning organic creative
  // rather than generating net-new. Carries the source media.assets id so the
  // sub-agent reuses that asset row instead of regenerating.
  sourceOrganicAssetId: z.string().nullable().default(null),
});
export type PaidAdBrief = z.infer<typeof paidAdBriefSchema>;
