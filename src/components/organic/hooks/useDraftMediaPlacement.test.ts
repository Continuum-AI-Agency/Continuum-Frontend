import { describe, it, expect, beforeAll, beforeEach, mock } from "bun:test"
import { renderHook, act } from "@testing-library/react"
import type { MediaAsset } from "@continuum/contracts"

// Intercept store so tests don't need a full Zustand provider.
mock.module("@/lib/organic/store", () => ({
  useCalendarStore: mock(),
}))

// shapeUserSuppliedMedia is pure — use the real implementation.
// creativeRefFromAsset is also pure.

// bun runs multiple test files in a single process and hoists mock.module() to
// collection time regardless of call site. OrganicDraftPreview.test.tsx formerly
// mocked this module's path at the top level, which poisoned our module cache.
// Fix: OrganicDraftPreview.test.tsx no longer mocks useDraftMediaPlacement —
// it lets the real hook run against its already-mocked @/lib/organic/store.
//
// Static imports are frozen at collection time in bun 1.x. We use late-bound
// variables loaded via dynamic import in beforeAll so that our own mock.restore()
// + re-register cycle picks up the correct (real) hook module before any test runs.

let useDraftMediaPlacement: (draftId: string) => ReturnType<
  typeof import("./useDraftMediaPlacement").useDraftMediaPlacement
>
let useCalendarStore: ReturnType<typeof mock>

beforeAll(async () => {
  mock.restore()
  mock.module("@/lib/organic/store", () => ({
    useCalendarStore: mock(),
  }))
  const hookMod = await import("./useDraftMediaPlacement")
  const storeMod = await import("@/lib/organic/store")
  useDraftMediaPlacement = hookMod.useDraftMediaPlacement
  useCalendarStore = storeMod.useCalendarStore as ReturnType<typeof mock>
})

function makeImageAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "asset-1",
    brandId: "brand-1",
    kind: "image",
    bucket: "media-library",
    storagePath: "brands/brand-1/img.jpg",
    fileName: "img.jpg",
    mimeType: "image/jpeg",
    source: "upload",
    status: "ready",
    tags: [],
    detectedObjects: [],
    hasImageEmbedding: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    signedUrl: "https://cdn.example.com/img.jpg",
    ...overrides,
  }
}

function makeVideoAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return makeImageAsset({ id: "asset-video", kind: "video", fileName: "vid.mp4", mimeType: "video/mp4", ...overrides })
}

describe("useDraftMediaPlacement", () => {
  let capturedUpdater: ((draft: unknown) => unknown) | null = null
  let storedDraft: Record<string, unknown>

  const mockUpdateDraft = mock((
    _draftId: string,
    updater: (draft: unknown) => unknown,
  ) => {
    capturedUpdater = updater
    storedDraft = updater(storedDraft) as Record<string, unknown>
  })

  beforeEach(() => {
    capturedUpdater = null
    storedDraft = {
      id: "draft-1",
      mediaSuggestion: { mediaStatus: "pending" },
      publishingAssets: [],
    }
    useCalendarStore.mockImplementation(
      (selector: (state: { updateDraft: typeof mockUpdateDraft }) => unknown) =>
        selector({ updateDraft: mockUpdateDraft }),
    )
    mockUpdateDraft.mockClear()
  })

  // place() — single image
  it("place() patches mediaSuggestion and publishingAssets for a single image", async () => {
    const { result } = renderHook(() => useDraftMediaPlacement("draft-1"))
    const asset = makeImageAsset()

    await act(async () => {
      result.current.place([asset], { kind: "single" })
    })

    expect(mockUpdateDraft).toHaveBeenCalledTimes(1)
    const draft = storedDraft as {
      mediaSuggestion: { mediaStatus: string; kind: string }
      publishingAssets: Array<{ kind: string; storagePath: string }>
    }
    expect(draft.mediaSuggestion.mediaStatus).toBe("user_supplied")
    expect(draft.mediaSuggestion.kind).toBe("image")
    expect(draft.publishingAssets).toHaveLength(1)
    expect(draft.publishingAssets[0].kind).toBe("image")
    expect(draft.publishingAssets[0].storagePath).toBe("brands/brand-1/img.jpg")
  })

  // place() — video
  it("place() patches reel shape for a video asset", async () => {
    const { result } = renderHook(() => useDraftMediaPlacement("draft-1"))
    const asset = makeVideoAsset()

    await act(async () => {
      result.current.place([asset], { kind: "video" })
    })

    const draft = storedDraft as {
      mediaSuggestion: { mediaStatus: string; kind: string; reel: { url: string } }
      publishingAssets: Array<{ kind: string }>
    }
    expect(draft.mediaSuggestion.mediaStatus).toBe("user_supplied")
    expect(draft.mediaSuggestion.kind).toBe("reel")
    expect(draft.mediaSuggestion.reel.url).toBe("brands/brand-1/img.jpg")
    expect(draft.publishingAssets[0].kind).toBe("video")
  })

  // place() — multiple images → carousel
  it("place() shapes a carousel for multiple images", async () => {
    const { result } = renderHook(() => useDraftMediaPlacement("draft-1"))
    const a1 = makeImageAsset({ id: "a1", storagePath: "p1.jpg" })
    const a2 = makeImageAsset({ id: "a2", storagePath: "p2.jpg" })

    await act(async () => {
      result.current.place([a1, a2], { kind: "single" })
    })

    const draft = storedDraft as {
      mediaSuggestion: { mediaStatus: string; kind: string }
      publishingAssets: Array<{ slideIndex: number }>
    }
    expect(draft.mediaSuggestion.kind).toBe("carousel")
    expect(draft.mediaSuggestion.mediaStatus).toBe("user_supplied")
    expect(draft.publishingAssets).toHaveLength(2)
    expect(draft.publishingAssets[0].slideIndex).toBe(0)
    expect(draft.publishingAssets[1].slideIndex).toBe(1)
  })

  // undo()
  it("undo() restores the prior state after place()", async () => {
    storedDraft = {
      id: "draft-1",
      mediaSuggestion: { mediaStatus: "pending" },
      publishingAssets: [],
    }

    const { result } = renderHook(() => useDraftMediaPlacement("draft-1"))
    const asset = makeImageAsset()

    // Place first.
    await act(async () => {
      result.current.place([asset], { kind: "single" })
    })

    expect(result.current.canUndo).toBe(true)

    // Then undo.
    await act(async () => {
      result.current.undo()
    })

    const draft = storedDraft as {
      mediaSuggestion: { mediaStatus: string }
      publishingAssets: unknown[]
    }
    expect(draft.mediaSuggestion.mediaStatus).toBe("pending")
    expect(draft.publishingAssets).toHaveLength(0)
    expect(result.current.canUndo).toBe(false)
  })

  // invalid kind — video onto carousel slot
  it("place() returns invalid_kind error when placing a video onto a carousel slot", async () => {
    const { result } = renderHook(() => useDraftMediaPlacement("draft-1"))
    const video = makeVideoAsset()

    let err: ReturnType<typeof result.current.place> = null
    await act(async () => {
      err = result.current.place([video], { kind: "carousel_slide", slideIndex: 0 })
    })

    expect(err).not.toBeNull()
    expect(err?.type).toBe("invalid_kind")
    // updateDraft must NOT have been called.
    expect(mockUpdateDraft).not.toHaveBeenCalled()
    expect(result.current.error?.type).toBe("invalid_kind")
  })

  // empty selection
  it("place() returns empty_selection error when given an empty array", async () => {
    const { result } = renderHook(() => useDraftMediaPlacement("draft-1"))

    let err: ReturnType<typeof result.current.place> = null
    await act(async () => {
      err = result.current.place([], { kind: "single" })
    })

    expect(err?.type).toBe("empty_selection")
    expect(mockUpdateDraft).not.toHaveBeenCalled()
  })

  // reorderSlides
  it("reorderSlides() reindexes publishingAssets correctly", async () => {
    storedDraft = {
      id: "draft-1",
      mediaSuggestion: { mediaStatus: "user_supplied", kind: "carousel" },
      publishingAssets: [
        { kind: "image", slideIndex: 0, storagePath: "a.jpg", storageUrl: "a" },
        { kind: "image", slideIndex: 1, storagePath: "b.jpg", storageUrl: "b" },
        { kind: "image", slideIndex: 2, storagePath: "c.jpg", storageUrl: "c" },
      ],
    }

    const { result } = renderHook(() => useDraftMediaPlacement("draft-1"))

    await act(async () => {
      result.current.reorderSlides(0, 2)
    })

    const draft = storedDraft as {
      publishingAssets: Array<{ slideIndex: number; storagePath: string }>
    }
    const sorted = [...draft.publishingAssets].sort((a, b) => a.slideIndex - b.slideIndex)
    // a.jpg was at 0, moved to 2 — so order becomes b, c, a.
    expect(sorted[0].storagePath).toBe("b.jpg")
    expect(sorted[1].storagePath).toBe("c.jpg")
    expect(sorted[2].storagePath).toBe("a.jpg")
  })

  // removeSlide — min 1 guard
  it("removeSlide() returns min_slides error when only one slide remains", async () => {
    storedDraft = {
      id: "draft-1",
      mediaSuggestion: { mediaStatus: "user_supplied" },
      publishingAssets: [
        { kind: "image", slideIndex: 0, storagePath: "only.jpg", storageUrl: "u" },
      ],
    }

    const { result } = renderHook(() => useDraftMediaPlacement("draft-1"))

    let err: ReturnType<typeof result.current.removeSlide> = null
    await act(async () => {
      err = result.current.removeSlide(0)
    })

    expect(err?.type).toBe("min_slides")
    // storedDraft must be unchanged (the updater returned `current`).
    const draft = storedDraft as { publishingAssets: unknown[] }
    expect(draft.publishingAssets).toHaveLength(1)
  })
})
