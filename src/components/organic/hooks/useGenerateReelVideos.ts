"use client"

import * as React from "react"

import { getApiBaseUrl } from "@/lib/api/config"
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken"
import { useCalendarStore } from "@/lib/organic/store"
import { useToast } from "@/components/ui/ToastProvider"
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types"
import type { ReelVideoBatchFrame } from "@continuum/contracts"

/** A tagged draft eligible for reel-video generation: the FE id + its persisted backend id. */
export type ReelVideoTarget = { id: string; backendDraftId: string }

export type UseGenerateReelVideosResult = {
  generate: (brandId: string, targets: ReelVideoTarget[]) => Promise<void>
  isGenerating: boolean
}

/** Parse a streamed NDJSON body into one JSON object per line. Exported for testing. */
export async function* parseNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        yield JSON.parse(trimmed)
      } catch {
        // Skip partial/garbage lines.
      }
    }
  }
  const tail = buffer.trim()
  if (tail) {
    try {
      yield JSON.parse(tail)
    } catch {
      // ignore
    }
  }
}

const REEL_STAGE_LABELS: Record<string, string> = {
  planning: "Planning scenes…",
  generating_scenes: "Generating clips…",
  stitching: "Stitching reel…",
  persisting: "Saving video…",
}

export function useGenerateReelVideos(): UseGenerateReelVideosResult {
  const updateDraft = useCalendarStore((state) => state.updateDraft)
  const { show } = useToast()
  const [isGenerating, setIsGenerating] = React.useState(false)

  const generate = React.useCallback(
    async (brandId: string, targets: ReelVideoTarget[]) => {
      if (!brandId || targets.length === 0) return

      const feIdByBackendId = new Map(targets.map((t) => [t.backendDraftId, t.id]))
      const feIdFor = (backendDraftId: string): string | null => feIdByBackendId.get(backendDraftId) ?? null

      const setStage = (backendDraftId: string, stage: string | undefined) => {
        const feId = feIdFor(backendDraftId)
        if (!feId) return
        updateDraft(feId, (draft: OrganicCalendarDraft) => ({ ...draft, generationStage: stage }))
      }

      setIsGenerating(true)
      try {
        const token = await getBrowserAccessToken()
        const response = await fetch(`${getApiBaseUrl()}/api/organic/agent/reels/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ brandId, draftIds: targets.map((t) => t.backendDraftId) }),
        })

        if (!response.ok || !response.body) {
          const message = response.status === 400 ? "Too many reels selected for one batch." : "Could not start reel generation."
          show({ title: "Reel generation failed", description: message, variant: "error" })
          return
        }

        for await (const raw of parseNdjson(response.body)) {
          const frame = raw as ReelVideoBatchFrame
          switch (frame.type) {
            case "reel_started":
              setStage(frame.draftId, REEL_STAGE_LABELS.planning)
              break
            case "reel_progress":
              setStage(frame.draftId, REEL_STAGE_LABELS[frame.stage] ?? "Working…")
              break
            case "reel_ready": {
              const feId = feIdFor(frame.draftId)
              if (feId) {
                updateDraft(feId, (draft: OrganicCalendarDraft) => ({
                  ...draft,
                  generationStage: undefined,
                  generationError: undefined,
                  mediaSuggestion: {
                    ...draft.mediaSuggestion,
                    reel: {
                      ...draft.mediaSuggestion?.reel,
                      generated: true,
                      url: frame.mp4Path,
                      signedUrl: frame.mp4Url,
                      durationSec: frame.durationSec,
                      error: null,
                    },
                  },
                }))
              }
              break
            }
            case "reel_failed": {
              const feId = feIdFor(frame.draftId)
              if (feId) {
                updateDraft(feId, (draft: OrganicCalendarDraft) => ({
                  ...draft,
                  generationStage: undefined,
                  generationError: frame.error,
                }))
              }
              break
            }
            case "batch_completed": {
              if (frame.ready > 0) {
                show({
                  title: "Reels generated",
                  description: `${frame.ready} reel${frame.ready === 1 ? "" : "s"} ready${frame.failed > 0 ? `, ${frame.failed} failed` : ""}.`,
                  variant: frame.failed > 0 ? "error" : "success",
                })
              } else if (frame.failed > 0) {
                show({ title: "Reel generation failed", description: `${frame.failed} reel${frame.failed === 1 ? "" : "s"} failed.`, variant: "error" })
              }
              break
            }
            default:
              break
          }
        }
      } catch (error) {
        show({
          title: "Reel generation failed",
          description: error instanceof Error ? error.message : "Unexpected error.",
          variant: "error",
        })
      } finally {
        setIsGenerating(false)
      }
    },
    [updateDraft, show],
  )

  return { generate, isGenerating }
}
