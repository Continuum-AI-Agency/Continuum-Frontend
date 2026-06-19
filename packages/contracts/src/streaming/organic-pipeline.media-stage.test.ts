import { describe, expect, it } from "bun:test";

import { deriveOrganicMediaStage, organicMediaStageSchema } from "./organic-pipeline";

describe("deriveOrganicMediaStage", () => {
  it("returns text_only for a bare caption-checkpoint placement", () => {
    expect(deriveOrganicMediaStage({})).toBe("text_only");
    expect(deriveOrganicMediaStage({ creative: { mediaSuggestion: { mediaStatus: "pending" } } })).toBe("text_only");
    expect(deriveOrganicMediaStage(null)).toBe("text_only");
    expect(deriveOrganicMediaStage(undefined)).toBe("text_only");
  });

  it("returns storyboard_ready once the 512px blueprint is persisted", () => {
    expect(
      deriveOrganicMediaStage({
        creative: {
          mediaSuggestion: {
            mediaStatus: "pending",
            storyboard: [{ role: "primary", bucket: "b", storagePath: "p", storageUrl: "https://s/a" }],
          },
        },
      }),
    ).toBe("storyboard_ready");
  });

  it("returns realizing while headless generation is in flight", () => {
    expect(
      deriveOrganicMediaStage({
        creative: { mediaSuggestion: { mediaStatus: "generating", storyboard: [{ role: "primary" }] } },
      }),
    ).toBe("realizing");
  });

  it("returns realized for ready, user_supplied, or any publishingAssets", () => {
    expect(deriveOrganicMediaStage({ creative: { mediaSuggestion: { mediaStatus: "ready" } } })).toBe("realized");
    expect(deriveOrganicMediaStage({ creative: { mediaSuggestion: { mediaStatus: "user_supplied" } } })).toBe("realized");
    expect(deriveOrganicMediaStage({ publishingAssets: [{ role: "primary", bucket: "b", storagePath: "p" }] })).toBe("realized");
  });

  it("prefers realized over storyboard_ready when both signals are present", () => {
    expect(
      deriveOrganicMediaStage({
        publishingAssets: [{ role: "primary" }],
        creative: { mediaSuggestion: { mediaStatus: "ready", storyboard: [{ role: "primary" }] } },
      }),
    ).toBe("realized");
  });

  it("treats an empty publishingAssets/storyboard array as not-yet-enriched", () => {
    expect(deriveOrganicMediaStage({ publishingAssets: [] })).toBe("text_only");
    expect(deriveOrganicMediaStage({ creative: { mediaSuggestion: { storyboard: [] } } })).toBe("text_only");
  });

  it("never derives failed (failed is an explicit terminal signal)", () => {
    // No media-content combination yields 'failed' — the enum carries it, but
    // derivation must not infer it.
    expect(organicMediaStageSchema.options).toContain("failed");
    expect(deriveOrganicMediaStage({ creative: { mediaSuggestion: { mediaStatus: "skipped" } } })).toBe("text_only");
  });
});
