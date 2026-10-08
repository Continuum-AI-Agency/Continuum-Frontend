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
  type AssetPreviewState,
  classifyLibraryFileOrGeneric,
  completeMcpUploadIntentRequestSchema,
  completeMcpUploadIntentResponseSchema,
  LIBRARY_LONG_RECORDING_SEC,
  LIBRARY_UPLOAD_MAX_BYTES,
  type LibraryUploadTicket,
  libraryUploadRefusal,
  libraryUploadTicketSchema,
  type PinnedLibraryImageRef,
  registerMediaErrorSchema,
  registerMediaResponseSchema,
} from '@continuum/contracts';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { attachAssetPreview } from './assetPreview';
import { requestLibraryPreviewProxy } from './previewProxy';
import {
  type ResumableUploadProgress,
  resumableStorageUpload,
  TUS_CHUNK_SIZE_BYTES,
} from './resumableStorageUpload';
import { type attachVideoPoster, isVideoMimeType, probeMediaDurationSec } from './videoPoster';

export type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;

export const MEDIA_LIBRARY_BUCKET = 'media-library';

// Browsers report source-project files (.aep) with an empty MIME; the edge fn
// requires a non-empty one and derives kind 'file' for non-image/video.
const FALLBACK_MIME_TYPE = 'application/octet-stream';
const MAX_BUFFERED_CHECKSUM_BYTES = 64 * 1024 * 1024;

// The Supabase project-GLOBAL storage upload limit, from the contracts registry (measured
// there). Storage's own 413 is mapped to the same sentence below regardless.
export const LIBRARY_EFFECTIVE_UPLOAD_CAP_BYTES = LIBRARY_UPLOAD_MAX_BYTES;

const BYTES_PER_MB = 1024 * 1024;

export function uploadTooLargeMessage(file: { name: string; size: number }): string {
  const sizeMb = (file.size / BYTES_PER_MB).toFixed(1).replace(/\.0$/, '');
  const capMb = LIBRARY_EFFECTIVE_UPLOAD_CAP_BYTES / BYTES_PER_MB;
  return `${file.name} is ${sizeMb} MB — uploads are capped at ${capMb} MB right now.`;
}

/**
 * The refusal to show before any network call, or null: the Storage cap, the forge's
 * project-file cap, or a font (which belongs in the brand font store).
 */
export function uploadSizeRefusal(file: {
  name: string;
  size: number;
  type?: string;
}): string | null {
  return libraryUploadRefusal({ fileName: file.name, mimeType: file.type, sizeBytes: file.size });
}

// Storage says "The object exceeded the maximum allowed size" on a signed PUT
// and a bare 413 on TUS; both mean the cap above, so both read as that sentence.
function isStorageSizeRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /exceeded the maximum allowed size|\(413\)/i.test(message);
}

function resolveMimeType(file: File): string {
  return file.type || FALLBACK_MIME_TYPE;
}

// sha256 hex of the file bytes, sent as `checksum` on register. Seeds the
// future creative-DNA join against paid_media.content_hash, and is what a
// re-dropped file is matched on (findExistingAssetByContent). Fail-soft: a
// digest failure (e.g. a file too large to buffer) never blocks the upload.
export async function computeChecksum(file: File): Promise<string | null> {
  if (file.size > MAX_BUFFERED_CHECKSUM_BYTES) return null;
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
  versionId: string;
  previewState: AssetPreviewState;
  /** Container duration, including WebM recordings whose HTML duration is infinite. */
  durationSec?: number;
}

export interface UploadMediaAssetDeps {
  createClient?: () => SupabaseBrowserClient;
  /** Injected for tests; decodes a frame in the browser and persists it. */
  attachPoster?: typeof attachVideoPoster;
  attachPreview?: typeof attachAssetPreview;
  probeDuration?: typeof probeMediaDurationSec;
  requestServerPreview?: typeof requestLibraryPreviewProxy;
  resumableUpload?: typeof resumableStorageUpload;
  supabaseUrl?: string;
  anonKey?: string;
  /** Where a resumable upload remembers itself across a reload; null turns it off. */
  resumeStore?: ResumeStore | null;
}

type ResumeStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// A resumable upload survives a reload or a closed tab: its ticket and TUS URL are kept
// under the file's fingerprint, so choosing the same file again continues from Storage's
// offset instead of byte 0. Two hours is the life of the signed upload ticket. Best effort
// throughout — no storage (private window, quota) just means a fresh upload.
const RESUME_KEY_PREFIX = 'continuum:library-upload-resume:';
const RESUME_TTL_MS = 2 * 60 * 60 * 1000;

export function uploadResumeKey(brandId: string, file: File): string {
  return `${RESUME_KEY_PREFIX}${brandId}:${file.name}:${file.size}:${file.lastModified}`;
}

function defaultResumeStore(): ResumeStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readSavedResume(
  store: ResumeStore | null,
  key: string,
  now = Date.now(),
): UploadResumeState | null {
  try {
    const raw = store?.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { ticket?: unknown; uploadUrl?: unknown; savedAt?: unknown };
    const ticket = libraryUploadTicketSchema.safeParse(saved.ticket);
    const fresh = typeof saved.savedAt === 'number' && now - saved.savedAt < RESUME_TTL_MS;
    if (!ticket.success || !fresh || typeof saved.uploadUrl !== 'string') {
      store?.removeItem(key);
      return null;
    }
    return { ticket: ticket.data, uploadUrl: saved.uploadUrl };
  } catch {
    return null;
  }
}

function saveResume(store: ResumeStore | null, key: string, state: UploadResumeState): void {
  if (!state.uploadUrl) return;
  try {
    store?.setItem(key, JSON.stringify({ ...state, savedAt: Date.now() }));
  } catch {
    // Quota or a private window: the upload still runs, it just cannot outlive the page.
  }
}

function forgetResume(store: ResumeStore | null, key: string): void {
  try {
    store?.removeItem(key);
  } catch {}
}

export type UploadResumeState = {
  ticket: LibraryUploadTicket;
  uploadUrl: string | null;
};

export type UploadMediaAssetParams = {
  file: File;
  brandId: string;
  templateVariantOf?: string;
  signal?: AbortSignal;
  resume?: UploadResumeState | null;
  onResumeState?: (state: UploadResumeState) => void;
  onProgress?: (progress: ResumableUploadProgress) => void;
};

export async function completeMcpUploadIntent(
  params: {
    brandId: string;
    uploadIntentId: string;
    assetRefs: PinnedLibraryImageRef[];
  },
  deps: Pick<UploadMediaAssetDeps, 'createClient'> = {},
) {
  const request = completeMcpUploadIntentRequestSchema.parse({
    action: 'complete_mcp_upload_intent',
    brandId: params.brandId,
    uploadIntentId: params.uploadIntentId,
    assetRefs: params.assetRefs,
  });
  const supabase = (deps.createClient ?? createSupabaseBrowserClient)();
  const data = await invokeLibraryUpload(supabase, request);
  const parsed = completeMcpUploadIntentResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('library-upload returned an invalid MCP upload-intent receipt');
  }
  return parsed.data;
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

/** A service-role signed upload ticket for a new library object. Exported so
 *  generated media (canvas composites, creative-ops results) can take the same
 *  route to storage without also inheriting `register`'s `source:"upload"` row. */
export async function signLibraryUpload(
  supabase: SupabaseBrowserClient,
  body: { brandId: string; fileName: string; mimeType: string; sizeBytes?: number },
): Promise<LibraryUploadTicket> {
  const data = await invokeLibraryUpload(supabase, { action: 'sign_upload', ...body });
  const parsed = libraryUploadTicketSchema.safeParse(data);
  if (!parsed.success) throw new Error('library-upload returned an invalid upload ticket');
  return parsed.data;
}

/** PUT the bytes straight to storage against a signed ticket. */
export async function uploadToLibraryTicket(
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

function isProjectFile(file: File): boolean {
  return (
    classifyLibraryFileOrGeneric({ fileName: file.name, mimeType: file.type }).originalKind ===
    'file'
  );
}

// TUS: chunked, resumable after a pause or a dropped connection. Used for
// project files and for any file bigger than one chunk; smaller files go in one PUT.
function isResumableUpload(file: File): boolean {
  return isProjectFile(file) || file.size > TUS_CHUNK_SIZE_BYTES;
}

async function uploadResumable(
  supabase: SupabaseBrowserClient,
  ticket: LibraryUploadTicket,
  params: UploadMediaAssetParams,
  deps: UploadMediaAssetDeps,
): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? 'A signed-in session is required for resumable upload');
  }
  const supabaseUrl = deps.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for resumable upload');

  await (deps.resumableUpload ?? resumableStorageUpload)({
    file: params.file,
    bucket: ticket.bucket,
    objectPath: ticket.path,
    accessToken: data.session.access_token,
    supabaseUrl,
    anonKey: deps.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    uploadUrl: params.resume?.uploadUrl,
    signal: params.signal,
    onUploadUrl: (uploadUrl) => params.onResumeState?.({ ticket, uploadUrl }),
    onProgress: params.onProgress,
  });
}

export async function uploadMediaAsset(
  params: UploadMediaAssetParams,
  deps: UploadMediaAssetDeps = {},
): Promise<UploadMediaAssetResult> {
  const supabase = (deps.createClient ?? createSupabaseBrowserClient)();
  const { file, brandId } = params;
  const mimeType = resolveMimeType(file);
  const refusal = uploadSizeRefusal(file);
  if (refusal) throw new Error(refusal);

  const resumeStore = deps.resumeStore === undefined ? defaultResumeStore() : deps.resumeStore;
  const resumeKey = uploadResumeKey(brandId, file);
  const resume = params.resume ?? readSavedResume(resumeStore, resumeKey);
  const ticket =
    resume?.ticket ??
    (await signLibraryUpload(supabase, {
      brandId,
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
    }));
  params.onResumeState?.({ ticket, uploadUrl: resume?.uploadUrl ?? null });
  try {
    if (isResumableUpload(file)) {
      await uploadResumable(
        supabase,
        ticket,
        {
          ...params,
          resume,
          onResumeState: (state) => {
            saveResume(resumeStore, resumeKey, state);
            params.onResumeState?.(state);
          },
        },
        deps,
      );
    } else {
      await uploadToLibraryTicket(supabase, ticket, file);
      params.onProgress?.({ uploadedBytes: file.size, totalBytes: file.size, percentage: 100 });
    }
  } catch (error) {
    if (isStorageSizeRefusal(error)) throw new Error(uploadTooLargeMessage(file), { cause: error });
    throw error;
  }

  const checksum = await computeChecksum(file);
  const integrityState = checksum
    ? 'verified'
    : file.size > MAX_BUFFERED_CHECKSUM_BYTES
      ? 'skipped_large_file'
      : 'unknown';
  // Read before register because register is what enqueues analysis, and analysis
  // needs the duration to decide whether this is long-form. Video and audio, and never
  // fatal: a null just leaves analyze_media without that signal.
  const durationSec =
    isVideoMimeType(mimeType) || mimeType.startsWith('audio/')
      ? await (deps.probeDuration ?? probeMediaDurationSec)(file)
      : null;

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
    integrityState,
    ...(params.templateVariantOf ? { templateVariantOf: params.templateVariantOf } : {}),
    ...(durationSec === null ? {} : { durationSec }),
  });

  const ok = registerMediaResponseSchema.safeParse(data);
  if (ok.success) {
    forgetResume(resumeStore, resumeKey);
    // A recording past analyze_media's budget is transcribed on the server (chunked through
    // Continuum-Render), which the server preview starts. Videos always reach it through
    // their preview; a browser-playable recording needs no preview, so it is asked here.
    if (
      mimeType.startsWith('audio/') &&
      durationSec !== null &&
      durationSec > LIBRARY_LONG_RECORDING_SEC
    ) {
      void (deps.requestServerPreview ?? requestLibraryPreviewProxy)({
        brandId,
        assetId: ok.data.assetId,
        assetVersionId: ok.data.versionId,
      }).catch((error: unknown) => {
        console.warn(
          '[library/uploadMediaAsset] long-recording transcription request failed',
          error,
        );
      });
    }
    // The poster rides on top of an upload that has ALREADY succeeded: the row
    // exists and the analysis pipeline is running. So a poster failure of any
    // kind — decode, encode, network, an unexpected throw from an injected dep —
    // must never surface as a failed upload.
    let thumbnailPath: string | null = null;
    const previewState = await (deps.attachPoster
      ? deps.attachPoster({ file, mimeType, brandId, assetId: ok.data.assetId }).then((path) => {
          thumbnailPath = path;
          return (path ? 'ready' : 'failed') as AssetPreviewState;
        })
      : (deps.attachPreview ?? attachAssetPreview)({
          file,
          brandId,
          assetId: ok.data.assetId,
          assetVersionId: ok.data.versionId,
          client: supabase,
        })
    ).catch((error: unknown) => {
      console.warn('[library/uploadMediaAsset] preview step failed', error);
      return 'failed' as const;
    });
    return {
      assetId: ok.data.assetId,
      versionId: ok.data.versionId,
      storagePath: ok.data.storagePath,
      signedUrl: ok.data.signedUrl,
      thumbnailPath,
      previewState,
      ...(durationSec === null ? {} : { durationSec }),
    };
  }
  const failed = registerMediaErrorSchema.safeParse(data);
  throw new Error(
    failed.success ? failed.data.message : 'library-upload register returned an invalid response',
  );
}
