// Browser fetchers for the asset version-history API. uploadNewAssetVersion
// mirrors uploadMediaAsset: sign → PUT the bytes straight to storage via a
// service-signed upload URL (no proxy through Next, so large files clear the
// ~4.5MB serverless body cap) → register the row. Responses are validated
// against the contracts schemas at the boundary.

import {
  classifyLibraryFile,
  listVersionsResponseSchema,
  type MediaAssetVersion,
  type RegisterVersionRequest,
  type RegisterVersionResponse,
  type RollbackVersionRequest,
  registerVersionResponseSchema,
  type VersionSignUploadRequest,
  type VersionSignUploadResponse,
  versionSignUploadResponseSchema,
} from '@continuum/contracts';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  listAssetVersions as listAssetVersionsOperation,
  registerAssetVersion as registerAssetVersionOperation,
  rollbackAssetVersion as rollbackAssetVersionOperation,
  signVersionUpload as signVersionUploadOperation,
} from './creativeOperations';
import { type ResumableUploadProgress, resumableStorageUpload } from './resumableStorageUpload';
import { MAX_PROJECT_FILE_BYTES } from './uploadMediaAsset';
import { attachAssetPreview } from './assetPreview';

type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>;

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.length > 0) return body.error;
  } catch {
    // Non-JSON error body — fall through to the generic message.
  }
  return `${fallback} (${response.status})`;
}

export async function listAssetVersions(params: {
  brandId: string;
  assetId: string;
}): Promise<MediaAssetVersion[]> {
  const result = await listAssetVersionsOperation(createSupabaseBrowserClient(), params);
  return listVersionsResponseSchema.parse(result).versions;
}

export async function signVersionUpload(
  request: VersionSignUploadRequest,
): Promise<VersionSignUploadResponse> {
  const result = await signVersionUploadOperation(createSupabaseBrowserClient(), request);
  return versionSignUploadResponseSchema.parse(result);
}

export async function registerAssetVersion(
  request: RegisterVersionRequest,
): Promise<RegisterVersionResponse> {
  const result = await registerAssetVersionOperation(createSupabaseBrowserClient(), {
    ...request,
    idempotencyKey: request.idempotencyKey ?? crypto.randomUUID(),
  });
  return registerVersionResponseSchema.parse(result);
}

export async function rollbackAssetVersion(
  request: RollbackVersionRequest,
): Promise<RegisterVersionResponse> {
  const result = await rollbackAssetVersionOperation(createSupabaseBrowserClient(), {
    ...request,
    idempotencyKey: request.idempotencyKey ?? crypto.randomUUID(),
  });
  return registerVersionResponseSchema.parse(result);
}

export interface UploadNewAssetVersionDeps {
  createClient?: () => SupabaseBrowserClient;
  signUpload?: typeof signVersionUpload;
  registerVersion?: typeof registerAssetVersion;
  resumableUpload?: typeof resumableStorageUpload;
  supabaseUrl?: string;
  anonKey?: string;
  attachPreview?: typeof attachAssetPreview;
}

export type VersionUploadResumeState = {
  ticket: VersionSignUploadResponse;
  uploadUrl: string | null;
};

function isProjectFile(file: File): boolean {
  const format = classifyLibraryFile({ fileName: file.name, mimeType: file.type });
  return format.accepted && format.originalKind === 'file';
}

async function uploadProjectVersion(params: {
  supabase: SupabaseBrowserClient;
  ticket: VersionSignUploadResponse;
  file: File;
  resume: VersionUploadResumeState | null;
  signal?: AbortSignal;
  onResumeState?: (state: VersionUploadResumeState) => void;
  onProgress?: (progress: ResumableUploadProgress) => void;
  deps: UploadNewAssetVersionDeps;
}): Promise<void> {
  const { data, error } = await params.supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? 'A signed-in session is required for resumable upload');
  }
  const supabaseUrl = params.deps.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for resumable upload');
  await (params.deps.resumableUpload ?? resumableStorageUpload)({
    file: params.file,
    bucket: params.ticket.bucket,
    objectPath: params.ticket.path,
    accessToken: data.session.access_token,
    supabaseUrl,
    anonKey: params.deps.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    uploadUrl: params.resume?.uploadUrl,
    signal: params.signal,
    onUploadUrl: (uploadUrl) => params.onResumeState?.({ ticket: params.ticket, uploadUrl }),
    onProgress: params.onProgress,
  });
}

export async function uploadNewAssetVersion(
  params: {
    brandId: string;
    assetId: string;
    file: File;
    note?: string;
    resume?: VersionUploadResumeState | null;
    signal?: AbortSignal;
    onResumeState?: (state: VersionUploadResumeState) => void;
    onProgress?: (progress: ResumableUploadProgress) => void;
  },
  deps: UploadNewAssetVersionDeps = {},
): Promise<RegisterVersionResponse> {
  const { brandId, assetId, file, note } = params;
  const contentType = file.type || 'application/octet-stream';
  const projectFile = isProjectFile(file);
  if (projectFile && file.size > MAX_PROJECT_FILE_BYTES) {
    throw new Error('file_too_large: Project files must be 5 GB or smaller');
  }

  const ticket =
    params.resume?.ticket ??
    (await (deps.signUpload ?? signVersionUpload)({
      brandId,
      assetId,
      fileName: file.name,
      mimeType: contentType,
    }));
  params.onResumeState?.({ ticket, uploadUrl: params.resume?.uploadUrl ?? null });

  const supabase = (deps.createClient ?? createSupabaseBrowserClient)();
  if (projectFile) {
    await uploadProjectVersion({
      supabase,
      ticket,
      file,
      resume: params.resume ?? null,
      signal: params.signal,
      onResumeState: params.onResumeState,
      onProgress: params.onProgress,
      deps,
    });
  } else {
    const { error } = await supabase.storage
      .from(ticket.bucket)
      .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType });
    if (error) throw new Error(`Upload to storage failed: ${error.message}`);
    params.onProgress?.({ uploadedBytes: file.size, totalBytes: file.size, percentage: 100 });
  }

  const registered = await (deps.registerVersion ?? registerAssetVersion)({
    brandId,
    assetId,
    bucket: ticket.bucket,
    storagePath: ticket.path,
    fileName: file.name,
    mimeType: contentType,
    sizeBytes: file.size,
    note,
    integrityState:
      projectFile && file.size > 64 * 1024 * 1024 ? 'skipped_large_file' : 'unknown',
    idempotencyKey: `version:${assetId}:${ticket.path}`,
  });
  if (registered.versionId) {
    await (deps.attachPreview ?? attachAssetPreview)({
      file,
      brandId,
      assetId,
      assetVersionId: registered.versionId,
      client: supabase,
    }).catch((error: unknown) => {
      console.warn('[library/versions] preview step failed', error);
      return 'failed' as const;
    });
  }
  return registered;
}
