import { z } from "zod";

export const dashboardActionTargetSchema = z.enum(["organic_metrics", "organic_planner", "scale_performance", "scale_optimizer", "competitor_spy"]);
export type DashboardActionTarget = z.infer<typeof dashboardActionTargetSchema>;
export const dashboardBlockKindSchema = z.enum(["performance_insight", "organic_breakout", "optimizer_recommendation", "competitor_breakout", "trend_opportunity", "quiet_day"]);
export type DashboardBlockKind = z.infer<typeof dashboardBlockKindSchema>;
export const dashboardDomainSchema = z.enum(["paid", "organic", "optimizer", "competitor", "trends", "system"]);
export type DashboardDomain = z.infer<typeof dashboardDomainSchema>;
export const dashboardAttentionBandSchema = z.enum(["critical", "high", "medium", "low"]);
const evidenceSchema = z.object({ label: z.string().min(1).max(120), value: z.string().min(1).max(240) });
const dashboardBlockBaseSchema = z.object({
  id: z.string().min(1).max(200), slot: z.enum(["hero", "support_1", "support_2", "support_3", "support_4"]), domain: dashboardDomainSchema,
  title: z.string().min(1).max(120), summary: z.string().min(1).max(500), whyShown: z.string().min(1).max(240), attentionScore: z.number().finite().min(0).max(100), attentionBand: dashboardAttentionBandSchema,
  sourceTimestamp: z.string().datetime({ offset: true }), provenance: z.string().min(1).max(120), actionTarget: dashboardActionTargetSchema,
  evidence: z.array(evidenceSchema).min(1).max(3), entityId: z.string().min(1).max(200).optional(), thumbnailUrl: z.string().url().optional(),
});
export const dailyDashboardBlockSchema = z.discriminatedUnion("kind", [
  dashboardBlockBaseSchema.extend({ kind: z.literal("performance_insight"), domain: z.literal("paid") }),
  dashboardBlockBaseSchema.extend({ kind: z.literal("organic_breakout"), domain: z.literal("organic") }),
  dashboardBlockBaseSchema.extend({ kind: z.literal("optimizer_recommendation"), domain: z.literal("optimizer") }),
  dashboardBlockBaseSchema.extend({ kind: z.literal("competitor_breakout"), domain: z.literal("competitor") }),
  dashboardBlockBaseSchema.extend({ kind: z.literal("trend_opportunity"), domain: z.literal("trends") }),
  dashboardBlockBaseSchema.extend({ kind: z.literal("quiet_day"), domain: z.literal("system") }),
]);
export type DailyDashboardBlock = z.infer<typeof dailyDashboardBlockSchema>;
export const dashboardSelectionPlanSchema = z.object({ candidateIds: z.array(z.string().min(1)).max(5), placements: z.array(z.object({ candidateId: z.string().min(1), slot: z.enum(["hero", "support_1", "support_2", "support_3", "support_4"]) })).max(5) }).superRefine((plan, context) => {
  if (new Set(plan.candidateIds).size !== plan.candidateIds.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Candidate IDs must be unique" });
  if (new Set(plan.placements.map((placement) => placement.candidateId)).size !== plan.placements.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Candidates may only occupy one slot" });
  if (new Set(plan.placements.map((placement) => placement.slot)).size !== plan.placements.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Slots must be unique" });
  if (!plan.placements.every((placement) => plan.candidateIds.includes(placement.candidateId))) context.addIssue({ code: z.ZodIssueCode.custom, message: "Placements must reference legal candidate IDs" });
});
export type DashboardSelectionPlan = z.infer<typeof dashboardSelectionPlanSchema>;
export const dailyDashboardDocumentSchema = z.object({
  brandId: z.string().uuid(), localDate: z.string().date(), timezone: z.string().min(1).max(100), composerVersion: z.string().min(1).max(40), scoringVersion: z.string().min(1).max(40), status: z.enum(["ready", "partial"]), generatedAt: z.string().datetime({ offset: true }), sourceWatermarks: z.record(z.string(), z.string().datetime({ offset: true }).nullable()), headline: z.string().min(1).max(180), blocks: z.array(dailyDashboardBlockSchema).max(5),
}).superRefine((document, context) => {
  const slots = document.blocks.map((block) => block.slot);
  if (new Set(slots).size !== slots.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Dashboard block slots must be unique" });
  if (document.blocks.length > 0 && !slots.includes("hero")) context.addIssue({ code: z.ZodIssueCode.custom, message: "A populated dashboard needs a hero block" });
  if (new TextEncoder().encode(JSON.stringify(document)).byteLength > 100_000) context.addIssue({ code: z.ZodIssueCode.custom, message: "Dashboard document exceeds 100 KB" });
});
export type DailyDashboardDocument = z.infer<typeof dailyDashboardDocumentSchema>;
