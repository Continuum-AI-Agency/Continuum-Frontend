import { describe, expect, it } from "bun:test";

import {
  organicMediaSuggestionSchema,
  organicPublishingAssetSchema,
  organicStoryboardPreviewSchema,
} from "./organic-pipeline";
import { organicStreamFrameSchema } from "./organic";

describe("organicStoryboardPreviewSchema", () => {
  it("accepts a durable, re-signable 512px preview frame", () => {
    const parsed = organicStoryboardPreviewSchema.safeParse({
      role: "primary",
      bucket: "brand-profile-assets",
      storagePath: "brand/organic/draft_1/preview/frame.png",
      storageUrl: "https://example.supabase.co/object/sign/...",
      format: "post",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires a non-empty storagePath so the preview can be re-signed", () => {
    const parsed = organicStoryboardPreviewSchema.safeParse({
      role: "primary",
      bucket: "brand-profile-assets",
      storagePath: "",
      storageUrl: "https://example.supabase.co/object/sign/...",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an inline base64 data: URL as the storageUrl (no base64 in the UI)", () => {
    const parsed = organicStoryboardPreviewSchema.safeParse({
      role: "primary",
      bucket: "brand-profile-assets",
      storagePath: "b/organic/d1/preview/a.png",
      storageUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("organicPublishingAssetSchema base64 guard", () => {
  it("rejects a base64 data: URL on a published asset's storageUrl", () => {
    const parsed = organicPublishingAssetSchema.safeParse({
      role: "primary",
      kind: "image",
      storagePath: "b/organic/d1/a.png",
      storageUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a signed storage URL (and an empty transient string)", () => {
    expect(
      organicPublishingAssetSchema.safeParse({
        role: "primary",
        kind: "image",
        bucket: "brand-profile-assets",
        storagePath: "b/organic/d1/a.png",
        storageUrl: "https://example.supabase.co/object/sign/...",
      }).success,
    ).toBe(true);
    expect(
      organicPublishingAssetSchema.safeParse({
        role: "primary",
        kind: "image",
        storagePath: "b/organic/d1/a.png",
        storageUrl: "",
      }).success,
    ).toBe(true);
  });
});

describe("organicMediaSuggestionSchema storyboard", () => {
  it("carries the persisted 512px storyboard alongside blueprint readiness", () => {
    const parsed = organicMediaSuggestionSchema.safeParse({
      mediaStatus: "pending",
      textReady: true,
      blueprintReady: true,
      storyboard: [
        {
          role: "primary",
          bucket: "brand-profile-assets",
          storagePath: "brand/organic/draft_1/preview/frame.png",
          storageUrl: "https://example.supabase.co/object/sign/...",
          format: "reel",
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.storyboard?.[0]?.role).toBe("primary");
  });

  it("remains valid with storyboard omitted (back-compat)", () => {
    const parsed = organicMediaSuggestionSchema.safeParse({ mediaStatus: "pending" });
    expect(parsed.success).toBe(true);
  });
});

describe("draft.blueprint_ready frame previews", () => {
  const frame = (data: Record<string, unknown>) =>
    organicStreamFrameSchema.safeParse({
      type: "draft.blueprint_ready",
      data: { jobId: "job_1", brandId: "brand_1", draftId: "draft_1", ...data },
    });

  it("carries typed transient preview frames for instant display", () => {
    expect(
      frame({
        previewRevision: "rev_1",
        previews: [{ role: "primary", signedUrl: "https://example/sign", format: "post" }],
      }).success,
    ).toBe(true);
  });

  // previewRevision is the media-approval TOKEN, not a rendering detail, so the frame
  // has to carry it even when signing produced no previews at all. Reading `previews` as
  // the carrier is what strands a draft on "awaiting media choice" with nothing to click.
  it("requires the approval token, with or without previews", () => {
    expect(frame({ previewRevision: "rev_1" }).success).toBe(true);
    expect(
      frame({
        previews: [{ role: "primary", signedUrl: "https://example/sign", format: "post" }],
      }).success,
    ).toBe(false);
  });
});
