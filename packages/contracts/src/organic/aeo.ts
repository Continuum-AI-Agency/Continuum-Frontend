import { z } from "zod";

export const aeoSentimentSchema = z.enum(["positive", "neutral", "negative", "mixed", "unknown"]);
export type AeoSentiment = z.infer<typeof aeoSentimentSchema>;

export const aeoOpportunityTypeSchema = z.enum([
  "owned_content",
  "organic_post",
  "faq",
  "comparison",
  "third_party",
  "brand_fact",
]);
export type AeoOpportunityType = z.infer<typeof aeoOpportunityTypeSchema>;

export const aeoCitationSchema = z.object({
  url: z.string().url(),
  domain: z.string().min(1),
  title: z.string().nullable().optional(),
  sourceType: z.enum(["owned", "competitor", "third_party", "social", "unknown"]).default("unknown"),
});
export type AeoCitation = z.infer<typeof aeoCitationSchema>;

export const aeoPromptResultSchema = z.object({
  prompt: z.string().min(1),
  engine: z.string().min(1),
  answer: z.string().min(1),
  brandMentioned: z.boolean(),
  brandPosition: z.number().int().positive().nullable().default(null),
  sentiment: aeoSentimentSchema,
  competitorsMentioned: z.array(z.string()).default([]),
  narrativeThemes: z.array(z.string()).default([]),
  citations: z.array(aeoCitationSchema).default([]),
});
export type AeoPromptResult = z.infer<typeof aeoPromptResultSchema>;

export const aeoOpportunitySchema = z.object({
  id: z.string().min(1).optional(),
  type: aeoOpportunityTypeSchema,
  priority: z.enum(["high", "medium", "low"]),
  title: z.string().min(1),
  rationale: z.string().min(1),
  suggestedAction: z.string().min(1),
  handoffTarget: z.enum(["agent_prompt", "draft_post", "faq_brief", "comparison_brief"]).default("agent_prompt"),
  sourcePrompts: z.array(z.string()).default([]),
});
export type AeoOpportunity = z.infer<typeof aeoOpportunitySchema>;

export const aeoSnapshotCardSchema = z.object({
  snapshotId: z.string().min(1),
  brandId: z.string().min(1),
  brandName: z.string().min(1),
  status: z.enum(["completed", "failed"]),
  generatedAt: z.string().min(1),
  engine: z.string().min(1),
  promptCount: z.number().int().nonnegative(),
  visibilityScore: z.number().min(0).max(100),
  shareOfVoice: z.number().min(0).max(100),
  sentimentSummary: z.object({
    positive: z.number().int().nonnegative().default(0),
    neutral: z.number().int().nonnegative().default(0),
    negative: z.number().int().nonnegative().default(0),
    mixed: z.number().int().nonnegative().default(0),
  }),
  topNarratives: z.array(z.string()).default([]),
  missingTopics: z.array(z.string()).default([]),
  competitors: z.array(z.object({
    name: z.string().min(1),
    mentions: z.number().int().nonnegative(),
  })).default([]),
  citations: z.array(aeoCitationSchema).default([]),
  opportunities: z.array(aeoOpportunitySchema).default([]),
});
export type AeoSnapshotCard = z.infer<typeof aeoSnapshotCardSchema>;

export const runAeoSnapshotRequestSchema = z.object({
  brandId: z.string().uuid(),
  promptLimit: z.number().int().min(5).max(50).default(24),
  engine: z.string().min(1).default("simulated_answer_engine"),
});
export type RunAeoSnapshotRequest = z.infer<typeof runAeoSnapshotRequestSchema>;

export const runAeoSnapshotResponseSchema = z.object({
  snapshot: aeoSnapshotCardSchema,
  promptResults: z.array(aeoPromptResultSchema),
});
export type RunAeoSnapshotResponse = z.infer<typeof runAeoSnapshotResponseSchema>;
