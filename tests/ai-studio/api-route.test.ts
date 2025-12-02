import test from "node:test";
import assert from "node:assert/strict";

import { mapBackendGenerationResponse } from "../../src/lib/ai-studio/backend.ts";
import { aiStudioGenerationRequestSchema } from "../../src/lib/schemas/aiStudio.ts";

// These are pure-function style tests around the mapping and validation used by the API route.

const sampleJobPayload = () => {
  const now = new Date().toISOString();
  return {
    job: {
      id: "job-1",
      brand_profile_id: "brand-1",
      provider: "nano-banana",
      medium: "image",
      template_id: null,
      prompt: "Render a minimal product on dark slate",
      negative_prompt: null,
      aspect_ratio: "4:5",
      duration_seconds: null,
      status: "queued",
      created_at: now,
      updated_at: now,
      artifacts: [],
      failure: null,
      metadata: null,
    },
  } as const;
};

test("mapBackendGenerationResponse stays stable with required fields", () => {
  const payload = sampleJobPayload();
  const { job } = mapBackendGenerationResponse(payload);
  assert.equal(job.id, "job-1");
  assert.equal(job.brandProfileId, "brand-1");
  assert.equal(job.aspectRatio, "4:5");
  assert.equal(job.status, "queued");
});

test("maps metadata payload through response", () => {
  const payload = sampleJobPayload();
  payload.job.metadata = {
    referenceAssetPath: "ai-studio/seeds/ref.png",
    firstFramePath: "ai-studio/frames/start.png",
    lastFramePath: "ai-studio/frames/end.png",
  };
  const { job } = mapBackendGenerationResponse(payload);
  assert.equal(job.metadata?.referenceAssetPath, "ai-studio/seeds/ref.png");
  assert.equal(job.metadata?.firstFramePath, "ai-studio/frames/start.png");
  assert.equal(job.metadata?.lastFramePath, "ai-studio/frames/end.png");
});

test("generation request schema blocks unsupported aspect ratio for veo 3.1", () => {
  assert.throws(() =>
    aiStudioGenerationRequestSchema.parse({
      brandProfileId: "brand-1",
      provider: "veo-3-1",
      medium: "video",
      prompt: "City flythrough",
      aspectRatio: "21:9",
      durationSeconds: 12,
    })
  );
});

test("generation request schema allows sora-2 square video", () => {
  const parsed = aiStudioGenerationRequestSchema.parse({
    brandProfileId: "brand-1",
    provider: "sora-2",
    medium: "video",
    prompt: "Square loop",
    aspectRatio: "1:1",
    durationSeconds: 8,
  });
  assert.equal(parsed.aspectRatio, "1:1");
});
