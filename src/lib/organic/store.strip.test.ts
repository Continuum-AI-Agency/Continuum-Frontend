import { describe, expect, it } from "bun:test";

import { stripDraftBlobs } from "./store";
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types";

function makeDraft(mediaSuggestion: OrganicCalendarDraft["mediaSuggestion"]): OrganicCalendarDraft {
  return {
    id: "d1",
    title: "t",
    timeLabel: "",
    dateLabel: "",
    status: "draft",
    platforms: ["instagram"],
    format: "carousel",
    objective: "",
    captionPreview: "",
    tags: [],
    mediaCount: 0,
    mediaSuggestion,
  } as unknown as OrganicCalendarDraft;
}

describe("stripDraftBlobs", () => {
  it("nulls the primary, every carousel slide, and the hyperframe cover base64", () => {
    const draft = makeDraft({
      assetBase64: "AAAA",
      assets: [
        { role: "slide_1", assetBase64: "BBBB" },
        { role: "slide_2", assetBase64: "CCCC" },
      ],
      hyperframe: { coverBase64: "DDDD" },
    });

    const stripped = stripDraftBlobs(draft);

    expect(stripped.mediaSuggestion?.assetBase64).toBeNull();
    expect(stripped.mediaSuggestion?.assets?.[0]?.assetBase64).toBeNull();
    expect(stripped.mediaSuggestion?.assets?.[1]?.assetBase64).toBeNull();
    expect(stripped.mediaSuggestion?.hyperframe?.coverBase64).toBeNull();
  });

  it("preserves re-signable storyboard frames (no base64 to strip)", () => {
    const draft = makeDraft({
      assetBase64: "AAAA",
      storyboard: [
        { role: "primary", bucket: "b", storagePath: "p", storageUrl: "https://signed", format: "post" },
      ],
    });

    const stripped = stripDraftBlobs(draft);

    expect(stripped.mediaSuggestion?.assetBase64).toBeNull();
    expect(stripped.mediaSuggestion?.storyboard?.[0]?.storageUrl).toBe("https://signed");
  });

  it("returns the draft unchanged when there is no mediaSuggestion", () => {
    const draft = makeDraft(undefined);
    expect(stripDraftBlobs(draft)).toBe(draft);
  });
});
