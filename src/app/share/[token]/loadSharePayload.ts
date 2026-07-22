// Anonymous share-token resolution for /share/[token]. No caller auth: the
// token IS the credential. media.share_links is deny-all RLS and the target
// buckets are private, so everything here runs on the admin client and only
// short-lived signed URLs ever reach the visitor.

import 'server-only';

import type { PublicShareAsset, PublicSharePayload } from '@continuum/contracts';
import { rowToShareLink, type ShareLinkRow, shareLinkStatus } from '@/lib/library/shareValidation';
import { buildCarousel, carouselSignablePaths } from '@/lib/media/carousel';
import { rowToSignedMediaAsset } from '@/lib/media/mapper';
import {
  buildAssetPreview,
  loadAssetRenditions,
  renditionSignablePaths,
} from '@/lib/media/renditions';
import { MEDIA_ASSET_SELECT, type MediaAssetRow } from '@/lib/media/schema';
import { assetSignablePaths, type SignablePath } from '@/lib/media/signed-urls';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { loadShareComments } from './loadShareComments';
import { hashReviewerSessionToken } from './reviewerSession.server';

const SIGNED_URL_TTL_SECONDS = 3600;
const COLLECTION_ASSET_CAP = 100;

export type ShareUnavailableReason = 'missing' | 'revoked' | 'expired';

export type LoadShareResult =
  | { ok: true; payload: PublicSharePayload }
  | {
      ok: false;
      reason: 'challenge';
      needsPasscode: boolean;
      requireIdentity: boolean;
    }
  | { ok: false; reason: ShareUnavailableReason };

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type SharedAssetEntry = {
  row: MediaAssetRow;
  versionId: string;
  versionNumber: number;
  isHead: boolean;
};

type VersionRow = Record<string, unknown> & {
  id: string;
  asset_id: string;
  version_number: number;
};

const SHARE_VERSION_SELECT =
  'id, asset_id, version_number, bucket, storage_path, file_name, mime_type, size_bytes, width, height, duration_ms, checksum, integrity_state, created_at';

function rowAtVersion(row: MediaAssetRow, version: VersionRow): MediaAssetRow {
  return {
    ...row,
    bucket: String(version.bucket),
    storage_path: String(version.storage_path),
    file_name: String(version.file_name),
    mime_type: String(version.mime_type),
    size_bytes: typeof version.size_bytes === 'number' ? version.size_bytes : null,
    width: typeof version.width === 'number' ? version.width : null,
    height: typeof version.height === 'number' ? version.height : null,
    duration_ms: typeof version.duration_ms === 'number' ? version.duration_ms : null,
    checksum: typeof version.checksum === 'string' ? version.checksum : null,
    integrity_state:
      version.integrity_state === 'verified' || version.integrity_state === 'skipped_large_file'
        ? version.integrity_state
        : 'unknown',
    head_version_id: version.id,
    updated_at: String(version.created_at),
  };
}

// Signs each asset's storage path from its own bucket (media-library,
// media-source, ...). Mirrors src/lib/media/signed-urls.ts, which is bound to
// the user-scoped server client and therefore unusable on this anonymous page.
async function signAssets(admin: AdminClient, paths: SignablePath[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pathsByBucket = new Map<string, string[]>();
  for (const item of paths) {
    const existing = pathsByBucket.get(item.bucket);
    if (existing) existing.push(item.path);
    else pathsByBucket.set(item.bucket, [item.path]);
  }

  await Promise.all(
    Array.from(pathsByBucket.entries()).map(async ([bucket, paths]) => {
      const { data, error } = await admin.storage
        .from(bucket)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      if (error || !data) {
        console.error('[share] batch sign failed', { bucket, error });
        return;
      }
      for (const item of data) {
        if (item.signedUrl && item.path) map.set(item.path, item.signedUrl);
      }
    }),
  );

  return map;
}

async function loadAssetRows(
  admin: AdminClient,
  link: ShareLinkRow,
): Promise<{
  entries: SharedAssetEntry[];
  collectionName: string | null;
  versionIdsByAsset: Record<string, string>;
} | null> {
  const media = mediaSchema(admin);
  const { data: memberships } = await media
    .from('share_link_assets')
    .select('asset_id, version_id, position')
    .eq('share_link_id', link.id)
    .order('position', { ascending: true })
    .limit(COLLECTION_ASSET_CAP);
  const memberRows = (memberships ?? []) as Array<{
    asset_id: string;
    version_id: string | null;
    position: number;
  }>;
  const assetIds =
    memberRows.length > 0
      ? memberRows.map((row) => row.asset_id)
      : link.scope === 'asset' && link.asset_id
        ? [link.asset_id]
        : [];

  let collectionName: string | null = null;
  if (link.scope === 'collection') {
    const { data: collection } = await media
      .from('collections')
      .select('id, name')
      .eq('id', link.collection_id ?? '')
      .eq('brand_id', link.brand_id)
      .maybeSingle();
    if (!collection) return null;
    collectionName = (collection as { name: string }).name;
  }

  let rows: MediaAssetRow[] = [];
  if (assetIds.length > 0) {
    const { data: assets } = await media
      .from('assets')
      .select(MEDIA_ASSET_SELECT)
      .in('id', assetIds)
      .eq('brand_id', link.brand_id)
      .is('deleted_at', null);
    const byId = new Map(
      ((assets as unknown as MediaAssetRow[] | null) ?? []).map((row) => [row.id, row]),
    );
    rows = assetIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }

  const requestedVersionIds =
    link.version_mode === 'pinned'
      ? memberRows.flatMap((row) => row.version_id ?? [])
      : rows.flatMap((row) => row.head_version_id ?? []);
  let versionQuery = media
    .from('asset_versions')
    .select(SHARE_VERSION_SELECT)
    .eq('brand_id', link.brand_id);
  versionQuery =
    link.version_mode === 'all'
      ? versionQuery.in('asset_id', assetIds)
      : versionQuery.in('id', requestedVersionIds);
  const { data: versionData } =
    assetIds.length > 0 && (link.version_mode === 'all' || requestedVersionIds.length > 0)
      ? await versionQuery.order('version_number', { ascending: false })
      : { data: [] };
  const versions = (versionData ?? []) as unknown as VersionRow[];
  const versionsByAsset = new Map<string, VersionRow[]>();
  for (const version of versions) {
    const existing = versionsByAsset.get(version.asset_id);
    if (existing) existing.push(version);
    else versionsByAsset.set(version.asset_id, [version]);
  }
  const pinnedByAsset = new Map(memberRows.map((row) => [row.asset_id, row.version_id]));
  const entries = rows.flatMap((row): SharedAssetEntry[] => {
    const candidates = versionsByAsset.get(row.id) ?? [];
    const selected =
      link.version_mode === 'all'
        ? candidates
        : candidates.filter((version) =>
            link.version_mode === 'pinned'
              ? version.id === pinnedByAsset.get(row.id)
              : version.id === row.head_version_id,
          );
    return selected.map((version) => ({
      row: rowAtVersion(row, version),
      versionId: version.id,
      versionNumber: version.version_number,
      isHead: version.id === row.head_version_id,
    }));
  });
  const versionIdsByAsset =
    link.version_mode === 'all'
      ? {}
      : Object.fromEntries(entries.map((entry) => [entry.row.id, entry.versionId]));

  return { entries, collectionName, versionIdsByAsset };
}

export async function loadSharePayload(
  token: string,
  reviewerSessionToken?: string,
): Promise<LoadShareResult> {
  if (!token || token.length > 128) return { ok: false, reason: 'missing' };

  const admin = createSupabaseAdminClient();
  const { data: linkRow } = await mediaSchema(admin)
    .from('share_links')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (!linkRow) return { ok: false, reason: 'missing' };

  const link = linkRow as ShareLinkRow;
  const status = shareLinkStatus({ revokedAt: link.revoked_at, expiresAt: link.expires_at });
  if (!status.active) return { ok: false, reason: status.reason };

  const sessionHash = reviewerSessionToken ? hashReviewerSessionToken(reviewerSessionToken) : null;
  const { data: session } = sessionHash
    ? await mediaSchema(admin)
        .from('external_reviewer_sessions')
        .select('id, display_name, email')
        .eq('share_link_id', link.id)
        .eq('session_token_hash', sessionHash)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
    : { data: null };
  const identityPresent = Boolean(session?.display_name && session?.email);
  if (link.passcode_hash || link.require_identity) {
    if (!session || (link.require_identity && !identityPresent)) {
      return {
        ok: false,
        reason: 'challenge',
        needsPasscode: Boolean(link.passcode_hash),
        requireIdentity: link.require_identity,
      };
    }
  }

  const loaded = await loadAssetRows(admin, link);
  if (!loaded) return { ok: false, reason: 'missing' };

  const sharedRows = loaded.entries.map((entry) => entry.row);
  const renditions = await loadAssetRenditions(
    admin,
    loaded.entries.map((entry) => entry.versionId),
  );
  // Signing and the comment read are independent reads over the same rows.
  const [signedByPath, comments] = await Promise.all([
    signAssets(admin, [
      ...assetSignablePaths(sharedRows),
      ...carouselSignablePaths(sharedRows),
      ...renditionSignablePaths(renditions),
    ]),
    link.allow_comments
      ? loadShareComments(admin, {
          brandId: link.brand_id,
          assetIds: [...new Set(loaded.entries.map((entry) => entry.row.id))],
          versionIdsByAsset: loaded.versionIdsByAsset,
        })
      : Promise.resolve([]),
  ]);

  const assets: PublicShareAsset[] = loaded.entries.map((entry) => {
    const preview = buildAssetPreview(entry.row, renditions, signedByPath);
    const base = rowToSignedMediaAsset(entry.row, signedByPath, preview);
    const carousel = buildCarousel(entry.row, signedByPath);
    return {
      asset: carousel ? { ...base, carousel } : base,
      versionId: entry.versionId,
      versionNumber: entry.versionNumber,
      isHead: entry.isHead,
    };
  });

  return {
    ok: true,
    payload: {
      scope: link.scope,
      brandName: null,
      collectionName: loaded.collectionName,
      assets,
      comments,
      policy: rowToShareLink(link).policy,
      reviewer: identityPresent
        ? { displayName: String(session?.display_name), email: String(session?.email) }
        : null,
    },
  };
}
