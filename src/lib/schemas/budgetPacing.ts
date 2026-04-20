import { z } from "zod";

export const BudgetPacingRequestSchema = z.object({
  brandId: z.string(),
  adAccountId: z.string(),
});

export const BudgetPacingEntrySchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  status: z.string(),
  budgetType: z.enum(["daily", "lifetime"]),
  totalBudget: z.number(),
  spendToDate: z.number(),
  budgetRemaining: z.number(),
  pacePct: z.number(),
  paceStatus: z.enum(["on_pace", "underspending", "overspending"]),
  projectedEndSpend: z.number(),
  daysElapsed: z.number(),
  daysRemaining: z.number().nullable(),
  flightStart: z.string().nullable(),
  flightEnd: z.string().nullable(),
  dailyTrend: z.array(
    z.object({
      date: z.string(),
      spend: z.number(),
      target: z.number(),
    })
  ),
});

export const BudgetPacingSummarySchema = z.object({
  totalBudget: z.number(),
  totalSpend: z.number(),
  totalBudgetRemaining: z.number(),
  overallPacePct: z.number(),
  paceStatus: z.enum(["on_pace", "underspending", "overspending"]),
});

export const BudgetPacingResponseSchema = z.object({
  campaigns: z.array(BudgetPacingEntrySchema),
  summary: BudgetPacingSummarySchema,
  range: z.object({
    since: z.string(),
    until: z.string(),
  }),
});

export type BudgetPacingRequest = z.infer<typeof BudgetPacingRequestSchema>;
export type BudgetPacingEntry = z.infer<typeof BudgetPacingEntrySchema>;
export type BudgetPacingSummary = z.infer<typeof BudgetPacingSummarySchema>;
export type BudgetPacingResponse = z.infer<typeof BudgetPacingResponseSchema>;
