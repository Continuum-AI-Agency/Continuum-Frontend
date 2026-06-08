import type { ReelClip } from "@continuum/contracts"

import { runSpliceInWorker } from "@/StudioCanvas/workers/spliceWorkerClient"
import type { WorkerClipInput } from "@/StudioCanvas/workers/spliceWorkerProtocol"

import { blobToBase64, finalizeReelMp4 } from "./reelMp4"

export type StitchAndFinalizeReelParams = {
  brandId: string
  draftId: string
  clips: ReelClip[]
  durationSec: number
  signal?: AbortSignal
  onStage?: (label: string) => void
}

export type StitchAndFinalizeReelResult = {
  bucket: string
  path: string
  signedUrl: string | null
  durationSec: number
}

async function downloadClip(url: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(url, signal ? { signal } : undefined)
  if (!response.ok) throw new Error(`Failed to download scene clip (${response.status})`)
  return response.blob()
}

/**
 * Download the verified scene clips, stitch them into one MP4 in the splice
 * worker (mediabunny), and persist + link the result via `link-reel-mp4`. The
 * worker's object URL is revoked once the bytes are uploaded.
 */
export async function stitchAndFinalizeReel(
  params: StitchAndFinalizeReelParams,
): Promise<StitchAndFinalizeReelResult> {
  const { brandId, draftId, clips, durationSec, signal, onStage } = params
  const ordered = [...clips].sort((a, b) => a.index - b.index)

  onStage?.("Stitching reel…")
  const blobs = await Promise.all(ordered.map((clip) => downloadClip(clip.signedClipUrl, signal)))
  const workerClips: WorkerClipInput[] = ordered.map((clip, i) => ({
    slotId: String(clip.index),
    blob: blobs[i],
  }))

  const spliced = await runSpliceInWorker({ clips: workerClips, signal })
  try {
    onStage?.("Finalizing…")
    const mp4Base64 = await blobToBase64(spliced.blob)
    const linked = await finalizeReelMp4({
      brandId,
      draftId,
      mp4Base64,
      durationSec: durationSec || spliced.durationSec,
    })
    return {
      bucket: linked.bucket,
      path: linked.path,
      signedUrl: linked.signedUrl,
      durationSec: durationSec || spliced.durationSec,
    }
  } finally {
    if (spliced.objectUrl.startsWith("blob:")) URL.revokeObjectURL(spliced.objectUrl)
  }
}
