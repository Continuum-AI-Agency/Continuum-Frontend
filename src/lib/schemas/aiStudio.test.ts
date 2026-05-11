import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { aiStudioGenerationRequestSchema } from "./aiStudio";

const baseLiteRequest = {
  brandProfileId: "brand-1",
  provider: "veo-3-1-lite",
  medium: "video",
  prompt: "Cinematic product reveal",
  aspectRatio: "16:9",
  resolution: "720p",
} as const;

describe("aiStudioGenerationRequestSchema", () => {
  test("accepts Veo 3.1 Lite with supported video settings", () => {
    const parsed = aiStudioGenerationRequestSchema.safeParse({
      ...baseLiteRequest,
      prompt: Array.from({ length: 1024 }, () => "motion").join(" "),
      resolution: "1080p",
    });

    assert.ok(parsed.success, parsed.success ? "" : parsed.error.message);
  });

  test("rejects Veo 3.1 Lite prompts over 1024 estimated tokens", () => {
    const parsed = aiStudioGenerationRequestSchema.safeParse({
      ...baseLiteRequest,
      prompt: Array.from({ length: 1025 }, () => "motion").join(" "),
    });

    assert.ok(!parsed.success);
  });

  test("rejects unsupported Veo 3.1 Lite resolutions", () => {
    const parsed = aiStudioGenerationRequestSchema.safeParse({
      ...baseLiteRequest,
      resolution: "2K",
    });

    assert.ok(!parsed.success);
  });
});
