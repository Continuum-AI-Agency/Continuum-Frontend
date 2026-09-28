// Anonymous share-token resolution for /share/[token]. No caller auth: the token
// IS the credential. The library-share edge function does every privileged read
// (media.share_links is deny-all RLS, the buckets are private, and the
// service-role key is not on Vercel) and returns the rows plus short-lived signed
// URLs; this module maps them onto the public payload with the Library's own
// pure mappers.

import 'server-only';

import {
  type CustomFieldValue,
  type PublicShareAsset,
  type PublicSharePayload,
  type ShareLinkRow,
  shareFeaturedFieldSchema,
  shareLinkBrandingSchema,
  shareLinkWatermarkSchema,
} from '@continuum/contracts';
import { rowToShareLink } from '@/lib/library/shareValidation';
import { buildCarousel } from '@/lib/media/carousel';
import { rowToSignedMediaAsset } from '@/lib/media/mapper';
import { type AssetRenditionRow, buildAssetPreview } from '@/lib/media/renditions';
import type { MediaAssetRow } from '@/lib/media/schema';
import { projectShareComments, type ShareCommentSource } from './loadShareComments';
import { invokeLibraryShare } from './shareEdge.server';

export const SHARE_PAGE_SIZE = 60;

// Which slice of a link to load: a page of it, or the one asset a route acts on.
export type ShareSlice = { page?: number; pageSize?: number; assetId?: string };

export type ShareUnavailableReason = 'missing' | 'revoked' | 'expired';

// What a share route needs besides the page: which link and reviewer session
// the request resolved to.
export type ShareRequestContext = {
  linkId: string;
  brandId: string;
  sessionId: string | null;
  allowedAssetIds: string[];
};

export type LoadShareResult =
  | { ok: true; payload: PublicSharePayload; context: ShareRequestContext }
  | { ok: false; reason: 'challenge'; needsPasscode: boolean; requireIdentity: boolean }
  | { ok: false; reason: ShareUnavailableReason };

type Session = { id: string; display_name: string | null; email: string | null };

type EdgeLoad =
  | {
      ok: true;
      link: ShareLinkRow;
      session: Session | null;
      identityPresent: boolean;
      protected: boolean;
      total: number;
      collectionName: string | null;
      entries: Array<{
        row: MediaAssetRow;
        versionId: string;
        versionNumber: number;
        isHead: boolean;
      }>;
      renditions: AssetRenditionRow[];
      signed: Record<string, string>;
      comments: ShareCommentSource;
      brand: { brandName: string | null; logoUrl: string | null; accent: string | null };
      featured: { field: unknown; values: Record<string, CustomFieldValue> } | null;
      previewStates?: PublicSharePayload['previewStates'];
    }
  | { ok: false; status: 'challenge'; needsPasscode: boolean; requireIdentity: boolean }
  | { ok: false; status: ShareUnavailableReason };

export async function loadSharePayload(
  token: string,
  reviewerSessionToken?: string,
  viewerIp?: string | null,
  slice: ShareSlice = {},
): Promise<LoadShareResult> {
  if (!token || token.length < 16 || token.length > 128) return { ok: false, reason: 'missing' };
  const result = await invokeLibraryShare<EdgeLoad>({
    action: 'load_share',
    token,
    ...(reviewerSessionToken ? { sessionToken: reviewerSessionToken } : {}),
    ...(viewerIp ? { viewerIp } : {}),
    ...(slice.page ? { page: slice.page } : {}),
    ...(slice.pageSize ? { pageSize: slice.pageSize } : {}),
    ...(slice.assetId ? { assetId: slice.assetId } : {}),
  });
  if (!result.ok) {
    // A failed call is not a missing link; say so in the log, show the card.
    console.error('[share] load_share failed', { status: result.status, error: result.error });
    return { ok: false, reason: 'missing' };
  }
  const data = result.data;
  if (!data.ok) {
    return data.status === 'challenge'
      ? {
          ok: false,
          reason: 'challenge',
          needsPasscode: data.needsPasscode,
          requireIdentity: data.requireIdentity,
        }
      : { ok: false, reason: data.status };
  }

  const { link, session, entries, renditions } = data;
  const signed = new Map(Object.entries(data.signed));
  // A protected link's page holds no original: videos play their preview proxy,
  // images show a stored rendition or thumbnail (never a transform over the
  // original, whose token would replay on it), else nothing and a placeholder.
  // A member the probe found a position in is guarded the same way on any link:
  // the edge function does not sign its original (GPS never leaves through a share).
  const readyRenditionUrl = (versionId: string, role: string) => {
    const rendition = renditions.find(
      (row) =>
        row.asset_version_id === versionId &&
        row.role === role &&
        row.state === 'ready' &&
        row.storage_path,
    );
    return rendition?.storage_path ? (signed.get(rendition.storage_path) ?? null) : null;
  };
  const assets: PublicShareAsset[] = entries.map((entry) => {
    const preview = buildAssetPreview(entry.row, renditions, signed);
    const mapped = rowToSignedMediaAsset(entry.row, signed, preview);
    const guarded = data.protected || entry.row.has_location === true;
    const asset = guarded
      ? {
          ...mapped,
          signedUrl:
            mapped.kind === 'video'
              ? readyRenditionUrl(entry.versionId, 'preview_video')
              : mapped.kind === 'image'
                ? ((preview?.kind === 'image' ? preview.signedUrl : null) ?? mapped.thumbnailUrl ?? null)
                : mapped.kind === 'audio'
                  ? readyRenditionUrl(entry.versionId, 'audio_proxy')
                  : null,
        }
      : mapped;
    const carousel = guarded ? null : buildCarousel(entry.row, signed);
    return {
      asset: carousel ? { ...asset, carousel } : asset,
      versionId: entry.versionId,
      versionNumber: entry.versionNumber,
      isHead: entry.isHead,
    };
  });

  const assetIds = [...new Set(entries.map((entry) => entry.row.id))];
  const branding = shareLinkBrandingSchema.safeParse(link.branding);
  const overrides = branding.success ? branding.data : {};
  const watermark = shareLinkWatermarkSchema.safeParse(link.watermark);
  const featuredField = data.featured
    ? shareFeaturedFieldSchema.safeParse(data.featured.field)
    : null;
  const shareLink = rowToShareLink(link);
  return {
    ok: true,
    payload: {
      scope: link.scope,
      brandName: data.brand.brandName,
      collectionName: data.collectionName,
      assets,
      comments: projectShareComments(assetIds, data.comments),
      policy: shareLink.policy,
      layout: shareLink.layout,
      branding: { ...overrides, accent: overrides.accent ?? data.brand.accent ?? undefined },
      logoUrl: data.brand.logoUrl,
      watermark: watermark.success ? watermark.data : null,
      featuredFieldId: featuredField?.success ? featuredField.data.id : null,
      featuredField: featuredField?.success ? featuredField.data : null,
      featuredValues: featuredField?.success ? (data.featured?.values ?? {}) : {},
      viewerIp: viewerIp ?? null,
      pagination: {
        page: Math.max(slice.page ?? 1, 1),
        pageSize: Math.min(Math.max(slice.pageSize ?? SHARE_PAGE_SIZE, 1), 1000),
        total: data.total,
      },
      reviewer: data.identityPresent
        ? { displayName: String(session?.display_name), email: String(session?.email) }
        : null,
      viewerName: session?.display_name ?? null,
      previewStates: data.previewStates ?? {},
    },
    context: {
      linkId: link.id,
      brandId: link.brand_id,
      sessionId: session?.id ?? null,
      allowedAssetIds: assetIds,
    },
  };
}

// How a link looks before (or without) its content: the passcode/identity
// challenge, the expired or revoked card, and the page title. Branding is not
// gated — it is what tells a reviewer whose link this is.
export type SharePresentation = {
  title: string | null;
  brandName: string | null;
  logoUrl: string | null;
  accent: string | null;
  background: string | null;
  theme: 'light' | 'dark' | null;
  hideFooter: boolean;
};

export async function loadSharePresentation(token: string): Promise<SharePresentation | null> {
  if (!token || token.length < 16 || token.length > 128) return null;
  const result = await invokeLibraryShare<{ presentation: SharePresentation | null }>({
    action: 'share_presentation',
    token,
  });
  return result.ok ? result.data.presentation : null;
}
