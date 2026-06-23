import { z } from "zod";

// ---------------------------------------------------------------------------
// T2 "deep" enrichment lane — the strategic analysis folded into the canonical
// brand report. Filled asynchronously after onboarding (and on demand) by the
// durable deep-analysis job, then merged into `brand_report_composites.composite`
// under the `deep` key. Every sub-section is nullable + defaults null so a
// partial fill parses and a legacy composite carries `deep: null` until the
// first deep pass lands. Canonical here so the Backend (produce/merge) and the
// Frontend (Brand Book render) share one shape.
// ---------------------------------------------------------------------------

export const deepStrategicNarrativeSchema = z.object({
  mission: z.array(z.string()).default([]),
  vision: z.array(z.string()).default([]),
  core_values: z.array(z.string()).default([]),
});
export type DeepStrategicNarrative = z.infer<typeof deepStrategicNarrativeSchema>;

export const deepMessagingSystemSchema = z.object({
  summary: z.string().nullable().default(null),
  positioning: z.string().nullable().default(null),
  differentiators: z.array(z.string()).default([]),
  audience_needs: z.array(z.string()).default([]),
  opportunities: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  go_to_market_ideas: z.array(z.string()).default([]),
});
export type DeepMessagingSystem = z.infer<typeof deepMessagingSystemSchema>;

export const deepProductSchema = z.object({
  product_name: z.string().nullable().default(null),
  product_description: z.string().nullable().default(null),
  product_features: z.array(z.string()).default([]),
  product_benefits: z.array(z.string()).default([]),
  product_pricing: z.string().nullable().default(null),
  product_cta: z.string().nullable().default(null),
});
export type DeepProduct = z.infer<typeof deepProductSchema>;

export const deepPersonaSchema = z.object({
  name: z.string(),
  description: z.string().nullable().default(null),
  psychographics: z.array(z.string()).default([]),
  motivations: z.array(z.string()).default([]),
  barriers: z.array(z.string()).default([]),
  messaging: z.array(z.string()).default([]),
});
export type DeepPersona = z.infer<typeof deepPersonaSchema>;

export const deepPersonasSchema = z.object({
  summary: z.string().nullable().default(null),
  segments: z.array(deepPersonaSchema).default([]),
  content_preferences: z.array(z.string()).default([]),
  emotional_drivers: z.array(z.string()).default([]),
  influencer_archetypes: z.array(z.string()).default([]),
});
export type DeepPersonas = z.infer<typeof deepPersonasSchema>;

// Competitor URLs come from an LLM and are display/grounding data, not a system
// boundary — kept a tolerant string (not httpUrlSchema) so a near-miss URL never
// rejects the whole deep object.
export const deepCompetitorSchema = z.object({
  name: z.string(),
  strategy_summary: z.string().nullable().default(null),
  key_messaging: z.string().nullable().default(null),
  url: z.string().nullable().default(null),
});
export type DeepCompetitor = z.infer<typeof deepCompetitorSchema>;

export const deepCompetitiveFrameSchema = z.object({
  top_competitors: z.array(deepCompetitorSchema).default([]),
  insights: z.string().nullable().default(null),
  recommendations: z.string().nullable().default(null),
});
export type DeepCompetitiveFrame = z.infer<typeof deepCompetitiveFrameSchema>;

export const brandDeepSchema = z.object({
  strategic_narrative: deepStrategicNarrativeSchema.nullable().default(null),
  messaging_system: deepMessagingSystemSchema.nullable().default(null),
  product: deepProductSchema.nullable().default(null),
  deep_personas: deepPersonasSchema.nullable().default(null),
  competitive_frame: deepCompetitiveFrameSchema.nullable().default(null),
  generated_at: z.string().nullable().default(null),
  model: z.string().nullable().default(null),
});
export type BrandDeep = z.infer<typeof brandDeepSchema>;

// ---------------------------------------------------------------------------
// Mapper: Backend strategicBrandAnalysisSchema *output* -> canonical BrandDeep.
//
// Defined here (not on the Backend) so the canonical shape and its projection
// live together. Accepts `unknown` and parses through a lenient input schema
// that mirrors only the meaningful fields of the agent output, dropping the
// experimental `extra_*` buckets the generation schema carries.
// ---------------------------------------------------------------------------
const strategicAnalysisInputSchema = z
  .object({
    mission: z.array(z.string()).optional(),
    vision: z.array(z.string()).optional(),
    core_values: z.array(z.string()).optional(),
    product_market_fit: z
      .object({
        summary: z.string().nullable().optional(),
        positioning: z.string().nullable().optional(),
        differentiators: z.array(z.string()).optional(),
        audience_needs: z.array(z.string()).optional(),
        opportunities: z.array(z.string()).optional(),
        risks: z.array(z.string()).optional(),
        recommendations: z.array(z.string()).optional(),
        go_to_market_ideas: z.array(z.string()).optional(),
      })
      .loose()
      .nullable()
      .optional(),
    product_summary: z
      .object({
        product_name: z.string().nullable().optional(),
        product_description: z.string().nullable().optional(),
        product_features: z.array(z.string()).nullable().optional(),
        product_benefits: z.array(z.string()).nullable().optional(),
        product_pricing: z.string().nullable().optional(),
        product_cta: z.string().nullable().optional(),
      })
      .loose()
      .nullable()
      .optional(),
    audience_profile: z
      .object({
        summary: z.string().nullable().optional(),
        segments: z
          .array(
            z
              .object({
                name: z.string(),
                description: z.string().nullable().optional(),
                psychographics: z.array(z.string()).optional(),
                motivations: z.array(z.string()).optional(),
                barriers: z.array(z.string()).optional(),
                messaging: z.array(z.string()).optional(),
              })
              .loose(),
          )
          .optional(),
        content_preferences: z.array(z.string()).optional(),
        emotional_drivers: z.array(z.string()).optional(),
        influencer_archetypes: z.array(z.string()).optional(),
      })
      .loose()
      .nullable()
      .optional(),
    competitive_landscape: z
      .object({
        top_competitors: z
          .array(
            z
              .object({
                name: z.string(),
                strategy_summary: z.string().nullable().optional(),
                key_messaging: z.string().nullable().optional(),
                url: z.string().nullable().optional(),
              })
              .loose(),
          )
          .optional(),
        insights: z.string().nullable().optional(),
        recommendations: z.string().nullable().optional(),
      })
      .loose()
      .nullable()
      .optional(),
  })
  .loose();

export type StrategicAnalysisInput = z.input<typeof strategicAnalysisInputSchema>;

export function toBrandDeep(
  input: unknown,
  opts?: { generatedAt?: string; model?: string },
): BrandDeep {
  const s = strategicAnalysisInputSchema.parse(input);
  const pmf = s.product_market_fit;
  const prod = s.product_summary;
  const aud = s.audience_profile;
  const comp = s.competitive_landscape;

  return brandDeepSchema.parse({
    strategic_narrative: {
      mission: s.mission ?? [],
      vision: s.vision ?? [],
      core_values: s.core_values ?? [],
    },
    messaging_system: pmf
      ? {
          summary: pmf.summary ?? null,
          positioning: pmf.positioning ?? null,
          differentiators: pmf.differentiators ?? [],
          audience_needs: pmf.audience_needs ?? [],
          opportunities: pmf.opportunities ?? [],
          risks: pmf.risks ?? [],
          recommendations: pmf.recommendations ?? [],
          go_to_market_ideas: pmf.go_to_market_ideas ?? [],
        }
      : null,
    product: prod
      ? {
          product_name: prod.product_name ?? null,
          product_description: prod.product_description ?? null,
          product_features: prod.product_features ?? [],
          product_benefits: prod.product_benefits ?? [],
          product_pricing: prod.product_pricing ?? null,
          product_cta: prod.product_cta ?? null,
        }
      : null,
    deep_personas: aud
      ? {
          summary: aud.summary ?? null,
          segments: (aud.segments ?? []).map((seg) => ({
            name: seg.name,
            description: seg.description ?? null,
            psychographics: seg.psychographics ?? [],
            motivations: seg.motivations ?? [],
            barriers: seg.barriers ?? [],
            messaging: seg.messaging ?? [],
          })),
          content_preferences: aud.content_preferences ?? [],
          emotional_drivers: aud.emotional_drivers ?? [],
          influencer_archetypes: aud.influencer_archetypes ?? [],
        }
      : null,
    competitive_frame: comp
      ? {
          top_competitors: (comp.top_competitors ?? []).map((c) => ({
            name: c.name,
            strategy_summary: c.strategy_summary ?? null,
            key_messaging: c.key_messaging ?? null,
            url: c.url ?? null,
          })),
          insights: comp.insights ?? null,
          recommendations: comp.recommendations ?? null,
        }
      : null,
    generated_at: opts?.generatedAt ?? null,
    model: opts?.model ?? null,
  });
}
