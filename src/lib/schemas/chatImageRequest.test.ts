import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { chatImageRequestSchema, getAspectsForModel } from "./chatImageRequest";

const baseRef = {
  id: "r1",
  name: "ref",
  path: "bucket/file.png",
  mime: "image/png",
  base64: "dGVzdA==",
};

describe("chatImageRequestSchema", () => {
  test("nano-banana accepts valid resolution", () => {
    const parsed = chatImageRequestSchema.safeParse({
      brandProfileId: "brand-1",
      model: "nano-banana",
      prompt: "A test",
      aspectRatio: "1:1",
      resolution: "1024x1024",
    });
    assert.ok(parsed.success, parsed.success ? "" : parsed.error.message);
  });

  test("nano-banana rejects bad resolution format", () => {
    const parsed = chatImageRequestSchema.safeParse({
      brandProfileId: "brand-1",
      model: "nano-banana",
      prompt: "bad res",
      aspectRatio: "1:1",
      resolution: "abc",
    });
    assert.ok(!parsed.success);
  });

  test("pro image requires image_size and aspect_ratio", () => {
    const missing = chatImageRequestSchema.safeParse({
      brandProfileId: "brand-1",
      model: "gemini-3-pro-image-preview",
      prompt: "test",
    });
    assert.ok(!missing.success);

    const valid = chatImageRequestSchema.safeParse({
      brandProfileId: "brand-1",
      model: "gemini-3-pro-image-preview",
      prompt: "test",
      aspectRatio: getAspectsForModel("gemini-3-pro-image-preview")[0],
      imageSize: "2K",
    });
    assert.ok(valid.success, valid.success ? "" : valid.error.message);
  });

  test("video requires aspect ratio and allowed resolution", () => {
    const badRes = chatImageRequestSchema.safeParse({
      brandProfileId: "brand-1",
      model: "veo-3-1",
      prompt: "vid",
      aspectRatio: "16:9",
      resolution: "4k",
    });
    assert.ok(!badRes.success);

    const missingAspect = chatImageRequestSchema.safeParse({
      brandProfileId: "brand-1",
      model: "veo-3-1",
      prompt: "vid",
      resolution: "720p",
    });
    assert.ok(!missingAspect.success);
  });

  test("image refs limited to 14", () => {
    const refs = Array.from({ length: 15 }, (_, i) => ({ ...baseRef, id: `r${i}` }));
    const parsed = chatImageRequestSchema.safeParse({
      brandProfileId: "brand-1",
      model: "nano-banana",
      prompt: "test",
      aspectRatio: "1:1",
      refs,
    });
    assert.ok(!parsed.success);
  });

  test("video refs limited to 3", () => {
    const refs = Array.from({ length: 4 }, (_, i) => ({ ...baseRef, id: `r${i}` }));
    const parsed = chatImageRequestSchema.safeParse({
      brandProfileId: "brand-1",
      model: "veo-3-1",
      prompt: "test",
      aspectRatio: "16:9",
      resolution: "720p",
      refs,
    });
    assert.ok(!parsed.success);
  });
});

