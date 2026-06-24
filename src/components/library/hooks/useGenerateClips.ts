"use client"

import * as React from "react"

import { getApiBaseUrl } from "@/lib/api/config"
import { getBrowserAccessToken } from "@/lib/auth/getBrowserAccessToken"
import { useToast } from "@/components/ui/ToastProvider"
import { clipGenerationFrameSchema, type MediaAsset } from "@continuum/contracts"
import { parseNdjson } from "@/components/organic/hooks/useGenerateReelVideos"
import { checkSpliceSupport } from "@/StudioCanvas/utils/splice/webcodecsSupport"
import { cutAndPersistSection, extractAndUploadAudio } from "@/lib/clips/clipClientCut"
import { DEFAULT_CLIP_QUALITY, type ClipQuality } from "@/lib/clips/clipQuality"
import type { CaptionStyle } from "@/lib/clips/clipCaptionStyle"

export type ClipSectionStatus = "pending" | "active" | "done" | "error"
export type ClipSectionProgress = { index: number; title: string; status: ClipSectionStatus }
export type ClipGenerationProgress = {
  sourceAssetId: string
  stageLabel: string | null
  sections: ClipSectionProgress[]
  done: boolean
}

export type GenerateClipsOptions = { quality?: ClipQuality; captionsEnabled?: boolean; captionStyle?: CaptionStyle }

export type UseGenerateClipsResult = {
  generate: (asset: MediaAsset, options?: GenerateClipsOptions) => Promise<void>
  isGenerating: boolean
  progress: ClipGenerationProgress | null
  dismiss: () => void
}

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued…",
  transcribing: "Transcribing…",
  sectioning: "Finding sections…",
  planning: "Planning cuts…",
  cutting: "Cutting…",
  persisting: "Saving…",
}

const isAbort = (err: unknown): boolean => err instanceof DOMException && err.name === "AbortError"

// Library-local clip generation: download the source video once (reused for audio
// extraction + cutting), stream the backend plan over NDJSON, then cut + persist
// each section in the browser. Progress drives a per-card strip; nothing touches
// the organic calendar store.
export function useGenerateClips(): UseGenerateClipsResult {
  const { show } = useToast()
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [progress, setProgress] = React.useState<ClipGenerationProgress | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => () => abortRef.current?.abort(), [])

  const generate = React.useCallback(
    async (asset: MediaAsset, options: GenerateClipsOptions = {}) => {
      const quality = options.quality ?? DEFAULT_CLIP_QUALITY
      const captionsEnabled = options.captionsEnabled ?? false
      const captionStyle = options.captionStyle
      if (asset.kind !== "video") return
      if (!asset.signedUrl) {
        show({ title: "Can't generate clips", description: "This video isn't ready yet.", variant: "error" })
        return
      }

      // Cutting happens in the browser (WebCodecs/mediabunny). Bail before any work
      // on a browser that can't render.
      const support = await checkSpliceSupport()
      if (!support.ok) {
        show({ title: "Can't generate clips here", description: `${support.reason}. Try Chrome or Edge on desktop.`, variant: "error" })
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setIsGenerating(true)
      setProgress({ sourceAssetId: asset.id, stageLabel: "Preparing…", sections: [], done: false })

      const forThisAsset = (p: ClipGenerationProgress | null): p is ClipGenerationProgress =>
        Boolean(p && p.sourceAssetId === asset.id)
      const setStage = (label: string | null) =>
        setProgress((p) => (forThisAsset(p) ? { ...p, stageLabel: label } : p))
      const setSection = (index: number, status: ClipSectionStatus) =>
        setProgress((p) => (forThisAsset(p) ? { ...p, sections: p.sections.map((s) => (s.index === index ? { ...s, status } : s)) } : p))

      try {
        const sourceBlob = await fetch(asset.signedUrl, { signal: controller.signal }).then((r) => {
          if (!r.ok) throw new Error(`Could not download the source video (${r.status})`)
          return r.blob()
        })

        setStage("Extracting audio…")
        const { audioBucket, audioStoragePath } = await extractAndUploadAudio({
          brandId: asset.brandId,
          sourceAssetId: asset.id,
          sourceBlob,
          signal: controller.signal,
        })

        const token = await getBrowserAccessToken()
        const response = await fetch(`${getApiBaseUrl()}/api/clips/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ brandId: asset.brandId, sourceAssetId: asset.id, audioBucket, audioStoragePath }),
          signal: controller.signal,
        })
        if (!response.ok || !response.body) {
          show({ title: "Clip generation failed", description: "Could not start clip generation.", variant: "error" })
          setProgress(null)
          return
        }

        for await (const raw of parseNdjson(response.body)) {
          const parsed = clipGenerationFrameSchema.safeParse(raw)
          if (!parsed.success) continue
          const frame = parsed.data

          if (frame.type === "job_started") {
            setStage("Transcribing…")
          } else if (frame.type === "stage") {
            setStage(STAGE_LABELS[frame.stage] ?? "Working…")
          } else if (frame.type === "job_failed") {
            throw new Error(frame.error)
          } else if (frame.type === "clip_plan_ready") {
            const sections = frame.plan.sections
            setProgress((p) =>
              forThisAsset(p)
                ? { ...p, stageLabel: null, sections: sections.map((s) => ({ index: s.index, title: s.title, status: "pending" as const })) }
                : p,
            )

            let ready = 0
            let failed = 0
            for (const section of sections) {
              if (controller.signal.aborted) throw new DOMException("aborted", "AbortError")
              setSection(section.index, "active")
              try {
                await cutAndPersistSection({
                  brandId: asset.brandId,
                  sourceAssetId: asset.id,
                  sourceBlob,
                  section,
                  score: frame.score,
                  quality,
                  captionsEnabled,
                  captionStyle,
                  signal: controller.signal,
                })
                setSection(section.index, "done")
                ready += 1
              } catch (err) {
                if (isAbort(err)) throw err
                setSection(section.index, "error")
                failed += 1
              }
            }

            setProgress((p) => (forThisAsset(p) ? { ...p, done: true } : p))
            if (ready > 0) {
              show({
                title: "Clips generated",
                description: `${ready} clip${ready === 1 ? "" : "s"} saved to the Clips folder${failed > 0 ? `, ${failed} failed` : ""}.`,
                variant: failed > 0 ? "error" : "success",
              })
            } else {
              show({ title: "Clip generation failed", description: "No clips could be produced.", variant: "error" })
            }
          }
        }
      } catch (error) {
        if (isAbort(error)) {
          setProgress(null)
          return
        }
        show({ title: "Clip generation failed", description: error instanceof Error ? error.message : "Unexpected error.", variant: "error" })
        setProgress(null)
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setIsGenerating(false)
      }
    },
    [show],
  )

  const dismiss = React.useCallback(() => setProgress(null), [])

  return { generate, isGenerating, progress, dismiss }
}
