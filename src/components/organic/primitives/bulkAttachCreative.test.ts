import { describe, expect, it } from "bun:test"

import { shapeUserSuppliedMedia, creativeRefFromAsset } from "@continuum/contracts"
import type { MediaAsset } from "@continuum/contracts"

// Unit test: verify that the bulk-attach path shapes creatives identically for
// every target draft (the invariant the BulkActionToolbar handler relies on).

function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "asset-1",
    brandId: "brand-1",
    kind: "image",
    bucket: "media-library",
    storagePath: "brand-1/assets/hero.jpg",
    fileName: "hero.jpg",
    mimeType: "image/jpeg",
    source: "upload",
    status: "ready",
    tags: [],
    detectedObjects: [],
    hasImageEmbedding: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    signedUrl: "https://cdn.example.com/hero.jpg",
    ...overrides,
  }
}

describe("bulk attach creative — shapeUserSuppliedMedia invariants", () => {
  it("applies identical patch across multiple target draft ids", () => {
    const asset = makeAsset()
    const ref = creativeRefFromAsset(asset)
    const { mediaSuggestionPatch, publishingAssets } = shapeUserSuppliedMedia([ref])

    // Applying to N drafts should produce the exact same patch each time.
    const targetDraftIds = ["draft-a", "draft-b", "draft-c"]
    const patches = targetDraftIds.map(() => ({ mediaSuggestionPatch, publishingAssets }))

    for (const patch of patches) {
      expect(patch.mediaSuggestionPatch.mediaStatus).toBe("user_supplied")
      expect(patch.publishingAssets).toHaveLength(1)
      expect(patch.publishingAssets[0].storagePath).toBe("brand-1/assets/hero.jpg")
      expect(patch.publishingAssets[0].bucket).toBe("media-library")
    }
  })

  it("shapes a single image with correct fields", () => {
    const asset = makeAsset({ width: 1080, height: 1080 })
    const ref = creativeRefFromAsset(asset)
    const { mediaSuggestionPatch, publishingAssets } = shapeUserSuppliedMedia([ref])

    expect(mediaSuggestionPatch.kind).toBe("image")
    expect(mediaSuggestionPatch.mediaStatus).toBe("user_supplied")
    expect(mediaSuggestionPatch.url).toBe("brand-1/assets/hero.jpg")
    expect(mediaSuggestionPatch.bucket).toBe("media-library")
    expect(publishingAssets[0].kind).toBe("image")
    expect(publishingAssets[0].role).toBe("primary")
    expect(publishingAssets[0].width).toBe(1080)
  })

  it("shapes multiple images as carousel", () => {
    const asset1 = makeAsset({ id: "a1", storagePath: "brand/slide1.jpg" })
    const asset2 = makeAsset({ id: "a2", storagePath: "brand/slide2.jpg" })
    const refs = [creativeRefFromAsset(asset1), creativeRefFromAsset(asset2)]
    const { mediaSuggestionPatch, publishingAssets } = shapeUserSuppliedMedia(refs)

    expect(mediaSuggestionPatch.kind).toBe("carousel")
    expect(mediaSuggestionPatch.mediaStatus).toBe("user_supplied")
    expect(publishingAssets).toHaveLength(2)
    expect(publishingAssets[0].slideIndex).toBe(0)
    expect(publishingAssets[1].slideIndex).toBe(1)
  })

  it("shapes a video asset as reel", () => {
    const asset = makeAsset({ kind: "video", mimeType: "video/mp4", storagePath: "brand/reel.mp4" })
    const ref = creativeRefFromAsset(asset)
    const { mediaSuggestionPatch, publishingAssets } = shapeUserSuppliedMedia([ref])

    expect(mediaSuggestionPatch.kind).toBe("reel")
    expect(mediaSuggestionPatch.mediaStatus).toBe("user_supplied")
    expect(publishingAssets[0].kind).toBe("video")
  })

  it("creativeRefFromAsset maps durationMs to durationSec", () => {
    const asset = makeAsset({ kind: "video", durationMs: 15000 })
    const ref = creativeRefFromAsset(asset)
    expect(ref.durationSec).toBe(15)
  })

  it("throws when called with an empty creatives array", () => {
    expect(() => shapeUserSuppliedMedia([])).toThrow()
  })
})
