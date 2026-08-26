// Pure row-level helpers for the asset version history: DB row shape,
// snake→camel mapping to the contracts MediaAssetVersion, version-number
// arithmetic, and the insert/update payload builders shared by the
// /api/library/versions routes. Kept free of server-only imports so the
// logic is unit-testable.

import {
  type MediaAssetVersion,
  mediaAssetVersionSchema,
  type RegisterVersionRequest,
} from '@continuum/contracts';
import { sanitizeStorageFileName } from '@/lib/storage/sanitize';

export type AssetVersionRow = {
  id: string;
  brand_id: string;
  asset_id: string;
  version_number: number;
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  checksum: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export const ASSET_VERSION_SELECT =
  'id, brand_id, asset_id, version_number, bucket, storage_path, file_name, mime_type, ' +
  'size_bytes, width, height, duration_ms, checksum, note, created_by, created_at';

// File columns the head row (media.assets) shares with a version row.
export type VersionFileColumns = {
  bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  checksum: string | null;
};

export type VersionInsertRow = VersionFileColumns & {
  brand_id: string;
  asset_id: string;
  version_number: number;
  note: string | null;
  created_by: string | null;
};

// The head row is implicitly v1 until history exists, so an asset with no
// version rows uploads its next file as v2.
export function nextVersionNumber(maxExisting: number | null): number {
  return (maxExisting ?? 1) + 1;
}

export function buildVersionStoragePath(params: {
  brandId: string;
  assetId: string;
  versionNumber: number;
  fileName: string;
}): string {
  const sanitized = sanitizeStorageFileName(params.fileName);
  return `${params.brandId}/${params.assetId}/v${params.versionNumber}/${sanitized}`;
}

export function isHeadVersion(
  row: Pick<AssetVersionRow, 'bucket' | 'storage_path'>,
  head: { bucket: string; storage_path: string },
): boolean {
  return row.bucket === head.bucket && row.storage_path === head.storage_path;
}

// Lazy v1 backfill: the first versioned upload archives the head's current
// file so history starts at the file the asset was created with.
export function buildBackfillV1Row(
  head: VersionFileColumns & { id: string; brand_id: string; created_by: string | null },
): VersionInsertRow {
  return {
    brand_id: head.brand_id,
    asset_id: head.id,
    version_number: 1,
    bucket: head.bucket,
    storage_path: head.storage_path,
    file_name: head.file_name,
    mime_type: head.mime_type,
    size_bytes: head.size_bytes,
    width: head.width,
    height: head.height,
    duration_ms: head.duration_ms,
    checksum: head.checksum,
    note: null,
    created_by: head.created_by,
  };
}

// The register call carries a client-supplied bucket + storage_path, and the
// head row it promotes is what every later signed URL is minted from. Without
// this guard a member could point their own asset's head at another brand's
// object and have the server hand them signed URLs for it. The sign step always
// mints <brandId>/<assetId>/v<n>/<file> inside the asset's own bucket, so
// anything else is a forged location.
export function isOwnedVersionLocation(
  location: { bucket: string; storagePath: string },
  owner: { brandId: string; assetId: string; bucket: string },
): boolean {
  if (location.bucket !== owner.bucket) return false;
  return location.storagePath.startsWith(`${owner.brandId}/${owner.assetId}/`);
}

// Dimensions/duration come from the browser's own decode of the file when it
// could read them; checksum stays server-side territory (the client cannot
// attest integrity for a forged location anyway — the sign step pins the path).
export function buildRegisterRow(
  request: RegisterVersionRequest,
  params: { versionNumber: number; createdBy: string },
): VersionInsertRow {
  return {
    brand_id: request.brandId,
    asset_id: request.assetId,
    version_number: params.versionNumber,
    bucket: request.bucket,
    storage_path: request.storagePath,
    file_name: request.fileName,
    mime_type: request.mimeType,
    size_bytes: request.sizeBytes,
    width: request.width ?? null,
    height: request.height ?? null,
    duration_ms: request.durationMs ?? null,
    checksum: null,
    note: request.note ?? null,
    created_by: params.createdBy,
  };
}

// Rolling back never rewrites history: the promoted file is appended as a new
// version row that copies the target's file columns.
export function buildRollbackRow(
  target: AssetVersionRow,
  params: { versionNumber: number; createdBy: string },
): VersionInsertRow {
  return {
    brand_id: target.brand_id,
    asset_id: target.asset_id,
    version_number: params.versionNumber,
    bucket: target.bucket,
    storage_path: target.storage_path,
    file_name: target.file_name,
    mime_type: target.mime_type,
    size_bytes: target.size_bytes,
    width: target.width,
    height: target.height,
    duration_ms: target.duration_ms,
    checksum: target.checksum,
    note: `Rolled back to v${target.version_number}`,
    created_by: params.createdBy,
  };
}

// The promoted head mirrors the registered version's geometry so the grid and
// signed-URL consumers keep seeing real dimensions instead of regressing to
// nulls every time a new version lands.
export function headUpdateFromRegister(request: RegisterVersionRequest): VersionFileColumns {
  return {
    bucket: request.bucket,
    storage_path: request.storagePath,
    file_name: request.fileName,
    mime_type: request.mimeType,
    size_bytes: request.sizeBytes,
    width: request.width ?? null,
    height: request.height ?? null,
    duration_ms: request.durationMs ?? null,
    checksum: null,
  };
}

export function headUpdateFromVersion(version: AssetVersionRow): VersionFileColumns {
  return {
    bucket: version.bucket,
    storage_path: version.storage_path,
    file_name: version.file_name,
    mime_type: version.mime_type,
    size_bytes: version.size_bytes,
    width: version.width,
    height: version.height,
    duration_ms: version.duration_ms,
    checksum: version.checksum,
  };
}

export function versionRowToContract(
  row: AssetVersionRow,
  extras: { signedUrl: string | null; authorName: string | null; isHead: boolean },
): MediaAssetVersion {
  return mediaAssetVersionSchema.parse({
    id: row.id,
    brandId: row.brand_id,
    assetId: row.asset_id,
    versionNumber: row.version_number,
    bucket: row.bucket,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    checksum: row.checksum,
    note: row.note,
    createdBy: row.created_by,
    authorName: extras.authorName,
    signedUrl: extras.signedUrl,
    isHead: extras.isHead,
    createdAt: row.created_at,
  });
}
