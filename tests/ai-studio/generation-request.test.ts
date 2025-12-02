import test from "node:test";
import assert from "node:assert/strict";

import { aiStudioGenerationRequestSchema } from "../../src/lib/schemas/aiStudio.ts";

test("accepts image request with reference metadata", () => {
  const request = {
    brandProfileId: "brand-123",
    provider: "nano-banana",
    medium: "image" as const,
    prompt: "High-gloss product render on matte slate",
    negativePrompt: "low detail",
    aspectRatio: "4:5",
    guidanceScale: 6.5,
    seed: 321,
    metadata: {
      referenceAssetPath: "ai-studio/seeds/ref.png",
      referencePreviewUrl: "https://cdn.example.com/ref.png",
    },
  };

  const parsed = aiStudioGenerationRequestSchema.parse(request);
  assert.equal(parsed.medium, "image");
  assert.equal(parsed.provider, "nano-banana");
  assert.equal(parsed.metadata?.referenceAssetPath, "ai-studio/seeds/ref.png");
});

test("accepts video request with first/last frame metadata", () => {
  const request = {
    brandProfileId: "brand-999",
    provider: "veo-3-1",
    medium: "video" as const,
    prompt: "Fly-through of a luminous city at dusk",
    aspectRatio: "16:9",
    durationSeconds: 16,
    metadata: {
      firstFramePath: "ai-studio/frames/first.png",
      lastFramePath: "ai-studio/frames/last.png",
      durationPreset: "long",
    },
  };

  const parsed = aiStudioGenerationRequestSchema.parse(request);
  assert.equal(parsed.medium, "video");
  assert.equal(parsed.durationSeconds, 16);
  assert.equal(parsed.metadata?.firstFramePath, "ai-studio/frames/first.png");
});

test("accepts minimal text-only request", () => {
  const parsed = aiStudioGenerationRequestSchema.parse({
    brandProfileId: "brand-xyz",
    provider: "nano-banana",
    medium: "image",
    prompt: "Simple product render on white",
  });

  assert.equal(parsed.provider, "nano-banana");
  assert.equal(parsed.prompt, "Simple product render on white");
  assert.equal(parsed.metadata, undefined);
});

test("captures combined attachment metadata when provided", () => {
  const parsed = aiStudioGenerationRequestSchema.parse({
    brandProfileId: "brand-xyz",
    provider: "sora-2",
    medium: "video",
    prompt: "Storyboard with seeded frames",
    durationSeconds: 8,
    metadata: {
      referenceAssetPath: "ai-studio/ref/reference.png",
      firstFramePath: "ai-studio/frames/first.png",
      lastFramePath: "ai-studio/frames/last.png",
    },
  });

  assert.equal(parsed.metadata?.referenceAssetPath, "ai-studio/ref/reference.png");
  assert.equal(parsed.metadata?.firstFramePath, "ai-studio/frames/first.png");
  assert.equal(parsed.metadata?.lastFramePath, "ai-studio/frames/last.png");
});

test("rejects duration above 120 seconds", () => {
  assert.throws(() =>
    aiStudioGenerationRequestSchema.parse({
      brandProfileId: "brand-123",
      provider: "sora-2",
      medium: "video",
      prompt: "Long cinematic journey",
      durationSeconds: 300,
    })
  );
});

test("rejects invalid aspect ratio format", () => {
  assert.throws(() =>
    aiStudioGenerationRequestSchema.parse({
      brandProfileId: "brand-123",
      provider: "nano-banana",
      medium: "image",
      prompt: "Portrait",
      aspectRatio: "16x9",
    })
  );
});

test("requires brandProfileId and prompt", () => {
  assert.throws(() =>
    aiStudioGenerationRequestSchema.parse({
      provider: "nano-banana",
      medium: "image",
      prompt: "",
    } as unknown)
  );
});
