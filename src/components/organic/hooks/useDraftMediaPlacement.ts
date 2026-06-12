"use client"

// Write path for user-supplied media placement on the calendar draft preview.
// Wraps updateDraft from useCalendarStore with optimistic patching, undo, and
// per-slot validation so all surfaces (click-to-place, drag-from-rail, picker
// attach) go through a single path and always emit publishable media shapes.

import * as React from "react"
import { useCalendarStore } from "@/lib/organic/store"
import { creativeRefFromAsset, shapeUserSuppliedMedia } from "@continuum/contracts"
import type { CreativeRef } from "@continuum/contracts"
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types"
import type { MediaAsset } from "@continuum/contracts"

export type SlotTarget =
  | { kind: "single" }
  | { kind: "carousel_slide"; slideIndex: number }
  | { kind: "video" }

export type PlacementError =
  | { type: "invalid_kind"; message: string }
  | { type: "min_slides"; message: string }
  | { type: "empty_selection"; message: string }

export type UseDraftMediaPlacementResult = {
  // Place one or more library creatives into the given slot target.
  place: (creatives: MediaAsset[], target: SlotTarget) => PlacementError | null
  // Undo the last place() call; no-op when nothing has been placed this session.
  undo: () => void
  canUndo: boolean
  // Reorder carousel slides by swapping indices.
  reorderSlides: (fromIndex: number, toIndex: number) => void
  // Remove a carousel slide (min 1 enforced; returns error if only one slide left).
  removeSlide: (slideIndex: number) => PlacementError | null
  // Append a library image as a new carousel slide.
  addSlide: (asset: MediaAsset) => PlacementError | null
  error: PlacementError | null
  clearError: () => void
}

type PublishingAsset = NonNullable<OrganicCalendarDraft["publishingAssets"]>[number]

function validateKindForTarget(creatives: CreativeRef[], target: SlotTarget): PlacementError | null {
  const hasVideo = creatives.some((c) => c.kind === "video")
  const hasImage = creatives.some((c) => c.kind === "image")

  if (target.kind === "carousel_slide" && hasVideo) {
    return {
      type: "invalid_kind",
      message: "Carousels are image-only in v1. Use the Reel slot for video.",
    }
  }

  if (target.kind === "video" && hasImage && creatives.length === 1) {
    // Single image onto a video slot is actually fine — will become an image post.
    return null
  }

  if (target.kind === "single" && hasVideo && hasImage) {
    return {
      type: "invalid_kind",
      message: "Cannot mix image and video in a single post.",
    }
  }

  return null
}

export function useDraftMediaPlacement(draftId: string): UseDraftMediaPlacementResult {
  const updateDraft = useCalendarStore((s) => s.updateDraft)
  const [undoSnapshot, setUndoSnapshot] = React.useState<Partial<OrganicCalendarDraft> | null>(null)
  const [error, setError] = React.useState<PlacementError | null>(null)

  const place = React.useCallback(
    (assets: MediaAsset[], target: SlotTarget): PlacementError | null => {
      if (assets.length === 0) {
        const err: PlacementError = { type: "empty_selection", message: "Select at least one creative." }
        setError(err)
        return err
      }

      const refs = assets.map(creativeRefFromAsset)
      const kindError = validateKindForTarget(refs, target)
      if (kindError) {
        setError(kindError)
        return kindError
      }

      setError(null)

      updateDraft(draftId, (current) => {
        // Snapshot for undo BEFORE patching.
        setUndoSnapshot({
          mediaSuggestion: current.mediaSuggestion,
          publishingAssets: current.publishingAssets,
        })

        const { mediaSuggestionPatch, publishingAssets } = shapeUserSuppliedMedia(refs)

        return {
          ...current,
          publishingAssets,
          mediaSuggestion: {
            ...current.mediaSuggestion,
            ...mediaSuggestionPatch,
          },
        }
      })

      return null
    },
    [draftId, updateDraft],
  )

  const undo = React.useCallback(() => {
    if (!undoSnapshot) return
    const snapshot = undoSnapshot
    setUndoSnapshot(null)
    updateDraft(draftId, (current) => ({
      ...current,
      mediaSuggestion: snapshot.mediaSuggestion ?? current.mediaSuggestion,
      publishingAssets: snapshot.publishingAssets ?? current.publishingAssets,
    }))
  }, [draftId, undoSnapshot, updateDraft])

  const reorderSlides = React.useCallback(
    (fromIndex: number, toIndex: number) => {
      updateDraft(draftId, (current) => {
        const slides = (current.publishingAssets ?? [])
          .filter((a) => a.kind === "image")
          .sort((a, b) => (a.slideIndex ?? 999) - (b.slideIndex ?? 999))

        if (fromIndex < 0 || fromIndex >= slides.length) return current
        if (toIndex < 0 || toIndex >= slides.length) return current
        if (fromIndex === toIndex) return current

        const reordered = [...slides]
        const [moved] = reordered.splice(fromIndex, 1)
        reordered.splice(toIndex, 0, moved)

        const reindexed: PublishingAsset[] = reordered.map((a, i) => ({
          ...a,
          slideIndex: i,
        }))

        const nonSlides = (current.publishingAssets ?? []).filter((a) => a.kind !== "image")
        return { ...current, publishingAssets: [...nonSlides, ...reindexed] }
      })
    },
    [draftId, updateDraft],
  )

  const removeSlide = React.useCallback(
    (slideIndex: number): PlacementError | null => {
      let slideErr: PlacementError | null = null

      updateDraft(draftId, (current) => {
        const slides = (current.publishingAssets ?? [])
          .filter((a) => a.kind === "image")
          .sort((a, b) => (a.slideIndex ?? 999) - (b.slideIndex ?? 999))

        if (slides.length <= 1) {
          slideErr = { type: "min_slides", message: "A carousel needs at least one image." }
          return current
        }

        const remaining = slides
          .filter((_, i) => i !== slideIndex)
          .map((a, i) => ({ ...a, slideIndex: i }))

        const nonSlides = (current.publishingAssets ?? []).filter((a) => a.kind !== "image")
        return { ...current, publishingAssets: [...nonSlides, ...remaining] }
      })

      if (slideErr) setError(slideErr)
      return slideErr
    },
    [draftId, updateDraft],
  )

  const addSlide = React.useCallback(
    (asset: MediaAsset): PlacementError | null => {
      if (asset.kind === "video") {
        const err: PlacementError = {
          type: "invalid_kind",
          message: "Carousels are image-only in v1.",
        }
        setError(err)
        return err
      }

      updateDraft(draftId, (current) => {
        const slides = (current.publishingAssets ?? [])
          .filter((a) => a.kind === "image")
          .sort((a, b) => (a.slideIndex ?? 999) - (b.slideIndex ?? 999))

        const newSlide: PublishingAsset = {
          role: "primary",
          kind: "image",
          slideIndex: slides.length,
          assetId: asset.id,
          bucket: asset.bucket,
          storagePath: asset.storagePath,
          storageUrl: asset.signedUrl ?? "",
          mimeType: asset.mimeType,
          width: asset.width ?? undefined,
          height: asset.height ?? undefined,
        }

        const nonSlides = (current.publishingAssets ?? []).filter((a) => a.kind !== "image")
        return { ...current, publishingAssets: [...nonSlides, ...slides, newSlide] }
      })

      return null
    },
    [draftId, updateDraft],
  )

  const clearError = React.useCallback(() => setError(null), [])

  return {
    place,
    undo,
    canUndo: undoSnapshot !== null,
    reorderSlides,
    removeSlide,
    addSlide,
    error,
    clearError,
  }
}
