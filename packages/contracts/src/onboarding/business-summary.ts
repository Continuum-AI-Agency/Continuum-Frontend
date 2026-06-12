import { z } from "zod";

const stripEmojis = (value: string): string =>
  value
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F3FB}-\u{1F3FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      "",
    )
    .trim();

const normalizeBusinessCta = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const firstNonEmpty = value.find(
      (item) => typeof item === "string" && item.trim().length > 0,
    );
    if (firstNonEmpty) return normalizeBusinessCta(firstNonEmpty);
    return null;
  }
  if (typeof value === "string") {
    const stripped = stripEmojis(value);
    return stripped.length > 0 ? stripped : null;
  }
  return value;
};

const businessCtaSchema = z
  .preprocess(normalizeBusinessCta, z.string().max(180).nullable())
  .optional();

export const businessSummarySchema = z.object({
  business_name: z.string().max(240),
  business_description: z.string().max(600),
  business_features: z.array(z.string().max(330)).max(15).default([]),
  business_benefits: z.array(z.string().max(330)).max(15).default([]),
  competitor_names: z.array(z.string().min(1).max(120)).max(8).default([]),
  business_cta: businessCtaSchema,
  // Positioning depth — what makes this brand distinct from named alternatives.
  // Each entry should reference an actual competitor or category from RAG/scrape.
  differentiators: z.array(z.string().max(420)).max(6).nullable().optional(),
  // Secondary CTAs keyed implicitly by audience segment (sales-led vs self-serve
  // vs newsletter). Primary CTA stays on `business_cta`.
  alt_ctas: z.array(z.string().min(2).max(120)).max(5).nullable().optional(),
});
export type BusinessSummary = z.infer<typeof businessSummarySchema>;
