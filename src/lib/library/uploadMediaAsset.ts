// Browser orchestration for uploading a local image/video into the media
// library. Mirrors src/lib/clips/clipClientCut.ts: it asks the library-upload
// edge fn for a service-role signed upload URL, PUTs the bytes straight to the
// media-library bucket (no proxy through Next/Vercel — whose ~4.5MB serverless
// body cap broke large uploads), then registers the media.assets row and gets a
// fresh signed download URL back. Replaces the /api/library/upload route, so the
// service-role key no longer needs to live in the Vercel frontend env.
//
// Errors carry the edge fn's structured message so callers can surface the real
// reason (e.g. on a node's hover badge). Deps are injected for testability.

import {
  libraryUploadTicketSchema,
  registerMediaErrorSchema,
  registerMediaResponseSchema,
  type LibraryUploadTicket,
} from "@continuum/contracts"

import { createSupabaseBrowserClient } from "@/lib/supabase/client"

type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>

export const MEDIA_LIBRARY_BUCKET = "media-library"

export interface UploadMediaAssetResult {
  assetId: string
  storagePath: string
  signedUrl: string
}

export interface UploadMediaAssetDeps {
  createClient?: () => SupabaseBrowserClient
}

// supabase-js wraps a non-2xx edge response in a FunctionsHttpError whose
// `.context` is the raw Response. Pull the edge fn's `{ message }` body out of it
// so the thrown error reflects the real server reason, not "non-2xx status code".
async function extractServerMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown } | null)?.context
  if (!(context instanceof Response)) return null
  try {
    const body = (await context.clone().json()) as { message?: unknown }
    return typeof body.message === "string" ? body.message : null
  } catch {
    return null
  }
}

async function invokeLibraryUpload(supabase: SupabaseBrowserClient, body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("library-upload", { body })
  if (!error) return data
  const serverMessage = await extractServerMessage(error)
  throw new Error(serverMessage ?? error.message ?? "library-upload request failed")
}

async function signUpload(
  supabase: SupabaseBrowserClient,
  body: { brandId: string; fileName: string; mimeType: string },
): Promise<LibraryUploadTicket> {
  const data = await invokeLibraryUpload(supabase, { action: "sign_upload", ...body })
  const parsed = libraryUploadTicketSchema.safeParse(data)
  if (!parsed.success) throw new Error("library-upload returned an invalid upload ticket")
  return parsed.data
}

async function uploadToTicket(
  supabase: SupabaseBrowserClient,
  ticket: LibraryUploadTicket,
  file: File,
): Promise<void> {
  const { error } = await supabase.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type || "application/octet-stream" })
  if (error) throw new Error(`upload to storage failed: ${error.message}`)
}

export async function uploadMediaAsset(
  params: { file: File; brandId: string },
  deps: UploadMediaAssetDeps = {},
): Promise<UploadMediaAssetResult> {
  const supabase = (deps.createClient ?? createSupabaseBrowserClient)()
  const { file, brandId } = params

  const ticket = await signUpload(supabase, { brandId, fileName: file.name, mimeType: file.type })
  await uploadToTicket(supabase, ticket, file)

  const data = await invokeLibraryUpload(supabase, {
    action: "register",
    brandId,
    assetId: ticket.assetId,
    bucket: ticket.bucket,
    storagePath: ticket.path,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  })

  const ok = registerMediaResponseSchema.safeParse(data)
  if (ok.success) {
    return { assetId: ok.data.assetId, storagePath: ok.data.storagePath, signedUrl: ok.data.signedUrl }
  }
  const failed = registerMediaErrorSchema.safeParse(data)
  throw new Error(failed.success ? failed.data.message : "library-upload register returned an invalid response")
}
