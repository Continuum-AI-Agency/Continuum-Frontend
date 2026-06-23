import { z } from "zod";

// First-class brand strategy — the structured positioning/personality/promise/
// pillars/taglines the onboarding agent synthesizes and every downstream surface
// grounds on. Bounds mirror readinessAnalysisSchema rigor (the model sees these
// as responseSchema maxLengths; the backend coerces runaways). Plain z.object
// (strip unknown keys, like readinessAnalysisSchema) — safe for LLM output and
// the typed persistence boundary, never rejecting on an improvised extra key.

export const brandPositioningSchema = z.object({
  target_customer: z.string().min(1).max(240),
  market_category: z.string().min(1).max(180),
  key_differentiator: z.string().min(1).max(300),
  reason_to_believe: z.string().min(1).max(420),
  // Optional one-line "For X, brand is the Y that Z, unlike W" statement.
  statement: z.string().max(420).nullable().optional(),
});
export type BrandPositioning = z.infer<typeof brandPositioningSchema>;

export const brandPersonalitySchema = z.object({
  traits: z.array(z.string().min(1).max(60)).min(3).max(6),
  archetype: z.string().max(120).nullable().optional(),
  descriptors: z.array(z.string().min(1).max(90)).max(10).default([]),
});
export type BrandPersonality = z.infer<typeof brandPersonalitySchema>;

export const brandPromiseSchema = z.object({
  headline: z.string().min(1).max(240),
  rationale: z.string().max(420).nullable().optional(),
});
export type BrandPromise = z.infer<typeof brandPromiseSchema>;

export const messagePillarSchema = z.object({
  pillar: z.string().min(1).max(120),
  description: z.string().min(1).max(420),
  proof_points: z.array(z.string().min(1).max(240)).max(6).default([]),
});
export type MessagePillar = z.infer<typeof messagePillarSchema>;

export const brandTaglinesSchema = z.object({
  primary: z.string().min(1).max(160),
  alternates: z.array(z.string().min(1).max(160)).max(6).default([]),
});
export type BrandTaglines = z.infer<typeof brandTaglinesSchema>;

export const brandStrategySchema = z.object({
  positioning: brandPositioningSchema,
  personality: brandPersonalitySchema,
  promise: brandPromiseSchema,
  value_proposition: z.string().max(600).nullable().optional(),
  message_pillars: z.array(messagePillarSchema).min(2).max(5),
  taglines: brandTaglinesSchema,
});
export type BrandStrategy = z.infer<typeof brandStrategySchema>;
