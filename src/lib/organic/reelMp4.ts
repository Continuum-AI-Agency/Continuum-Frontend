import { linkReelMp4ResponseSchema, type LinkReelMp4Response } from "@continuum/contracts"

import { createSupabaseBrowserClient } from "@/lib/supabase/client"

export type FinalizeReelMp4Params = {
  brandId: string
  draftId: string
  /** The mediabunny-stitched MP4, base64-encoded. */
  mp4Base64: string
  durationSec: number
}

/**
 * Persist + link a frontend-stitched reel MP4 via the `link-reel-mp4` edge
 * function. The edge function stores the MP4 in the reel bucket and patches the
 * draft (idempotent per draft). Throws on transport or contract failure so the
 * caller can surface it.
 */
export async function finalizeReelMp4(params: FinalizeReelMp4Params): Promise<LinkReelMp4Response> {
  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase.functions.invoke("link-reel-mp4", {
    body: {
      brandId: params.brandId,
      draftId: params.draftId,
      mp4Base64: params.mp4Base64,
      mimeType: "video/mp4",
      durationSec: params.durationSec,
    },
  })
  if (error) throw error

  const parsed = linkReelMp4ResponseSchema.safeParse(data)
  if (!parsed.success) {
    const message = (data as { message?: unknown } | null)?.message
    throw new Error(typeof message === "string" ? message : "link-reel-mp4 returned an unexpected response")
  }
  return parsed.data
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
