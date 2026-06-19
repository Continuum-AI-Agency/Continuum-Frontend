// Uploads a locally-selected/dropped creative to durable storage and returns a
// schema-valid MediaAsset ready to place into an organic draft via
// useDraftMediaPlacement. Mirrors StudioCanvas/utils/uploadReferenceFile.ts (the
// canvas equivalent) but writes into a draft instead of a canvas node.
//
// Flow: POST /api/library/upload (registers into media.assets, source "upload")
// → POST /api/library/sign (mint a signed URL) → synthesize a MediaAsset. Deps
// are injected so the orchestration is testable without the network.

import { mediaAssetSchema, type MediaAsset } from "@continuum/contracts"

// Uploads reuse the media-library route, so a dropped creative also becomes a
// browsable library asset.
export const DRAFT_UPLOAD_BUCKET = "media-library"

export type UploadStatus = "processing" | "ready" | "error"

export interface UploadDraftCreativeDeps {
  upload?: (file: File, brandId: string) => Promise<{ assetId: string; storagePath: string }>
  sign?: (brandId: string, assetId: string) => Promise<{ signedUrl: string }>
  // Called as each file moves through its lifecycle; `index` is its position in a
  // multi-file batch (0 for the single-file path).
  onStatus?: (status: UploadStatus, index: number) => void
}

async function defaultUpload(file: File, brandId: string): Promise<{ assetId: string; storagePath: string }> {
  const form = new FormData()
  form.append("file", file)
  form.append("brandId", brandId)
  const resp = await fetch("/api/library/upload", { method: "POST", body: form })
  if (!resp.ok) throw new Error(`draft creative upload failed (${resp.status})`)
  return (await resp.json()) as { assetId: string; storagePath: string }
}

async function defaultSign(brandId: string, assetId: string): Promise<{ signedUrl: string }> {
  const resp = await fetch("/api/library/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brandId, assetId }),
  })
  if (!resp.ok) throw new Error(`draft creative sign failed (${resp.status})`)
  return (await resp.json()) as { signedUrl: string }
}

function synthesizeAsset(params: {
  assetId: string
  storagePath: string
  signedUrl: string
  file: File
  brandId: string
}): MediaAsset {
  const now = new Date().toISOString()
  return mediaAssetSchema.parse({
    id: params.assetId,
    brandId: params.brandId,
    kind: params.file.type.startsWith("video/") ? "video" : "image",
    bucket: DRAFT_UPLOAD_BUCKET,
    storagePath: params.storagePath,
    fileName: params.file.name || "upload",
    mimeType: params.file.type || "application/octet-stream",
    source: "upload",
    status: "stored",
    tags: [],
    detectedObjects: [],
    hasImageEmbedding: false,
    createdAt: now,
    updatedAt: now,
    signedUrl: params.signedUrl,
  })
}

async function uploadOne(
  file: File,
  brandId: string,
  index: number,
  deps: UploadDraftCreativeDeps,
): Promise<MediaAsset | null> {
  const upload = deps.upload ?? defaultUpload
  const sign = deps.sign ?? defaultSign
  deps.onStatus?.("processing", index)
  try {
    const { assetId, storagePath } = await upload(file, brandId)
    const { signedUrl } = await sign(brandId, assetId)
    const asset = synthesizeAsset({ assetId, storagePath, signedUrl, file, brandId })
    deps.onStatus?.("ready", index)
    return asset
  } catch (err) {
    console.warn("[organic] uploadDraftCreative failed", err)
    deps.onStatus?.("error", index)
    return null
  }
}

export async function uploadDraftCreative(
  params: { file: File; brandId: string },
  deps: UploadDraftCreativeDeps = {},
): Promise<MediaAsset | null> {
  return uploadOne(params.file, params.brandId, 0, deps)
}

/** Upload many files concurrently; returns the successes in input order. */
export async function uploadDraftCreatives(
  params: { files: File[]; brandId: string },
  deps: UploadDraftCreativeDeps = {},
): Promise<MediaAsset[]> {
  const results = await Promise.all(
    params.files.map((file, index) => uploadOne(file, params.brandId, index, deps)),
  )
  return results.filter((asset): asset is MediaAsset => asset !== null)
}
