// Canonical organic "AI-Awareness" report types shared by the get-organic-insights
// edge function (assembler) and the Frontend OrganicAwarenessReportView. Mirrors
// the competitor-spy awareness pattern: blocks are self-describing (category +
// title + free-form data) so the renderer switches on category without a rigid
// per-block schema.

import { z } from "zod";

export const organicAwarenessBlockSchema = z.object({
  category: z.string(),
  title: z.string(),
  data: z.unknown(),
});
export type OrganicAwarenessBlock = z.infer<typeof organicAwarenessBlockSchema>;

export const organicAwarenessSummarySchema = z.object({
  posts: z.number().int().nonnegative(),
  reach: z.number().nonnegative().optional(),
  views: z.number().nonnegative().optional(),
  engagement: z.number().nonnegative().optional(),
  topHookRate: z.number().nullable().optional(),
  lowHookCount: z.number().int().nonnegative().optional(),
});
export type OrganicAwarenessSummary = z.infer<typeof organicAwarenessSummarySchema>;

export const organicAwarenessReportPayloadSchema = z.object({
  windowStart: z.string(),
  windowEnd: z.string(),
  summary: organicAwarenessSummarySchema,
  blocks: z.array(organicAwarenessBlockSchema),
});
export type OrganicAwarenessReportPayload = z.infer<typeof organicAwarenessReportPayloadSchema>;

export const organicAwarenessReportSchema = z.object({
  id: z.string().optional(),
  brandId: z.string(),
  externalAccountId: z.string().optional(),
  runId: z.string(),
  generatedAt: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  payload: organicAwarenessReportPayloadSchema,
});
export type OrganicAwarenessReport = z.infer<typeof organicAwarenessReportSchema>;
