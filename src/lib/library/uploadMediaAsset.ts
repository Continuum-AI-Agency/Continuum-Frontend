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
  type LibraryUploadTicket,
  libraryUploadTicketSchema,
  registerMediaErrorSchema,
  registerMediaResponseSchema,
} from '@continuum/contracts';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { attachVideoPoster } from './videoPoster';

type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;

export const MEDIA_LIBRARY_BUCKET = 'media-library';

// Browsers report source-project files (.aep) with an empty MIME; the edge fn
// requires a non-empty one and derives kind 'file' for non-image/video.
const FALLBACK_MIME_TYPE = 'application/octet-stream';

function resolveMimeType(file: File): string {
  return file.type || FALLBACK_MIME_TYPE;
}

// sha256 hex of the file bytes, sent as `checksum` on register. Seeds the
// future creative-DNA join against paid_media.content_hash. Fail-soft: a
// digest failure (e.g. a file too large to buffer) never blocks the upload.
async function computeChecksum(file: File): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  } catch {
    return null;
  }
}

export interface UploadMediaAssetResult {
  assetId: string;
  storagePath: string;
  signedUrl: string;
  /** Storage path of the generated poster; null for images and for videos whose poster failed. */
  thumbnailPath: string | null;
}

export interface UploadMediaAssetDeps {
  createClient?: () => SupabaseBrowserClient;
  /** Injected for tests; decodes a frame in the browser and persists it. */
  attachPoster?: typeof attachVideoPoster;
}

// supabase-js wraps a non-2xx edge response in a FunctionsHttpError whose
// `.context` is the raw Response. Pull the edge fn's `{ message }` body out of it
// so the thrown error reflects the real server reason, not "non-2xx status code".
async function extractServerMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return null;
  try {
    const body = (await context.clone().json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : null;
  } catch {
    return null;
  }
}

async function invokeLibraryUpload(
  supabase: SupabaseBrowserClient,
  body: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke('library-upload', { body });
  if (!error) return data;
  const serverMessage = await extractServerMessage(error);
  throw new Error(serverMessage ?? error.message ?? 'library-upload request failed');
}

async function signUpload(
  supabase: SupabaseBrowserClient,
  body: { brandId: string; fileName: string; mimeType: string },
): Promise<LibraryUploadTicket> {
  const data = await invokeLibraryUpload(supabase, { action: 'sign_upload', ...body });
  const parsed = libraryUploadTicketSchema.safeParse(data);
  if (!parsed.success) throw new Error('library-upload returned an invalid upload ticket');
  return parsed.data;
}

async function uploadToTicket(
  supabase: SupabaseBrowserClient,
  ticket: LibraryUploadTicket,
  file: File,
): Promise<void> {
  const { error } = await supabase.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, file, {
      contentType: resolveMimeType(file),
    });
  if (error) throw new Error(`upload to storage failed: ${error.message}`);
}

export async function uploadMediaAsset(
  params: { file: File; brandId: string },
  deps: UploadMediaAssetDeps = {},
): Promise<UploadMediaAssetResult> {
  const supabase = (deps.createClient ?? createSupabaseBrowserClient)();
  const { file, brandId } = params;
  const mimeType = resolveMimeType(file);

  const ticket = await signUpload(supabase, { brandId, fileName: file.name, mimeType });
  await uploadToTicket(supabase, ticket, file);

  const checksum = await computeChecksum(file);
  const data = await invokeLibraryUpload(supabase, {
    action: 'register',
    brandId,
    assetId: ticket.assetId,
    bucket: ticket.bucket,
    storagePath: ticket.path,
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
    ...(checksum ? { checksum } : {}),
  });

  const ok = registerMediaResponseSchema.safeParse(data);
  if (ok.success) {
    // The poster rides on top of an upload that has ALREADY succeeded: the row
    // exists and the analysis pipeline is running. So a poster failure of any
    // kind — decode, encode, network, an unexpected throw from an injected dep —
    // must never surface as a failed upload.
    const thumbnailPath = await (deps.attachPoster ?? attachVideoPoster)({
      file,
      mimeType,
      brandId,
      assetId: ok.data.assetId,
    }).catch((error: unknown) => {
      console.warn('[library/uploadMediaAsset] poster step failed', error);
      return null;
    });
    return {
      assetId: ok.data.assetId,
      storagePath: ok.data.storagePath,
      signedUrl: ok.data.signedUrl,
      thumbnailPath,
    };
  }
  const failed = registerMediaErrorSchema.safeParse(data);
  throw new Error(
    failed.success ? failed.data.message : 'library-upload register returned an invalid response',
  );
}
