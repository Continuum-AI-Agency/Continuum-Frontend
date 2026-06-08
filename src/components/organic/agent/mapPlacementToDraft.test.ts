import { describe, expect, it } from "bun:test"

import { mapPlacementToDraft } from "./mapPlacementToDraft"
import type { CalendarPlacement } from "@/lib/organic/calendar-generation"

function basePlacement(partial: Partial<CalendarPlacement> = {}): CalendarPlacement {
  return {
    placementId: "spec-1",
    schedule: { dayId: "2026-06-01", scheduledAt: "2026-06-01T11:00:00.000Z", timeOfDay: "morning" },
    platform: { name: "instagram", accountId: "acct-1" },
    seed: { trendId: "trend-1", source: "trend" },
    content: { titleTopic: "Glass skin", format: "carousel", objective: "save" },
    creative: { creativeIdea: "3-step routine", mediaSuggestion: null },
    copy: { caption: "Your 3-step glass skin routine" },
    ...partial,
  } as CalendarPlacement
}

describe("mapPlacementToDraft", () => {
  it("carries durable publishingAssets through and derives mediaCount from them", () => {
    const placement = basePlacement({
      publishingAssets: [
        { role: "primary", kind: "image", slideIndex: 1, assetId: "asset-1", bucket: "b", storagePath: "b/p/1.png", storageUrl: "https://s/1" },
        { role: "slide_2", kind: "image", slideIndex: 2, assetId: "asset-2", bucket: "b", storagePath: "b/p/2.png", storageUrl: "https://s/2" },
      ],
    })

    const draft = mapPlacementToDraft(placement, "draft-1")

    expect(draft.publishingAssets).toHaveLength(2)
    expect(draft.publishingAssets?.[0].storageUrl).toBe("https://s/1")
    expect(draft.publishingAssets?.[0].assetId).toBe("asset-1")
    expect(draft.publishingAssets?.[0].bucket).toBe("b")
    expect(draft.mediaCount).toBe(2)
  })

  it("carries mediaSuggestion through and derives mediaCount from assetUrl when no publishingAssets", () => {
    const placement = basePlacement({
      creative: {
        creativeIdea: "idea",
        mediaSuggestion: { kind: "static", assetUrl: "https://s/single.png" },
      },
    })

    const draft = mapPlacementToDraft(placement, "draft-2")

    expect(draft.mediaSuggestion?.assetUrl).toBe("https://s/single.png")
    expect(draft.mediaCount).toBe(1)
  })

  it("reports zero media when the placement has no generated assets", () => {
    const draft = mapPlacementToDraft(basePlacement(), "draft-3")
    expect(draft.mediaCount).toBe(0)
    expect(draft.publishingAssets).toBeUndefined()
  })
})
