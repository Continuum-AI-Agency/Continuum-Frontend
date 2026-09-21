// Creative-sentiment analysis for competitor paid ads. Produced Backend-side by
// a Vertex Gemini `generateObject` call over the ad copy + (when available) the
// extracted creative image, and persisted to competitor_ad_spy.ad_snapshots.analysis.
// Parallel to — not a mutation of — the media library's adCreativeAnalysisSchema
// (media/asset.ts): the media library indexes the brand's OWN creatives; this
// indexes competitors', and adds the sentiment/hook/theme fields that schema lacks.
// Plain objects (not .strict()) so an LLM adding an extra key does not fail parse.

import { z } from 'zod';
import {
  creativeAssetTypeSchema,
  creativeFunnelStageSchema,
  creativeHookArchetypeSchema,
} from '../creative-strategy/taxonomy';

export const competitorAdSentimentLabelSchema = z.enum([
  'positive',
  'neutral',
  'negative',
  'aspirational',
  'urgent',
]);
export type CompetitorAdSentimentLabel = z.infer<typeof competitorAdSentimentLabelSchema>;

// The hook-archetype vocabulary lives in the shared cross-side taxonomy
// (creative-strategy/taxonomy.ts); re-exported under the historical name so
// existing consumers keep compiling.
export const competitorAdHookArchetypeSchema = creativeHookArchetypeSchema;
export type CompetitorAdHookArchetype = z.infer<typeof competitorAdHookArchetypeSchema>;

export const competitorAdSentimentSchema = z.object({
  sentiment: competitorAdSentimentLabelSchema,
  sentimentScore: z.number().min(-1).max(1),
  hook: z.string().nullable(),
  hookArchetype: competitorAdHookArchetypeSchema.nullable(),
  primaryTheme: z.string().nullable(),
  themes: z.array(z.string()).max(8).default([]),
  brandElements: z.array(z.string()).default([]),
  valueProps: z.array(z.string()).default([]),
  copyTone: z.array(z.string()).max(6).default([]),
  visualStyle: z.string().nullable(),
  targetAudienceSignal: z.string().nullable(),
});
export type CompetitorAdSentiment = z.infer<typeof competitorAdSentimentSchema>;

export const competitorAdAnalysisSchema = competitorAdSentimentSchema.extend({
  isAd: z.boolean().default(true),
  format: z.string().nullable(),
  headline: z.string().nullable(),
  primaryText: z.string().nullable(),
  callToAction: z.string().nullable(),
  textOverlay: z.string().nullable(),
  // Taxonomy v2: the strategic angle / funnel stage / asset type, on the SAME
  // vocabulary as the brand's own paid labels (creative-strategy/taxonomy.ts)
  // so the gap analysis can join the two sides. v1 rows lack these — defaults
  // keep old persisted analyses parsing; aggregations that need them filter on
  // taxonomyVersion >= 2.
  angle: z.string().nullable().default(null),
  funnelStage: creativeFunnelStageSchema.default('unknown'),
  assetType: creativeAssetTypeSchema.default('unknown'),
  taxonomyVersion: z.number().int().default(1),
  // Whether the analysis saw the actual creative image (true) or degraded to
  // copy-only because media extraction failed/was skipped (false).
  analyzedFromImage: z.boolean().default(false),
});
export type CompetitorAdAnalysis = z.infer<typeof competitorAdAnalysisSchema>;

// ── Organic competitor post analysis ─────────────────────────────────────────
// Produced Backend-side by the creative describer (trends/competitors/
// creativeDescribers.ts) over one competitor Instagram post, persisted on
// brand_trends.raw_signals metadata.creative_analysis, and rendered by the
// Inspiration tile (Transcript / Hook / Visuals / Idea). The description and idea
// schemas are also Gemini response schemas, so: no unions, no numeric enums, and
// string/array bounds are prompt hints only (Gemini enforces neither maxLength nor
// maxItems — docs/harness-engineering-playbook.md §6).

export const competitorPostImageDescriptionSchema = z.object({
  scene: z.string().describe('One sentence describing the visual scene.'),
  subjects: z.array(z.string()).max(8).describe('Key subjects or objects visible.'),
  on_screen_text: z.string().nullable().describe('Any visible on-image text, or null.'),
  color_palette: z.array(z.string()).max(6).describe('Dominant colors as descriptive words.'),
  mood: z.string().describe('Emotional tone of the image in 1-3 words.'),
  visual_hook: z.string().describe('What grabs attention first; the visual hook.'),
});
export type CompetitorPostImageDescription = z.infer<typeof competitorPostImageDescriptionSchema>;

export const competitorPostVideoDescriptionSchema = z.object({
  transcript: z
    .string()
    .describe('Best-effort transcript of any spoken audio. Empty string if none.'),
  scene_beats: z
    .array(
      z.object({
        t_seconds: z.number().min(0).describe('Timestamp in seconds of this beat.'),
        description: z.string().describe('What happens at this moment.'),
      }),
    )
    .max(12)
    .describe('Key scene beats in time order.'),
  hook_first_3s: z.string().describe('What happens in the first 3 seconds (the hook).'),
  audio_kind: z.enum(['voiceover', 'dialogue', 'music_only', 'ambient', 'silent', 'unknown']),
  format: z
    .enum([
      'talking_head',
      'ugc_pov',
      'edited_montage',
      'tutorial',
      'skit',
      'product_demo',
      'trend_remix',
      'split_screen',
      'prop',
      'other',
    ])
    .describe('Best-fit creator format.'),
  visual_hook: z.string().describe('Visual element that grabs attention.'),
});
export type CompetitorPostVideoDescription = z.infer<typeof competitorPostVideoDescriptionSchema>;

export const competitorPostCarouselDescriptionSchema = z.object({
  slide_count: z.number().int().min(1),
  slide_summaries: z.array(z.string()).max(10).describe('Per-slide summary in slide order.'),
  narrative_arc: z.string().describe('How the carousel tells a story across slides.'),
  visual_hook: z.string().describe('What hooks the viewer on slide 1.'),
});
export type CompetitorPostCarouselDescription = z.infer<
  typeof competitorPostCarouselDescriptionSchema
>;

// The Idea block: what the post ARGUES, not what it shows. Generated by a second,
// text-only pass over the description above plus the caption, so it never
// re-fetches media. The .min(1) bounds never reach Gemini; they make an empty
// answer fail validation here, where it is recorded as idea_error, instead of
// persisting a blank Idea tab.
export const competitorPostIdeaSchema = z.object({
  topic: z.string().min(1).describe('What the post is about, in 2-6 words.'),
  industry: z.string().min(1).describe('The industry or niche, in 1-4 words.'),
  ideaSeed: z
    .string()
    .min(1)
    .describe('The core idea in one sentence, the way a creator would pitch it.'),
  uniqueAngle: z
    .string()
    .min(1)
    .describe('What makes this take different from the obvious post on the topic, one sentence.'),
  commonBeliefChallenged: z
    .string()
    .min(1)
    .describe(
      'The widely held belief or default assumption the post pushes against, one sentence.',
    ),
  contrarianReality: z
    .string()
    .min(1)
    .describe('What the post argues is actually true instead, one sentence.'),
  supportingEvidence: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      '1-4 concrete proof points the post itself uses (a number, demo, result, testimonial, before/after), one sentence each.',
    ),
});
export type CompetitorPostIdea = z.infer<typeof competitorPostIdeaSchema>;

export const competitorPostAnalysisKindSchema = z.enum([
  'image',
  'video',
  'carousel',
  'skipped',
  'failed',
]);
export type CompetitorPostAnalysisKind = z.infer<typeof competitorPostAnalysisKindSchema>;

// Exactly one of image / video / carousel is set when kind names it; skipped and
// failed carry skip_reason / error instead. A flat object, not a discriminated
// union, because rows written before the Idea block existed must keep parsing.
export const competitorPostAnalysisSchema = z.object({
  kind: competitorPostAnalysisKindSchema,
  image: competitorPostImageDescriptionSchema.optional(),
  video: competitorPostVideoDescriptionSchema.optional(),
  carousel: competitorPostCarouselDescriptionSchema.optional(),
  idea: competitorPostIdeaSchema.optional(),
  idea_error: z.string().optional(),
  skip_reason: z.string().optional(),
  error: z.string().optional(),
  model: z.string(),
  duration_ms: z.number(),
});
export type CompetitorPostAnalysis = z.infer<typeof competitorPostAnalysisSchema>;

/** True when the describer actually described the post; skipped and failed envelopes are not analyses. */
export function isDescribedCompetitorPostAnalysis(
  analysis: { kind?: unknown } | null | undefined,
): boolean {
  return analysis?.kind === 'image' || analysis?.kind === 'video' || analysis?.kind === 'carousel';
}
