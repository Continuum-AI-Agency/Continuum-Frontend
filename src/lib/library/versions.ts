// Browser fetchers for the asset version-history API. uploadNewAssetVersion
// mirrors uploadMediaAsset: sign → PUT the bytes straight to storage via a
// service-signed upload URL (no proxy through Next, so large files clear the
// ~4.5MB serverless body cap) → register the row. Responses are validated
// against the contracts schemas at the boundary.

import {
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
  const query = new URLSearchParams({ brandId: params.brandId, assetId: params.assetId });
  const response = await fetch(`/api/library/versions?${query.toString()}`);
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Loading versions failed'));
  }
  const parsed = listVersionsResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Version list response was malformed');
  return parsed.data.versions;
}

export async function signVersionUpload(
  request: VersionSignUploadRequest,
): Promise<VersionSignUploadResponse> {
  const response = await fetch('/api/library/versions/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Signing the upload failed'));
  }
  const parsed = versionSignUploadResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Sign response was malformed');
  return parsed.data;
}

export async function registerAssetVersion(
  request: RegisterVersionRequest,
): Promise<RegisterVersionResponse> {
  const response = await fetch('/api/library/versions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Registering the version failed'));
  }
  const parsed = registerVersionResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Register response was malformed');
  return parsed.data;
}

export async function rollbackAssetVersion(
  request: RollbackVersionRequest,
): Promise<RegisterVersionResponse> {
  const response = await fetch('/api/library/versions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Rollback failed'));
  }
  const parsed = registerVersionResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Rollback response was malformed');
  return parsed.data;
}

export interface UploadNewAssetVersionDeps {
  createClient?: () => SupabaseBrowserClient;
}

export async function uploadNewAssetVersion(
  params: { brandId: string; assetId: string; file: File; note?: string },
  deps: UploadNewAssetVersionDeps = {},
): Promise<RegisterVersionResponse> {
  const { brandId, assetId, file, note } = params;
  const contentType = file.type || 'application/octet-stream';

  const ticket = await signVersionUpload({
    brandId,
    assetId,
    fileName: file.name,
    mimeType: contentType,
  });

  const supabase = (deps.createClient ?? createSupabaseBrowserClient)();
  const { error } = await supabase.storage
    .from(ticket.bucket)
    .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType });
  if (error) throw new Error(`Upload to storage failed: ${error.message}`);

  return registerAssetVersion({
    brandId,
    assetId,
    bucket: ticket.bucket,
    storagePath: ticket.path,
    fileName: file.name,
    mimeType: contentType,
    sizeBytes: file.size,
    note,
  });
}
