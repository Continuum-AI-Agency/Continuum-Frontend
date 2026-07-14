import { describe, expect, it } from "bun:test";

import {
  clipGenerateRequestSchema,
  clipPlanSchema,
  clipScoreSchema,
  clipSectionSchema,
  clipSignUploadRequestSchema,
  clipUploadTicketSchema,
  registerClipRequestSchema,
  timestampedTranscriptSchema,
} from "./clip";
import { clipGenerationFrameSchema } from "../streaming/clip";

describe("timestampedTranscriptSchema", () => {
  it("parses a transcript with word-level timing", () => {
    const parsed = timestampedTranscriptSchema.parse({
      languageCode: "en-US",
      durationSec: 12.4,
      text: "hello world",
      words: [
        { text: "hello", startSec: 0.1, endSec: 0.5 },
        { text: "world", startSec: 0.6, endSec: 1.0, confidence: 0.92 },
      ],
    });
    expect(parsed.words).toHaveLength(2);
  });

  it("rejects unknown keys (strict boundary)", () => {
    expect(
      timestampedTranscriptSchema.safeParse({
        languageCode: "en-US",
        durationSec: 1,
        text: "x",
        words: [],
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe("clipPlanSchema", () => {
  it("requires at least one keepRange per section", () => {
    const ok = clipPlanSchema.safeParse({
      sourceAssetId: "asset-1",
      durationSec: 60,
      sections: [
        {
          index: 0,
          startSec: 0,
          endSec: 30,
          title: "Intro",
          summary: "opening",
          transcriptExcerpt: "hi",
          keepRanges: [{ startSec: 0, endSec: 12 }, { startSec: 14, endSec: 30 }],
          words: [{ text: "hi", startSec: 0, endSec: 0.4 }],
        },
      ],
    });
    expect(ok.success).toBe(true);

    const noRanges = clipPlanSchema.safeParse({
      sourceAssetId: "asset-1",
      durationSec: 60,
      sections: [
        {
          index: 0,
          startSec: 0,
          endSec: 30,
          title: "Intro",
          summary: "opening",
          transcriptExcerpt: "hi",
          keepRanges: [],
          words: [],
        },
      ],
    });
    expect(noRanges.success).toBe(false);
  });

  it("carries the section's word timings and rejects a malformed word", () => {
    const base = {
      index: 0,
      startSec: 0,
      endSec: 30,
      title: "Intro",
      summary: "opening",
      transcriptExcerpt: "hi there",
      keepRanges: [{ startSec: 0, endSec: 18 }],
    };
    const ok = clipPlanSchema.safeParse({
      sourceAssetId: "asset-1",
      durationSec: 60,
      sections: [{ ...base, words: [{ text: "hi", startSec: 0, endSec: 0.4 }, { text: "there", startSec: 0.4, endSec: 0.9 }] }],
    });
    expect(ok.success).toBe(true);

    const missingWords = clipPlanSchema.safeParse({
      sourceAssetId: "asset-1",
      durationSec: 60,
      sections: [base],
    });
    expect(missingWords.success).toBe(false);

    const badWord = clipPlanSchema.safeParse({
      sourceAssetId: "asset-1",
      durationSec: 60,
      sections: [{ ...base, words: [{ text: "hi", startSec: -1, endSec: 0.4 }] }],
    });
    expect(badWord.success).toBe(false);
  });
});

describe("clipSectionSchema", () => {
  it("allows an optional hookLine", () => {
    expect(
      clipSectionSchema.safeParse({
        index: 1,
        startSec: 30,
        endSec: 60,
        title: "Tips",
        summary: "three tips",
        hookLine: "Here are 3 things",
        transcriptExcerpt: "first...",
      }).success,
    ).toBe(true);
  });
});

describe("clipScoreSchema", () => {
  it("accepts a pending stub with no comparison yet", () => {
    const parsed = clipScoreSchema.parse({
      status: "pending",
      hookPotential: null,
      comparedAgainst: null,
      computedAt: "2026-06-15T00:00:00Z",
    });
    expect(parsed.status).toBe("pending");
  });

  it("accepts a scored result referencing the 7-day organic ranking", () => {
    const parsed = clipScoreSchema.parse({
      status: "scored",
      hookPotential: 0.81,
      comparedAgainst: {
        source: "organic_awareness_top_posts",
        windowDays: 7,
        postIds: ["p1", "p2"],
        topHookRate: 74.2,
      },
      computedAt: "2026-06-15T00:00:00Z",
    });
    expect(parsed.comparedAgainst?.windowDays).toBe(7);
  });
});

describe("registerClipRequestSchema", () => {
  it("requires an mp4 mime + a section + a score stub", () => {
    const ok = registerClipRequestSchema.safeParse({
      brandId: "b1",
      sourceAssetId: "asset-1",
      bucket: "media-library",
      storagePath: "b1/clips/asset-1/0.mp4",
      fileName: "0.mp4",
      mimeType: "video/mp4",
      sizeBytes: 45_678,
      durationSec: 18,
      section: {
        index: 0,
        startSec: 0,
        endSec: 30,
        title: "Intro",
        summary: "opening",
        transcriptExcerpt: "hi",
        keepRanges: [{ startSec: 0, endSec: 18 }],
        words: [{ text: "hi", startSec: 0, endSec: 0.4 }],
      },
      score: { status: "pending", hookPotential: null, comparedAgainst: null, computedAt: "2026-06-15T00:00:00Z" },
    });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.sizeBytes).toBe(45_678);
  });
});

describe("clipGenerateRequestSchema", () => {
  it("requires the source asset and the extracted-audio storage location", () => {
    expect(
      clipGenerateRequestSchema.safeParse({
        brandId: "b1",
        sourceAssetId: "asset-1",
        audioBucket: "media-library",
        audioStoragePath: "b1/clip-audio/job-1.wav",
      }).success,
    ).toBe(true);
    expect(clipGenerateRequestSchema.safeParse({ brandId: "b1", sourceAssetId: "asset-1" }).success).toBe(false);
  });
});

const PENDING_SCORE = {
  status: "pending" as const,
  hookPotential: null,
  comparedAgainst: null,
  computedAt: "2026-06-15T00:00:00Z",
};

const PLAN_READY_PLAN = {
  sourceAssetId: "asset-1",
  durationSec: 60,
  sections: [
    {
      index: 0,
      startSec: 0,
      endSec: 30,
      title: "Intro",
      summary: "opening",
      transcriptExcerpt: "hi",
      keepRanges: [{ startSec: 0, endSec: 18 }],
      words: [{ text: "hi", startSec: 0, endSec: 0.4 }],
    },
  ],
};

describe("clipGenerationFrameSchema", () => {
  it("accepts a clip_plan_ready frame carrying the plan + signed source url + score", () => {
    const frame = {
      type: "clip_plan_ready",
      plan: PLAN_READY_PLAN,
      sourceSignedUrl: "https://signed.example/asset-1.mp4",
      score: PENDING_SCORE,
    };
    const parsed = clipGenerationFrameSchema.safeParse(frame);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === "clip_plan_ready") {
      expect(parsed.data.plan.sections).toHaveLength(1);
      expect(parsed.data.score.status).toBe("pending");
    }
  });

  it("rejects a clip_plan_ready frame missing the score stub", () => {
    expect(
      clipGenerationFrameSchema.safeParse({
        type: "clip_plan_ready",
        plan: PLAN_READY_PLAN,
        sourceSignedUrl: "https://signed.example/asset-1.mp4",
      }).success,
    ).toBe(false);
  });

  it("accepts the section + stage + terminal frames", () => {
    for (const frame of [
      { type: "job_started", jobId: "j1", sourceAssetId: "asset-1" },
      { type: "stage", stage: "transcribing" },
      { type: "section_started", index: 0 },
      { type: "section_ready", index: 0, assetId: "clip-asset-1" },
      { type: "section_failed", index: 1, error: "encode failed" },
      { type: "job_completed", ready: 2, failed: 1 },
      { type: "job_failed", error: "transcription failed" },
    ]) {
      expect(clipGenerationFrameSchema.safeParse(frame).success).toBe(true);
    }
  });

  it("rejects an out-of-enum stage", () => {
    expect(clipGenerationFrameSchema.safeParse({ type: "stage", stage: "nope" }).success).toBe(false);
  });
});

describe("clipSignUploadRequestSchema", () => {
  it("accepts an audio sign request without a section index", () => {
    expect(
      clipSignUploadRequestSchema.safeParse({
        brandId: "b1",
        sourceAssetId: "asset-1",
        target: "audio",
      }).success,
    ).toBe(true);
  });

  it("accepts a clip sign request with a section index + filename", () => {
    const parsed = clipSignUploadRequestSchema.parse({
      brandId: "b1",
      sourceAssetId: "asset-1",
      target: "clip",
      sectionIndex: 2,
      fileName: "2.mp4",
    });
    expect(parsed.sectionIndex).toBe(2);
  });

  it("rejects an unknown target + unknown keys", () => {
    expect(
      clipSignUploadRequestSchema.safeParse({ brandId: "b1", sourceAssetId: "asset-1", target: "thumbnail" }).success,
    ).toBe(false);
    expect(
      clipSignUploadRequestSchema.safeParse({ brandId: "b1", sourceAssetId: "asset-1", target: "audio", extra: 1 })
        .success,
    ).toBe(false);
  });
});

describe("clipUploadTicketSchema", () => {
  it("parses the bucket/path/token returned by the edge fn", () => {
    const parsed = clipUploadTicketSchema.parse({
      bucket: "media-library",
      path: "b1/clips/asset-1/0.mp4",
      token: "signed-token",
    });
    expect(parsed.path).toBe("b1/clips/asset-1/0.mp4");
  });
});
