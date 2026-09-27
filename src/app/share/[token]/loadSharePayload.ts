// Anonymous share-token resolution for /share/[token]. No caller auth: the
// token IS the credential. media.share_links is deny-all RLS and the target
// buckets are private, so everything here runs on the admin client and only
// short-lived signed URLs ever reach the visitor.

import 'server-only';

import {
  type CustomFieldValue,
  customFieldOptionsSchema,
  customFieldTypeSchema,
  isShareFeaturableFieldType,
  type PublicShareAsset,
  type PublicSharePayload,
  type ShareFeaturedField,
  shareLinkBrandingSchema,
  shareLinkWatermarkSchema,
} from '@continuum/contracts';
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
export const SHARE_PAGE_SIZE = 60;
const SHARE_PAGE_SIZE_MAX = 1000;

// Which slice of a link to load: a page of it, or the one asset a route acts on.
export type ShareSlice = { page?: number; pageSize?: number; assetId?: string };

export type ShareUnavailableReason = 'missing' | 'revoked' | 'expired';

// What a share route needs besides the page: which link and reviewer session
// the request resolved to, so events and downloads are attributed.
export type ShareRequestContext = {
  linkId: string;
  brandId: string;
  sessionId: string | null;
  allowedAssetIds: string[];
};

export type LoadShareResult =
  | { ok: true; payload: PublicSharePayload; context: ShareRequestContext }
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

type MemberRow = { asset_id: string; version_id: string | null };
export type MemberPage = { rows: MemberRow[]; total: number };

// A page of a link's members in the order the page shows them, resolved by
// media.share_link_members: the owner's custom order first, then the shared
// collection as it is now — manual items, sub-collections and smart queries,
// evaluated as the link owner. Selection and asset shares are their snapshot.
export async function shareMembers(
  admin: AdminClient,
  link: ShareLinkRow,
  slice: ShareSlice = {},
): Promise<MemberPage> {
  const media = mediaSchema(admin);
  const pageSize = Math.min(Math.max(slice.pageSize ?? SHARE_PAGE_SIZE, 1), SHARE_PAGE_SIZE_MAX);
  const offset = slice.assetId ? 0 : Math.max((slice.page ?? 1) - 1, 0) * pageSize;
  const call = (limit: number, from: number) =>
    media.rpc('share_link_members', {
      p_share_link_id: link.id,
      p_asset_id: slice.assetId ?? null,
      p_limit: limit,
      p_offset: from,
    });
  const { data, error } = await call(pageSize, offset);
  if (error) {
    console.error('[share] member resolve failed', { linkId: link.id, error });
    return { rows: [], total: 0 };
  }
  const resolved = (data ?? []) as Array<MemberRow & { total: number }>;
  let total = Number(resolved[0]?.total ?? 0);
  if (resolved.length === 0 && offset > 0) {
    const { data: first } = await call(1, 0);
    total = Number((first as Array<{ total: number }> | null)?.[0]?.total ?? 0);
  }
  if (link.scope === 'collection') await joinLateMembers(admin, link, resolved);
  return { rows: resolved.map(({ asset_id, version_id }) => ({ asset_id, version_id })), total };
}

// A member that joined the collection after the link was made joins the link on
// first sight, so a guest can comment on it and decide on it (those checks read
// share_link_assets). A pinned link pins the version the guest first saw.
async function joinLateMembers(admin: AdminClient, link: ShareLinkRow, rows: MemberRow[]) {
  if (rows.length === 0) return;
  const media = mediaSchema(admin);
  const ids = rows.map((row) => row.asset_id);
  const [{ data: known }, { data: last }, { data: heads }] = await Promise.all([
    media
      .from('share_link_assets')
      .select('asset_id')
      .eq('share_link_id', link.id)
      .in('asset_id', ids),
    media
      .from('share_link_assets')
      .select('position')
      .eq('share_link_id', link.id)
      .order('position', { ascending: false })
      .limit(1),
    media.from('assets').select('id, head_version_id').in('id', ids).eq('brand_id', link.brand_id),
  ]);
  const knownIds = new Set(
    ((known ?? []) as Array<{ asset_id: string }>).map((row) => row.asset_id),
  );
  const late = rows.filter((row) => !knownIds.has(row.asset_id));
  if (late.length === 0) return;
  const headById = new Map(
    ((heads ?? []) as Array<{ id: string; head_version_id: string | null }>).map((row) => [
      row.id,
      row.head_version_id,
    ]),
  );
  const start = Number((last as Array<{ position: number }> | null)?.[0]?.position ?? -1) + 1;
  const pinned = link.version_mode === 'pinned';
  const joined = late.map((row, index) => ({
    share_link_id: link.id,
    asset_id: row.asset_id,
    version_id: pinned ? (headById.get(row.asset_id) ?? null) : null,
    position: start + index,
  }));
  const { error } = await media
    .from('share_link_assets')
    .upsert(joined, { onConflict: 'share_link_id,asset_id', ignoreDuplicates: true });
  if (error) console.error('[share] live member join failed', { linkId: link.id, error });
  for (const row of late) {
    if (pinned) row.version_id = headById.get(row.asset_id) ?? null;
  }
}

// Whether a link exposes an asset, without loading the rest of it.
export async function shareHasAsset(
  admin: AdminClient,
  link: ShareLinkRow,
  assetId: string,
): Promise<boolean> {
  return (await shareMembers(admin, link, { assetId })).rows.length > 0;
}

async function loadAssetRows(
  admin: AdminClient,
  link: ShareLinkRow,
  slice: ShareSlice,
): Promise<{
  entries: SharedAssetEntry[];
  collectionName: string | null;
  versionIdsByAsset: Record<string, string>;
  total: number;
} | null> {
  const media = mediaSchema(admin);
  const { rows: memberRows, total } = await shareMembers(admin, link, slice);
  const assetIds = memberRows.map((row) => row.asset_id);

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

  const pinnedByAsset = new Map(memberRows.map((row) => [row.asset_id, row.version_id]));
  // A pinned link shows each member's pinned version; a member that joined a
  // live collection after the link was made has none yet and shows its head.
  const shownVersionId = (row: MediaAssetRow) =>
    link.version_mode === 'pinned'
      ? (pinnedByAsset.get(row.id) ?? row.head_version_id)
      : row.head_version_id;
  const requestedVersionIds = rows.flatMap((row) => shownVersionId(row) ?? []);
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
  const entries = rows.flatMap((row): SharedAssetEntry[] => {
    const candidates = versionsByAsset.get(row.id) ?? [];
    const selected =
      link.version_mode === 'all'
        ? candidates
        : candidates.filter((version) => version.id === shownVersionId(row));
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

  return { entries, collectionName, versionIdsByAsset, total };
}

type BrandPresentation = {
  brandName: string | null;
  logoUrl: string | null;
  accent: string | undefined;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

// The brand kit is the default look of every share: name, logo and first
// colour from the brand profile. A link's own logo asset overrides the logo.
async function loadBrandPresentation(
  admin: AdminClient,
  brandId: string,
  logoAssetId: string | undefined,
): Promise<BrandPresentation> {
  const { data: profile } = await admin
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('brand_name, brand_colors, logo_path')
    .eq('id', brandId)
    .maybeSingle();
  const row = profile as {
    brand_name: string | null;
    brand_colors: unknown;
    logo_path: string | null;
  } | null;
  const colors = Array.isArray(row?.brand_colors) ? row.brand_colors : [];
  const accent = colors.find(
    (color): color is string => typeof color === 'string' && HEX.test(color),
  );

  let logoUrl: string | null = null;
  if (logoAssetId) {
    const { data: asset } = await mediaSchema(admin)
      .from('assets')
      .select('bucket, storage_path')
      .eq('id', logoAssetId)
      .eq('brand_id', brandId)
      .is('deleted_at', null)
      .maybeSingle();
    const logo = asset as { bucket: string; storage_path: string } | null;
    if (logo) {
      const { data } = await admin.storage
        .from(logo.bucket)
        .createSignedUrl(logo.storage_path, SIGNED_URL_TTL_SECONDS);
      logoUrl = data?.signedUrl ?? null;
    }
  }
  if (!logoUrl && row?.logo_path) {
    const { data } = await admin.storage
      .from('brand-profile-assets')
      .createSignedUrl(row.logo_path, SIGNED_URL_TTL_SECONDS);
    logoUrl = data?.signedUrl ?? null;
  }
  return { brandName: row?.brand_name ?? null, logoUrl, accent };
}

async function loadFeaturedField(
  admin: AdminClient,
  link: ShareLinkRow,
  assetIds: string[],
): Promise<{ field: ShareFeaturedField | null; values: Record<string, CustomFieldValue> }> {
  if (!link.featured_field_id) return { field: null, values: {} };
  const media = mediaSchema(admin);
  const { data } = await media
    .from('custom_fields')
    .select('id, name, type, options')
    .eq('id', link.featured_field_id)
    .eq('brand_id', link.brand_id)
    .maybeSingle();
  const type = customFieldTypeSchema.safeParse((data as { type?: unknown } | null)?.type);
  const options = customFieldOptionsSchema.safeParse(
    (data as { options?: unknown } | null)?.options,
  );
  if (!data || !type.success || !options.success || !isShareFeaturableFieldType(type.data)) {
    return { field: null, values: {} };
  }
  const field = {
    id: String((data as { id: string }).id),
    name: String((data as { name: string }).name),
    type: type.data,
    options: options.data,
  };
  const { data: valueRows } =
    assetIds.length > 0
      ? await media
          .from('asset_field_values')
          .select('asset_id, value')
          .eq('field_id', field.id)
          .in('asset_id', assetIds)
      : { data: [] };
  const values = Object.fromEntries(
    ((valueRows ?? []) as Array<{ asset_id: string; value: CustomFieldValue }>).map((row) => [
      row.asset_id,
      row.value,
    ]),
  );
  return { field, values };
}

type ResolvedShareLink =
  | {
      ok: true;
      admin: AdminClient;
      link: ShareLinkRow;
      session: { id: string; display_name: string | null; email: string | null } | null;
      identityPresent: boolean;
    }
  | Exclude<LoadShareResult, { ok: true }>;

// Token, revocation, expiry and the reviewer gate: everything a share route
// must pass before it may read or act on the link. A watermarked link names
// its viewer on every frame, so it always needs a verified identity.
export async function resolveShareLink(
  token: string,
  reviewerSessionToken?: string,
): Promise<ResolvedShareLink> {
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
  const { data: sessionRow } = sessionHash
    ? await mediaSchema(admin)
        .from('external_reviewer_sessions')
        .select('id, display_name, email')
        .eq('share_link_id', link.id)
        .eq('session_token_hash', sessionHash)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
    : { data: null };
  const session = sessionRow as {
    id: string;
    display_name: string | null;
    email: string | null;
  } | null;
  const identityPresent = Boolean(session?.display_name && session?.email);
  const requireIdentity = link.require_identity || link.watermark != null;
  if (link.passcode_hash || requireIdentity) {
    if (!session || (requireIdentity && !identityPresent)) {
      return {
        ok: false,
        reason: 'challenge',
        needsPasscode: Boolean(link.passcode_hash),
        requireIdentity,
      };
    }
  }
  return { ok: true, admin, link, session, identityPresent };
}

export async function loadSharePayload(
  token: string,
  reviewerSessionToken?: string,
  viewerIp?: string | null,
  slice: ShareSlice = {},
): Promise<LoadShareResult> {
  const resolved = await resolveShareLink(token, reviewerSessionToken);
  if (!resolved.ok) return resolved;
  const { admin, link, session, identityPresent } = resolved;

  const loaded = await loadAssetRows(admin, link, slice);
  if (!loaded) return { ok: false, reason: 'missing' };

  const sharedRows = loaded.entries.map((entry) => entry.row);
  const assetIds = [...new Set(sharedRows.map((row) => row.id))];
  const branding = shareLinkBrandingSchema.safeParse(link.branding);
  const overrides = branding.success ? branding.data : {};
  const watermark = shareLinkWatermarkSchema.safeParse(link.watermark);
  const renditions = await loadAssetRenditions(
    admin,
    loaded.entries.map((entry) => entry.versionId),
  );
  // Signing, comments, the brand kit and the featured field are independent reads.
  const [signedByPath, comments, brand, featured] = await Promise.all([
    signAssets(admin, [
      ...assetSignablePaths(sharedRows),
      ...carouselSignablePaths(sharedRows),
      ...renditionSignablePaths(renditions),
    ]),
    link.allow_comments
      ? loadShareComments(admin, {
          brandId: link.brand_id,
          assetIds,
          versionIdsByAsset: loaded.versionIdsByAsset,
        })
      : Promise.resolve([]),
    loadBrandPresentation(admin, link.brand_id, overrides.logoAssetId),
    loadFeaturedField(admin, link, assetIds),
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

  const shareLink = rowToShareLink(link);
  return {
    ok: true,
    payload: {
      scope: link.scope,
      brandName: brand.brandName,
      collectionName: loaded.collectionName,
      assets,
      comments,
      policy: shareLink.policy,
      layout: shareLink.layout,
      branding: { ...overrides, accent: overrides.accent ?? brand.accent },
      logoUrl: brand.logoUrl,
      watermark: watermark.success ? watermark.data : null,
      featuredFieldId: featured.field?.id ?? null,
      featuredField: featured.field,
      featuredValues: featured.values,
      viewerIp: viewerIp ?? null,
      pagination: {
        page: Math.max(slice.page ?? 1, 1),
        pageSize: Math.min(Math.max(slice.pageSize ?? SHARE_PAGE_SIZE, 1), 1000),
        total: loaded.total,
      },
      reviewer: identityPresent
        ? { displayName: String(session?.display_name), email: String(session?.email) }
        : null,
    },
    context: {
      linkId: link.id,
      brandId: link.brand_id,
      sessionId: session?.id ?? null,
      allowedAssetIds: assetIds,
    },
  };
}
