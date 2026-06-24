// UI card frames for the organic agent's "brand report craft" loop:
// read the brand book + readiness scores, propose an improved brand book for
// approval, apply it, then re-run the readiness harness and show before/after.
// Each line is the frame spread with the shared StreamEnvelope (see
// ndjson.ts + envelope.ts): the Backend emits via the agent `emit` closure,
// the Frontend renders through the organic stream parser. These four `type`
// literals are members of `organicStreamFrameSchema` (streaming/organic.ts) —
// add new ones there too, never a parallel hand-rolled union on the FE.

import { z } from "zod";

import { brandDnaSchema } from "../onboarding/brand-dna";
import { readinessAnalysisSchema, readinessDimensionKey } from "../onboarding/readiness";

// The read card: lean brand DNA + the current readiness scorecard (null until a
// readiness run has happened for the brand).
export const uiBrandBookFrameSchema = z.object({
  type: z.literal("ui.brand_book"),
  data: z
    .object({
      brandId: z.string().min(1),
      dna: brandDnaSchema,
      readiness: readinessAnalysisSchema.nullable(),
    })
    .loose(),
});

// A standalone readiness scorecard (e.g. the "after" re-score), so a fresh
// scorecard can render without re-emitting the whole brand-book card.
export const uiReadinessScorecardFrameSchema = z.object({
  type: z.literal("ui.readiness_scorecard"),
  data: z
    .object({
      brandId: z.string().min(1),
      readiness: readinessAnalysisSchema,
    })
    .loose(),
});

// The approval card. Intentionally light: the full patched composite lives
// server-side in the proposal store (keyed by proposalId) and is NOT inlined
// here — the user approves `summaryMarkdown`, the agent applies by proposalId.
export const uiBrandBookProposalFrameSchema = z.object({
  type: z.literal("ui.brand_book_proposal"),
  data: z
    .object({
      proposalId: z.string().min(1),
      brandId: z.string().min(1),
      summaryMarkdown: z.string().min(1),
      targetDimensions: z.array(readinessDimensionKey).default([]),
      rationale: z.string().min(1),
      changedFields: z.array(z.string()).default([]),
    })
    .loose(),
});

// The result card after an approved apply + recompute: before/after scorecards
// and the overall-score delta.
export const uiBrandBookAppliedFrameSchema = z.object({
  type: z.literal("ui.brand_book_applied"),
  data: z
    .object({
      brandId: z.string().min(1),
      before: readinessAnalysisSchema.nullable(),
      after: readinessAnalysisSchema,
      delta: z.object({ overall: z.number() }).loose(),
    })
    .loose(),
});

// Local discriminated union for FE-side reuse (mirrors competitor-spy.ts). The
// canonical membership that the FE parser switches on is the organic union; this
// is a convenience for code that handles only the brand-report-craft frames.
export const brandReportCraftStreamFrameSchema = z.discriminatedUnion("type", [
  uiBrandBookFrameSchema,
  uiReadinessScorecardFrameSchema,
  uiBrandBookProposalFrameSchema,
  uiBrandBookAppliedFrameSchema,
]);
export type BrandReportCraftStreamFrame = z.infer<typeof brandReportCraftStreamFrameSchema>;
export type BrandReportCraftFrameType = BrandReportCraftStreamFrame["type"];

export type UiBrandBookFrame = z.infer<typeof uiBrandBookFrameSchema>;
export type UiReadinessScorecardFrame = z.infer<typeof uiReadinessScorecardFrameSchema>;
export type UiBrandBookProposalFrame = z.infer<typeof uiBrandBookProposalFrameSchema>;
export type UiBrandBookAppliedFrame = z.infer<typeof uiBrandBookAppliedFrameSchema>;
