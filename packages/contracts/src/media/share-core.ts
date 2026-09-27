// The pure half of the share contracts: link settings, presentation, activity and
// the library-share edge function's requests. Imports nothing but zod, so a Deno
// edge function can import it by relative path (supabase/functions/library-share);
// share.ts re-exports all of it.

import { z } from 'zod';

export const shareLinkScopeSchema = z.enum(['asset', 'collection', 'selection']);
export type ShareLinkScope = z.infer<typeof shareLinkScopeSchema>;

export const shareVersionModeSchema = z.enum(['live', 'pinned', 'all']);
export type ShareVersionMode = z.infer<typeof shareVersionModeSchema>;

export const sharePolicySchema = z
  .object({
    versionMode: shareVersionModeSchema,
    pinnedVersionId: z.string().min(1).nullable(),
    allowComments: z.boolean(),
    allowApproval: z.boolean(),
    allowDownload: z.boolean(),
    showMetadata: z.boolean(),
    showCustomFields: z.boolean(),
    requireIdentity: z.boolean(),
    hasPasscode: z.boolean(),
  })
  .strict();
export type SharePolicy = z.infer<typeof sharePolicySchema>;

export const shareLinkLayoutSchema = z.enum(['grid', 'list', 'reel']);
export type ShareLinkLayout = z.infer<typeof shareLinkLayoutSchema>;

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// How the public share page presents the brand (media.share_links.branding).
export const shareLinkBrandingSchema = z
  .object({
    logoAssetId: z.string().uuid().optional(),
    accent: hexColorSchema.optional(),
    background: hexColorSchema.optional(),
    headerTitle: z.string().max(120).optional(),
    description: z.string().max(1000).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
    // Drops the "Shared via Continuum" line for a fully white-labelled page.
    hideFooter: z.boolean().optional(),
  })
  .strict();
export type ShareLinkBranding = z.infer<typeof shareLinkBrandingSchema>;

export const shareLinkWatermarkPositionSchema = z.enum([
  'center',
  'top_left',
  'top_right',
  'bottom_left',
  'bottom_right',
  'tiled',
]);
export type ShareLinkWatermarkPosition = z.infer<typeof shareLinkWatermarkPositionSchema>;

export const DEFAULT_SHARE_WATERMARK_TEMPLATE = '{name} · {email} · {time}';

// media.share_links.watermark: null means no watermark. burnDownloads stamps
// downloaded files too, not only the on-page preview.
export const shareLinkWatermarkSchema = z
  .object({
    template: z.string().max(200).default(DEFAULT_SHARE_WATERMARK_TEMPLATE),
    position: shareLinkWatermarkPositionSchema,
    opacity: z.number().min(0.05).max(1),
    burnDownloads: z.boolean(),
  })
  .strict();
export type ShareLinkWatermark = z.infer<typeof shareLinkWatermarkSchema>;

export type ShareWatermarkViewer = {
  name: string | null;
  email: string | null;
  ip?: string | null;
  time: Date;
};

// The overlay text for one viewer. The share page draws it live and the
// Backend burns the same string into downloads, so both read this one function.
export function renderShareWatermarkText(template: string, viewer: ShareWatermarkViewer): string {
  const time = viewer.time.toISOString().slice(0, 16).replace('T', ' ');
  return template
    .replaceAll('{name}', viewer.name ?? '')
    .replaceAll('{email}', viewer.email ?? '')
    .replaceAll('{ip}', viewer.ip ?? '')
    .replaceAll('{time}', `${time} UTC`)
    .replace(/(\s*·\s*)+$/, '')
    .replace(/^(\s*·\s*)+/, '')
    .trim();
}

// A guest edits exactly one value per asset; member-picking ('user') and
// multi-value types need a seat's context, so they cannot be featured.
export const SHARE_FEATURED_FIELD_TYPES = [
  'single_select',
  'status',
  'text',
  'number',
  'checkbox',
  'rating',
  'date',
  'url',
] as const;

export function isShareFeaturableFieldType(type: string): boolean {
  return (SHARE_FEATURED_FIELD_TYPES as readonly string[]).includes(type);
}

export const shareLinkSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    token: z.string().min(1),
    scope: shareLinkScopeSchema,
    assetId: z.string().nullable().optional(),
    collectionId: z.string().nullable().optional(),
    assetIds: z.array(z.string().min(1)).default([]),
    permissions: z.literal('view'),
    policy: sharePolicySchema,
    layout: shareLinkLayoutSchema.default('grid'),
    branding: shareLinkBrandingSchema.default({}),
    watermark: shareLinkWatermarkSchema.nullable().optional(),
    featuredFieldId: z.string().uuid().nullable().optional(),
    createdBy: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    revokedAt: z.string().nullable().optional(),
    createdAt: z.string(),
    // Transient: absolute public URL for the token, built at read time.
    url: z.string().nullable().optional(),
  })
  .strict();
export type ShareLink = z.infer<typeof shareLinkSchema>;

export const shareLinkEventKindSchema = z.enum([
  'open',
  'view',
  'play',
  'download',
  'download_all',
  'comment',
  'decision',
  'field_edit',
]);
export type ShareLinkEventKind = z.infer<typeof shareLinkEventKindSchema>;

// One row of media.share_link_events — what an external reviewer did on a link.
export const shareLinkEventSchema = z
  .object({
    id: z.string().uuid(),
    shareLinkId: z.string().uuid(),
    brandId: z.string().uuid(),
    reviewerSessionId: z.string().uuid().nullable(),
    assetId: z.string().uuid().nullable(),
    versionId: z.string().uuid().nullable(),
    kind: shareLinkEventKindSchema,
    ipHash: z.string().nullable(),
    userAgent: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type ShareLinkEvent = z.infer<typeof shareLinkEventSchema>;

// The events a share page reports from the browser; the rest are recorded
// server-side where the action happens.
export const shareBeaconEventKindSchema = z.enum(['open', 'view', 'play']);
export const shareBeaconEventRequestSchema = z
  .object({
    kind: shareBeaconEventKindSchema,
    assetId: z.string().uuid().optional(),
    versionId: z.string().uuid().optional(),
  })
  .strict();
export type ShareBeaconEventRequest = z.infer<typeof shareBeaconEventRequestSchema>;

// One event as the share owner sees it: attributed to the reviewer by name.
export const shareLinkActivityEventSchema = z
  .object({
    id: z.string().uuid(),
    shareLinkId: z.string().uuid(),
    kind: shareLinkEventKindSchema,
    assetId: z.string().uuid().nullable(),
    assetTitle: z.string().nullable(),
    versionId: z.string().uuid().nullable(),
    reviewerName: z.string().nullable(),
    reviewerEmail: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type ShareLinkActivityEvent = z.infer<typeof shareLinkActivityEventSchema>;

export const shareLinkMemberSchema = z
  .object({
    assetId: z.string().uuid(),
    title: z.string(),
    kind: z.string(),
  })
  .strict();
export type ShareLinkMember = z.infer<typeof shareLinkMemberSchema>;

const activityCountsShape = {
  views: z.number().int().nonnegative(),
  plays: z.number().int().nonnegative(),
  downloads: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
} as const;

export const shareActivityTotalsSchema = z
  .object({
    byAsset: z.array(
      z
        .object({
          assetId: z.string().uuid(),
          title: z.string().nullable(),
          ...activityCountsShape,
        })
        .strict(),
    ),
    byViewer: z.array(
      z
        .object({
          viewerKey: z.string(),
          name: z.string().nullable(),
          email: z.string().nullable(),
          ...activityCountsShape,
        })
        .strict(),
    ),
  })
  .strict();
export type ShareActivityTotals = z.infer<typeof shareActivityTotalsSchema>;

export type ShareActivityRow = {
  kind: ShareLinkEventKind;
  assetId: string | null;
  assetTitle: string | null;
  viewerKey: string;
  viewerName: string | null;
  viewerEmail: string | null;
};

const COUNTED: Partial<Record<ShareLinkEventKind, keyof typeof activityCountsShape>> = {
  view: 'views',
  play: 'plays',
  download: 'downloads',
  download_all: 'downloads',
  comment: 'comments',
};

// Views, plays, downloads and comments per asset and per viewer, most active first.
// A "download all" counts once for the viewer and for no single asset.
export function summarizeShareActivity(rows: readonly ShareActivityRow[]): ShareActivityTotals {
  const zero = () => ({ views: 0, plays: 0, downloads: 0, comments: 0 });
  const byAsset = new Map<string, ShareActivityTotals['byAsset'][number]>();
  const byViewer = new Map<string, ShareActivityTotals['byViewer'][number]>();
  for (const row of rows) {
    const counter = COUNTED[row.kind];
    if (!counter) continue;
    if (row.assetId && row.kind !== 'download_all') {
      const asset = byAsset.get(row.assetId) ?? {
        assetId: row.assetId,
        title: row.assetTitle,
        ...zero(),
      };
      asset[counter] += 1;
      byAsset.set(row.assetId, asset);
    }
    const viewer = byViewer.get(row.viewerKey) ?? {
      viewerKey: row.viewerKey,
      name: row.viewerName,
      email: row.viewerEmail,
      ...zero(),
    };
    viewer[counter] += 1;
    byViewer.set(row.viewerKey, viewer);
  }
  const activity = (entry: { views: number; plays: number; downloads: number; comments: number }) =>
    entry.views + entry.plays + entry.downloads + entry.comments;
  return {
    byAsset: [...byAsset.values()].sort((a, b) => activity(b) - activity(a)),
    byViewer: [...byViewer.values()].sort((a, b) => activity(b) - activity(a)),
  };
}

// GET /api/library/share/manage — one link with what its owner edits and sees.
export const shareLinkDetailResponseSchema = z
  .object({
    link: shareLinkSchema,
    members: z.array(shareLinkMemberSchema),
    events: z.array(shareLinkActivityEventSchema),
    totals: shareActivityTotalsSchema.optional(),
  })
  .strict();
export type ShareLinkDetailResponse = z.infer<typeof shareLinkDetailResponseSchema>;

export const shareLinkActivityResponseSchema = z
  .object({
    events: z.array(shareLinkActivityEventSchema),
    totals: shareActivityTotalsSchema.optional(),
  })
  .strict();
export type ShareLinkActivityResponse = z.infer<typeof shareLinkActivityResponseSchema>;

// PATCH /api/library/share/manage — the owner's edit; the route adds the actor.
export const updateShareLinkRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    shareLinkId: z.string().uuid(),
    idempotencyKey: z.string().min(1).max(200).optional(),
    layout: shareLinkLayoutSchema.optional(),
    branding: shareLinkBrandingSchema.optional(),
    watermark: shareLinkWatermarkSchema.nullable().optional(),
    featuredFieldId: z.string().uuid().nullable().optional(),
    assetOrder: z.array(z.string().uuid()).max(500).optional(),
    allowComments: z.boolean().optional(),
    allowApproval: z.boolean().optional(),
    allowDownload: z.boolean().optional(),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    // Plaintext only on the way in: the route hashes it; null removes the passcode.
    passcode: z.string().min(4).max(128).nullable().optional(),
  })
  .strict();
export type UpdateShareLinkRequest = z.infer<typeof updateShareLinkRequestSchema>;

// Share page → Backend share delivery. The Backend resolves the link, the
// reviewer session and the files itself (service role); the page only names
// which asset (or all of them) and carries the reviewer's session token.
export const shareDeliveryRequestSchema = z
  .object({
    token: z.string().min(16).max(128),
    sessionToken: z.string().min(32).max(256).optional(),
    viewerIp: z.string().max(64).optional(),
    assetId: z.string().uuid().optional(),
    versionId: z.string().uuid().optional(),
    zipName: z.string().min(1).max(200).optional(),
  })
  .strict();
export type ShareDeliveryRequest = z.infer<typeof shareDeliveryRequestSchema>;

// A media.share_links row as the database returns it (snake_case). The token and
// the passcode hash are never sent to a browser; has_passcode replaces the hash.
export type ShareLinkRow = {
  id: string;
  brand_id: string;
  token: string;
  scope: ShareLinkScope;
  asset_id: string | null;
  collection_id: string | null;
  version_mode: ShareVersionMode;
  pinned_version_id: string | null;
  allow_comments: boolean;
  allow_approval: boolean;
  allow_download: boolean;
  show_metadata: boolean;
  show_custom_fields: boolean;
  require_identity: boolean;
  passcode_hash?: string | null;
  has_passcode?: boolean;
  permissions: 'view';
  created_by: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  layout?: string;
  branding?: unknown;
  watermark?: unknown;
  featured_field_id?: string | null;
};

export function buildShareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/share/${token}`;
}

// A malformed layout, branding or watermark degrades to the defaults rather than
// taking the link down.
export function shareLinkFromRow(
  row: ShareLinkRow,
  origin?: string,
  assetIds: string[] = [],
): ShareLink {
  const layout = shareLinkLayoutSchema.safeParse(row.layout);
  const branding = shareLinkBrandingSchema.safeParse(row.branding);
  const watermark = row.watermark ? shareLinkWatermarkSchema.safeParse(row.watermark) : null;
  return {
    id: row.id,
    brandId: row.brand_id,
    token: row.token,
    scope: row.scope,
    assetId: row.asset_id,
    collectionId: row.collection_id,
    assetIds,
    permissions: row.permissions,
    policy: {
      versionMode: row.version_mode,
      pinnedVersionId: row.pinned_version_id,
      allowComments: row.allow_comments,
      allowApproval: row.allow_approval,
      allowDownload: row.allow_download,
      showMetadata: row.show_metadata,
      showCustomFields: row.show_custom_fields,
      requireIdentity: row.require_identity,
      hasPasscode: row.has_passcode ?? row.passcode_hash != null,
    },
    layout: layout.success ? layout.data : 'grid',
    branding: branding.success ? branding.data : {},
    watermark: watermark?.success ? watermark.data : null,
    featuredFieldId: row.featured_field_id ?? null,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    url: origin ? buildShareUrl(origin, row.token) : null,
  };
}

// ─── supabase/functions/library-share ──────────────────────────────────────
// Guest actions are scoped by the share token (and the reviewer session token
// when one exists); owner actions carry the user's JWT and are brand-checked.

const token = z.string().min(16).max(128);
const sessionToken = z.string().min(32).max(256);
const uuid = z.string().uuid();
const viewer = {
  sessionToken: sessionToken.optional(),
  viewerIp: z.string().max(64).optional(),
  userAgent: z.string().max(300).optional(),
} as const;

export const shareGuestEventKindSchema = z.enum(['open', 'view', 'play', 'comment', 'decision']);

export const libraryShareRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('load_share'),
      token,
      ...viewer,
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().max(1000).optional(),
      assetId: uuid.optional(),
    })
    .strict(),
  z.object({ action: z.literal('share_presentation'), token }).strict(),
  z
    .object({
      action: z.literal('record_event'),
      token,
      ...viewer,
      kind: shareGuestEventKindSchema,
      assetId: uuid.optional(),
      versionId: uuid.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('prepare_download'),
      token,
      ...viewer,
      assetId: uuid.optional(),
      versionId: uuid.optional(),
      all: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('edit_featured_field'),
      token,
      ...viewer,
      sessionToken,
      assetId: uuid,
      versionId: uuid,
      // A featured field holds one value (the featurable types are single-valued).
      value: z.union([z.string().max(2048), z.number(), z.boolean(), z.null()]),
    })
    .strict(),
  z
    .object({
      action: z.literal('share_link_detail'),
      id: uuid.optional(),
      token: token.optional(),
    })
    .strict()
    .refine((value) => Boolean(value.id) !== Boolean(value.token), { message: 'id or token' }),
  z.object({ action: z.literal('asset_share_activity'), brandId: uuid, assetId: uuid }).strict(),
  updateShareLinkRequestSchema.extend({ action: z.literal('update_share_link') }),
]);
export type LibraryShareRequest = z.infer<typeof libraryShareRequestSchema>;

// prepare_download: a burned file or a zip streams from the Backend; an
// unburned single file is a signed URL to the original.
export const sharePreparedDownloadSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('backend') }).strict(),
  z.object({ mode: z.literal('redirect'), url: z.string().url() }).strict(),
]);
export type SharePreparedDownload = z.infer<typeof sharePreparedDownloadSchema>;
