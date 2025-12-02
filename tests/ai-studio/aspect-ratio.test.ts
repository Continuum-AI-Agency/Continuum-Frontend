import test from "node:test";
import assert from "node:assert/strict";

import { aiStudioGenerationRequestSchema, providerAspectRatioOptions } from "../../src/lib/schemas/aiStudio.ts";

test("Nano Banana image allows widest aspect set including 21:9", () => {
  const ratios = providerAspectRatioOptions["nano-banana"].image ?? [];
  assert.ok(ratios.includes("21:9"));

  const parsed = aiStudioGenerationRequestSchema.parse({
    brandProfileId: "brand-1",
    provider: "nano-banana",
    medium: "image",
    prompt: "Wide cinematic product panorama",
    aspectRatio: "21:9",
  });
  assert.equal(parsed.aspectRatio, "21:9");
});

test("Veo 3.1 video rejects unsupported aspect ratio", () => {
  assert.throws(() =>
    aiStudioGenerationRequestSchema.parse({
      brandProfileId: "brand-1",
      provider: "veo-3-1",
      medium: "video",
      prompt: "City flythrough",
      aspectRatio: "21:9",
    }),
  /not supported/);
});

test("Veo 3.1 video accepts 9:16", () => {
  const parsed = aiStudioGenerationRequestSchema.parse({
    brandProfileId: "brand-1",
    provider: "veo-3-1",
    medium: "video",
    prompt: "Vertical skate clip",
    aspectRatio: "9:16",
    durationSeconds: 8,
  });
  assert.equal(parsed.aspectRatio, "9:16");
});

test("Sora 2 allows square but rejects 5:4", () => {
  const ok = aiStudioGenerationRequestSchema.parse({
    brandProfileId: "brand-1",
    provider: "sora-2",
    medium: "video",
    prompt: "Square loop",
    aspectRatio: "1:1",
    durationSeconds: 12,
  });
  assert.equal(ok.aspectRatio, "1:1");

  assert.throws(() =>
    aiStudioGenerationRequestSchema.parse({
      brandProfileId: "brand-1",
      provider: "sora-2",
      medium: "video",
      prompt: "Portrait",
      aspectRatio: "5:4",
    }),
  /not supported/);
});
