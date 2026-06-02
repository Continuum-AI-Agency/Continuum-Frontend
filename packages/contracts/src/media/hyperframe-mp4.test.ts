import { describe, expect, it } from "bun:test";

import {
  linkHyperframeMp4ErrorSchema,
  linkHyperframeMp4RequestSchema,
  linkHyperframeMp4ResponseSchema,
} from "./hyperframe-mp4";

describe("link-hyperframe-mp4 contract", () => {
  it("round-trips a request", () => {
    const parsed = linkHyperframeMp4RequestSchema.safeParse({
      compositionId: "hf_1",
      brandId: "brand_1",
      draftId: "11111111-1111-1111-1111-111111111111",
      mp4Base64: "AAAA",
      mimeType: "video/mp4",
      durationSec: 15,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a null draftId (chat/single path)", () => {
    const parsed = linkHyperframeMp4RequestSchema.safeParse({
      compositionId: "hf_1",
      brandId: "brand_1",
      draftId: null,
      mp4Base64: "AAAA",
      mimeType: "video/mp4",
      durationSec: 15,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a non-mp4 mime type", () => {
    const parsed = linkHyperframeMp4RequestSchema.safeParse({
      compositionId: "hf_1",
      brandId: "brand_1",
      draftId: null,
      mp4Base64: "AAAA",
      mimeType: "video/webm",
      durationSec: 15,
    });
    expect(parsed.success).toBe(false);
  });

  it("round-trips ready/exists responses and the error envelope", () => {
    expect(
      linkHyperframeMp4ResponseSchema.safeParse({
        ok: true,
        status: "exists",
        mp4Bucket: "hyperframes-mp4",
        mp4Path: "organic/brand_1/hf_1.mp4",
        mp4Url: null,
      }).success,
    ).toBe(true);
    expect(
      linkHyperframeMp4ErrorSchema.safeParse({ ok: false, status: "pending", message: "in flight" })
        .success,
    ).toBe(true);
  });
});
