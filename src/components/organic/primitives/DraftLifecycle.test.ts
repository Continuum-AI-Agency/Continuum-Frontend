import { describe, expect, it } from "bun:test"

import type { OrganicCalendarDraft } from "./types"
import { deriveMediaStageLabel, resolveDraftMediaStage } from "./DraftLifecycle"

const baseDraft = (overrides: Partial<OrganicCalendarDraft> = {}): OrganicCalendarDraft => ({
  id: "d1",
  title: "t",
  summary: "",
  timeLabel: "9:00 AM",
  dateLabel: "Mon, Apr 21",
  status: "draft",
  platforms: ["instagram"],
  format: "Post",
  objective: "Draft",
  captionPreview: "",
  tags: [],
  mediaCount: 0,
  ...overrides,
})

describe("resolveDraftMediaStage", () => {
  it("prefers the authoritative draft.mediaStage", () => {
    expect(resolveDraftMediaStage(baseDraft({ mediaStage: "realizing" }))).toBe("realizing")
  })

  it("falls back to text_only when there are no media signals", () => {
    expect(resolveDraftMediaStage(baseDraft())).toBe("text_only")
  })

  it("derives realized from publishingAssets when mediaStage is absent", () => {
    expect(
      resolveDraftMediaStage(
        baseDraft({ publishingAssets: [{ storagePath: "p/1.jpg" }] as never }),
      ),
    ).toBe("realized")
  })

  it("derives storyboard_ready from a non-empty storyboard", () => {
    expect(
      resolveDraftMediaStage(
        baseDraft({ mediaSuggestion: { storyboard: [{ storageUrl: "u" }] } as never }),
      ),
    ).toBe("storyboard_ready")
  })
})

describe("deriveMediaStageLabel", () => {
  it("labels each enrichment stage", () => {
    expect(deriveMediaStageLabel("text_only")).toBe("Text only")
    expect(deriveMediaStageLabel("storyboard_ready")).toBe("Blueprint ready")
    expect(deriveMediaStageLabel("realizing")).toBe("Realizing")
    expect(deriveMediaStageLabel("realized")).toBe("Realized")
    expect(deriveMediaStageLabel("failed")).toBe("Media failed")
  })
})
