import { describe, expect, it } from "bun:test";

import {
  buildAiStudioHandoffStorageCandidates,
  normalizeDraftPostType,
  plannerAiStudioApplyRequestSchema,
  plannerAiStudioHandoffSchema,
  resolveWorkflowConcept,
  resolveWorkflowConceptSpec,
} from "./ai-studio-bridge";

describe("ai-studio-bridge", () => {
  it("normalizes post type from format strings", () => {
    expect(normalizeDraftPostType("Carousel")).toBe("carousel");
    expect(normalizeDraftPostType("Reel")).toBe("reel");
    expect(normalizeDraftPostType("FeedPost")).toBe("post");
    expect(normalizeDraftPostType("")).toBe("post");
  });

  it("parses planner handoff payload", () => {
    const parsed = plannerAiStudioHandoffSchema.parse({
      schemaVersion: "planner_ai_handoff_v1",
      draftId: "draft-1",
      brandProfileId: "brand-1",
      weekStartId: "2026-03-23",
      platform: "instagram",
      postType: "post",
      format: "Post",
      title: "Hello",
      summary: "World",
      captionPreview: "Caption",
      updatedAt: new Date().toISOString(),
    });

    expect(parsed.draftId).toBe("draft-1");
    expect(parsed.platform).toBe("instagram");
  });

  it("requires assets for apply payload", () => {
    const parsed = plannerAiStudioApplyRequestSchema.safeParse({
      schemaVersion: "planner_ai_apply_v1",
      draftId: "draft-1",
      brandProfileId: "brand-1",
      postType: "post",
      platform: "instagram",
      overwrite: true,
      contentPatch: {},
      assets: [],
    });

    expect(parsed.success).toBe(false);
  });

  it("maps platform and post type to workflow concept", () => {
    expect(resolveWorkflowConcept({ platform: "instagram", postType: "post" })).toBe(
      "ig_post_single_image"
    );
    expect(resolveWorkflowConcept({ platform: "instagram", postType: "reel" })).toBe(
      "ig_reel_single_video"
    );
    expect(resolveWorkflowConcept({ platform: "instagram", postType: "carousel" })).toBe(
      "ig_carousel_multi_image"
    );
    expect(resolveWorkflowConcept({ platform: "linkedin", postType: "post" })).toBe(
      "li_post_single_image"
    );
  });

  it("returns concept output behavior spec", () => {
    const linkedinSpec = resolveWorkflowConceptSpec({
      platform: "linkedin",
      postType: "post",
    });
    expect(linkedinSpec.outputKind).toBe("image");
    expect(linkedinSpec.outputMode).toBe("single");
    expect(linkedinSpec.maxReferenceImages).toBe(5);
    expect(linkedinSpec.requiresExplicitPickOnMultiOutput).toBe(true);
  });

  it("builds deduped fallback candidates for storage-constrained handoff payloads", () => {
    const handoff = plannerAiStudioHandoffSchema.parse({
      schemaVersion: "planner_ai_handoff_v1",
      draftId: "seeded-1",
      brandProfileId: "brand-1",
      weekStartId: "2026-03-23",
      platform: "instagram",
      postType: "post",
      format: "Post",
      title: "Seeded title",
      summary: "Seeded summary",
      captionPreview: "Seeded caption",
      mediaSuggestion: {
        assetUrl: "https://example.com/image.png",
        assetBase64: "abc123",
        generationContext: { foo: "bar" },
      },
      assetHints: [{ role: "thumbnail", suggestion: "Hero subject" }],
      updatedAt: new Date().toISOString(),
    });

    const candidates = buildAiStudioHandoffStorageCandidates(handoff);

    expect(candidates).toHaveLength(5);
    expect(candidates[0].mediaSuggestion?.assetBase64).toBe("abc123");
    expect(candidates[1].mediaSuggestion?.assetBase64).toBeUndefined();
    expect(candidates[2].mediaSuggestion?.generationContext).toBeUndefined();
    expect(candidates[3].mediaSuggestion).toBeUndefined();
    expect(candidates[4].assetHints).toBeUndefined();
  });
});
