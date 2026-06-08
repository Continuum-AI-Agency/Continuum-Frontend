import { describe, expect, it } from "bun:test";

import {
  linkReelMp4ErrorSchema,
  linkReelMp4RequestSchema,
  linkReelMp4ResponseSchema,
} from "./reel-finalize";

describe("link-reel-mp4 contract", () => {
  it("round-trips a request", () => {
    const parsed = linkReelMp4RequestSchema.safeParse({
      brandId: "brand_1",
      draftId: "11111111-1111-1111-1111-111111111111",
      mp4Base64: "AAAA",
      mimeType: "video/mp4",
      durationSec: 18,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-mp4 mime type", () => {
    expect(
      linkReelMp4RequestSchema.safeParse({
        brandId: "brand_1",
        draftId: "d1",
        mp4Base64: "AAAA",
        mimeType: "video/webm",
        durationSec: 18,
      }).success,
    ).toBe(false);
  });

  it("requires a draftId (a reel always belongs to a draft)", () => {
    expect(
      linkReelMp4RequestSchema.safeParse({
        brandId: "brand_1",
        draftId: null,
        mp4Base64: "AAAA",
        mimeType: "video/mp4",
        durationSec: 18,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      linkReelMp4RequestSchema.safeParse({
        brandId: "brand_1",
        draftId: "d1",
        mp4Base64: "AAAA",
        mimeType: "video/mp4",
        durationSec: 18,
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("round-trips ready/exists responses and the error envelope", () => {
    expect(
      linkReelMp4ResponseSchema.safeParse({
        ok: true,
        status: "exists",
        bucket: "brand-profile-assets",
        path: "reel/brand_1/d1.mp4",
        signedUrl: null,
      }).success,
    ).toBe(true);
    expect(
      linkReelMp4ErrorSchema.safeParse({ ok: false, status: "error", message: "boom" }).success,
    ).toBe(true);
  });
});
