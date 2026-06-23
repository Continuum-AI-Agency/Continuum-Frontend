// Progressive NDJSON frames for a competitor-ad-spy sync run
// (POST /api/competitor-ad-spy/runs). Each line is the frame spread with the
// shared StreamEnvelope (see ndjson.ts + envelope.ts): Backend emits via
// serializeFrame, Frontend reads via parseFrame. Mirrors the onboarding
// inspirations stream pattern.

import { z } from "zod";

const competitorStartedFrame = z.object({
  type: z.literal("competitor_started"),
  data: z
    .object({
      competitorId: z.string(),
      competitorName: z.string(),
      index: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .loose(),
});

const snapshotDiffFrame = z.object({
  type: z.literal("snapshot_diff"),
  data: z
    .object({
      competitorId: z.string(),
      fetched: z.number().int().nonnegative(),
      inserted: z.number().int().nonnegative(),
      updated: z.number().int().nonnegative(),
      lifecycleEvents: z.number().int().nonnegative(),
    })
    .loose(),
});

const mediaExtractedFrame = z.object({
  type: z.literal("media_extracted"),
  data: z
    .object({
      snapshotId: z.string(),
      status: z.enum(["stored", "failed", "skipped"]),
    })
    .loose(),
});

const creativeAnalyzedFrame = z.object({
  type: z.literal("creative_analyzed"),
  data: z
    .object({
      snapshotId: z.string(),
      sourceAdId: z.string(),
      sentiment: z.string().nullable(),
      hookArchetype: z.string().nullable(),
      primaryTheme: z.string().nullable(),
      analyzedFromImage: z.boolean(),
    })
    .loose(),
});

const paidPageResolvedFrame = z.object({
  type: z.literal("paid_page_resolved"),
  data: z
    .object({
      competitorId: z.string(),
      competitorName: z.string(),
      pageId: z.string(),
      pageName: z.string(),
      confidence: z.number().min(0).max(1),
    })
    .loose(),
});

const paidPageNeedsReviewFrame = z.object({
  type: z.literal("paid_page_needs_review"),
  data: z
    .object({
      competitorId: z.string(),
      competitorName: z.string(),
      candidates: z.number().int().nonnegative(),
    })
    .loose(),
});

const competitorSkippedFrame = z.object({
  type: z.literal("competitor_skipped"),
  data: z
    .object({
      competitorId: z.string(),
      competitorName: z.string(),
      reason: z.enum(["missing_meta_page_id", "archived", "brand_mismatch"]),
    })
    .loose(),
});

const awarenessBlockFrame = z.object({
  type: z.literal("awareness_block"),
  data: z
    .object({
      blockType: z.string(),
      block: z.unknown(),
    })
    .loose(),
});

const runCompletedFrame = z.object({
  type: z.literal("run_completed"),
  data: z
    .object({
      runId: z.string(),
      competitorsProcessed: z.number().int().nonnegative(),
      snapshotsInserted: z.number().int().nonnegative(),
      snapshotsUpdated: z.number().int().nonnegative(),
      analysisCompleted: z.number().int().nonnegative(),
      durationMs: z.number().int().nonnegative(),
    })
    .loose(),
});

const runErrorFrame = z.object({
  type: z.literal("run_error"),
  data: z
    .object({
      message: z.string(),
      competitorId: z.string().nullable().optional(),
    })
    .loose(),
});

export const competitorSpyStreamFrameSchema = z.discriminatedUnion("type", [
  competitorStartedFrame,
  snapshotDiffFrame,
  mediaExtractedFrame,
  creativeAnalyzedFrame,
  paidPageResolvedFrame,
  paidPageNeedsReviewFrame,
  competitorSkippedFrame,
  awarenessBlockFrame,
  runCompletedFrame,
  runErrorFrame,
]);
export type CompetitorSpyStreamFrame = z.infer<typeof competitorSpyStreamFrameSchema>;
export type CompetitorSpyFrameType = CompetitorSpyStreamFrame["type"];
