import {
  clipUploadTicketSchema,
  registerClipErrorSchema,
  registerClipRequestSchema,
  registerClipResponseSchema,
  type ClipPlanSection,
  type ClipScore,
  type ClipUploadTicket,
} from "@continuum/contracts"

import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { runSingleSourceSpliceInWorker } from "@/StudioCanvas/workers/spliceWorkerClient"
import { extractAudioWav } from "@/StudioCanvas/utils/clip/extractAudioWav"
import { DEFAULT_CLIP_QUALITY, clipQualityToShortEdge, type ClipQuality } from "@/lib/clips/clipQuality"
import type { CaptionStyle } from "@/lib/clips/clipCaptionStyle"

// Browser orchestration for clip generation: cut each section from the single
// source video (mediabunny worker), upload the bytes straight to storage via a
// service-role signed upload URL minted by the clip-asset edge fn (no base64),
// and register the result as a source:"clip" media asset. The score stub computed
// once by the backend job rides down on every section's register call.

type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>

export type ClipClientDeps = {
  splice?: typeof runSingleSourceSpliceInWorker
  extractAudio?: typeof extractAudioWav
  createClient?: () => SupabaseBrowserClient
}

export type ExtractAndUploadAudioParams = {
  brandId: string
  sourceAssetId: string
  sourceBlob: Blob
  signal?: AbortSignal
}

export type CutAndPersistSectionParams = {
  brandId: string
  sourceAssetId: string
  sourceBlob: Blob
  section: ClipPlanSection
  score: ClipScore
  // User-selected output quality; caps the on-device encode resolution. Defaults
  // to 1080p when omitted.
  quality?: ClipQuality
  // Burn word-synced captions into the clip from the section's transcript words.
  // Defaults to off when omitted.
  captionsEnabled?: boolean
  // Brand-derived caption colors/font; only applied when captions are enabled.
  captionStyle?: CaptionStyle
  signal?: AbortSignal
  onStage?: (label: string) => void
}

async function signUpload(
  supabase: SupabaseBrowserClient,
  body: { brandId: string; sourceAssetId: string; target: "audio" | "clip"; sectionIndex?: number },
): Promise<ClipUploadTicket> {
  const { data, error } = await supabase.functions.invoke("clip-asset", { body: { action: "sign_upload", ...body } })
  if (error) throw new Error(`clip-asset sign_upload failed: ${error.message}`)
  const parsed = clipUploadTicketSchema.safeParse(data)
  if (!parsed.success) throw new Error("clip-asset returned an invalid upload ticket")
  return parsed.data
}

async function uploadToTicket(supabase: SupabaseBrowserClient, ticket: ClipUploadTicket, blob: Blob): Promise<void> {
  const { error } = await supabase.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: blob.type || "application/octet-stream" })
  if (error) throw new Error(`upload to storage failed: ${error.message}`)
}

export async function extractAndUploadAudio(
  params: ExtractAndUploadAudioParams,
  deps: ClipClientDeps = {},
): Promise<{ audioBucket: string; audioStoragePath: string }> {
  const supabase = (deps.createClient ?? createSupabaseBrowserClient)()
  const extract = deps.extractAudio ?? extractAudioWav
  const wav = await extract(params.sourceBlob)
  const ticket = await signUpload(supabase, { brandId: params.brandId, sourceAssetId: params.sourceAssetId, target: "audio" })
  await uploadToTicket(supabase, ticket, wav)
  return { audioBucket: ticket.bucket, audioStoragePath: ticket.path }
}

export async function cutAndPersistSection(
  params: CutAndPersistSectionParams,
  deps: ClipClientDeps = {},
): Promise<{ assetId: string }> {
  const { brandId, sourceAssetId, sourceBlob, section, score, quality, captionsEnabled, captionStyle, signal, onStage } =
    params
  const supabase = (deps.createClient ?? createSupabaseBrowserClient)()
  const splice = deps.splice ?? runSingleSourceSpliceInWorker

  const withCaptions = Boolean(captionsEnabled && section.words.length > 0)
  onStage?.("Cutting…")
  const spliced = await splice({
    blob: sourceBlob,
    ranges: section.keepRanges.map((r) => ({ startSec: r.startSec, endSec: r.endSec })),
    maxShortEdgePx: clipQualityToShortEdge(quality ?? DEFAULT_CLIP_QUALITY),
    captionWords: withCaptions
      ? section.words.map((w) => ({ text: w.text, startSec: w.startSec, endSec: w.endSec }))
      : undefined,
    captionStyle: withCaptions ? captionStyle : undefined,
    signal,
  })

  try {
    onStage?.("Uploading…")
    const ticket = await signUpload(supabase, { brandId, sourceAssetId, target: "clip", sectionIndex: section.index })
    await uploadToTicket(supabase, ticket, spliced.blob)

    onStage?.("Saving…")
    const request = registerClipRequestSchema.parse({
      brandId,
      sourceAssetId,
      bucket: ticket.bucket,
      storagePath: ticket.path,
      fileName: `${section.index}.mp4`,
      mimeType: "video/mp4",
      durationSec: spliced.durationSec,
      section,
      transcriptExcerpt: section.transcriptExcerpt,
      score,
    })
    const { data, error } = await supabase.functions.invoke("clip-asset", { body: { action: "register", ...request } })
    if (error) throw new Error(`clip-asset register failed: ${error.message}`)

    const ok = registerClipResponseSchema.safeParse(data)
    if (ok.success) return { assetId: ok.data.assetId }
    const failed = registerClipErrorSchema.safeParse(data)
    throw new Error(failed.success ? failed.data.message : "clip-asset register returned an invalid response")
  } finally {
    if (spliced.objectUrl.startsWith("blob:")) URL.revokeObjectURL(spliced.objectUrl)
  }
}
