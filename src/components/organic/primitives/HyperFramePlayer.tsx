"use client"

import * as React from "react"
import { PlayIcon } from "@radix-ui/react-icons"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { signHyperframeComposition } from "@/lib/organic/hyperframeSign"
import { persistHyperframeMp4OnFirstRender, resetHyperframeMp4Guard } from "@/lib/organic/hyperframeMp4"
import { createHyperframeMp4Renderer } from "@/lib/organic/renderHyperframeMp4"
import type { OrganicCalendarDraft } from "./types"

const DEFAULT_DURATION_SEC = 15

// 720p render dimensions per aspect ratio (short edge = 720) so the generated
// MP4 matches the composition's authored shape instead of always being forced
// to landscape. Unknown/absent aspect ratios fall back to 16:9.
const RENDER_DIMENSIONS_720P = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 720, height: 720 },
} as const

const DEFAULT_DIMENSIONS = RENDER_DIMENSIONS_720P["16:9"]

type PlayerState = "idle" | "loading" | "playing" | "error"

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function toDataUrl(base64: string): string {
  const normalized = base64.trim()
  if (normalized.startsWith("data:")) return normalized
  return `data:image/png;base64,${normalized}`
}

function resolveCoverUrl(draft: OrganicCalendarDraft): string | null {
  const hf = draft.mediaSuggestion?.hyperframe
  if (!hf) return null
  if (hasText(hf.coverImageUrl)) return hf.coverImageUrl.trim()
  if (hasText(hf.coverBase64)) return toDataUrl(hf.coverBase64)
  return null
}

function resolveDurationSec(draft: OrganicCalendarDraft): number {
  const spec = draft.mediaSuggestion?.hyperframe?.spec
  if (spec && typeof spec === "object" && !Array.isArray(spec)) {
    const candidate = (spec as Record<string, unknown>).durationSec
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return candidate
    }
  }
  return DEFAULT_DURATION_SEC
}

function resolveRenderDimensions(draft: OrganicCalendarDraft): { width: number; height: number } {
  const spec = draft.mediaSuggestion?.hyperframe?.spec
  if (spec && typeof spec === "object" && !Array.isArray(spec)) {
    const candidate = (spec as Record<string, unknown>).aspectRatio
    if (candidate === "16:9" || candidate === "9:16" || candidate === "1:1") {
      return RENDER_DIMENSIONS_720P[candidate]
    }
  }
  return DEFAULT_DIMENSIONS
}

export function HyperFramePlayer({
  draft,
  brandId,
}: {
  draft: OrganicCalendarDraft
  brandId: string
}) {
  const hyperframe = draft.mediaSuggestion?.hyperframe ?? null
  const coverUrl = resolveCoverUrl(draft)
  const mp4Status = hyperframe?.mp4Status ?? null

  const [state, setState] = React.useState<PlayerState>("idle")
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const kickOffMp4Render = React.useCallback(
    (compositionHtmlUrl: string) => {
      if (!hyperframe?.compositionId) return
      const dimensions = resolveRenderDimensions(draft)
      persistHyperframeMp4OnFirstRender({
        compositionId: hyperframe.compositionId,
        brandId,
        draftId: draft.id ?? null,
        durationSec: resolveDurationSec(draft),
        renderMp4: createHyperframeMp4Renderer({
          htmlUrl: compositionHtmlUrl,
          width: dimensions.width,
          height: dimensions.height,
          durationSec: resolveDurationSec(draft),
        }),
      })
    },
    [brandId, draft, hyperframe?.compositionId]
  )

  // Sign the composition and kick off the background MP4 render without touching
  // the visible player state. Used by the eager (scroll-into-view) trigger and Retry.
  const ensureMp4Rendered = React.useCallback(async () => {
    if (!hyperframe || !hasText(hyperframe.htmlPath) || !hyperframe.compositionId) return
    const url = await signHyperframeComposition(brandId, hyperframe.htmlPath)
    if (!url) return
    kickOffMp4Render(url)
  }, [brandId, hyperframe, kickOffMp4Render])

  // Render the MP4 as soon as the card scrolls into view (not only on Play), so a
  // hyperframe draft has a publishable video without the user ever opening it.
  // Skips 'ready' (already rendered) and 'failed' (Retry only, to avoid a loop).
  React.useEffect(() => {
    if (!hyperframe || !hasText(hyperframe.htmlPath) || !hyperframe.compositionId) return
    if (mp4Status === "ready" || mp4Status === "failed") return
    const el = containerRef.current
    if (!el || typeof IntersectionObserver === "undefined") return
    let triggered = false
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !triggered) {
            triggered = true
            observer.disconnect()
            void ensureMp4Rendered()
          }
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hyperframe, mp4Status, ensureMp4Rendered])

  const handleRetry = React.useCallback(() => {
    if (!hyperframe?.compositionId) return
    resetHyperframeMp4Guard(hyperframe.compositionId)
    void ensureMp4Rendered()
  }, [hyperframe?.compositionId, ensureMp4Rendered])

  const handlePlay = React.useCallback(async () => {
    if (!hyperframe || !hasText(hyperframe.htmlPath)) {
      setErrorMessage("This HyperFrame has no playable composition yet.")
      setState("error")
      return
    }
    setState("loading")
    setErrorMessage(null)
    const url = await signHyperframeComposition(brandId, hyperframe.htmlPath)
    if (!url) {
      setErrorMessage("Could not load the HyperFrame composition.")
      setState("error")
      return
    }
    setSignedUrl(url)
    setState("playing")
    kickOffMp4Render(url)
  }, [brandId, hyperframe, kickOffMp4Render])

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/70 bg-black"
    >
      {state === "playing" && signedUrl ? (
        <iframe
          sandbox="allow-scripts allow-same-origin"
          src={signedUrl}
          className="h-full w-full"
          title={draft.title}
        />
      ) : (
        <button
          type="button"
          onClick={handlePlay}
          disabled={state === "loading"}
          className={cn(
            "group absolute inset-0 flex items-center justify-center",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
          aria-label={`Play HyperFrame: ${draft.title}`}
        >
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={draft.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#5A48F9] to-[#7C6FFF]" />
          )}
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
            {state === "loading" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <PlayIcon className="h-6 w-6 translate-x-[1px]" />
            )}
          </span>
        </button>
      )}

      {state === "error" && errorMessage ? (
        <p className="absolute inset-x-0 bottom-0 bg-black/60 px-3 py-1.5 text-center text-xs text-white">
          {errorMessage}
        </p>
      ) : null}

      {state !== "playing" && mp4Status === "failed" ? (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/70 px-3 py-1.5 text-xs text-white">
          <span>Video render failed.</span>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-md bg-white/20 px-2 py-0.5 font-medium transition-colors hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  )
}
