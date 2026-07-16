// Pure share-link rules shared by the /api/library/share route, the public
// /share/[token] page, and the ShareLinkMenu. Kept free of server-only imports
// so bun:test covers it directly. Backed by media.share_links (deny-all RLS:
// only the service-role client reads or writes rows).

import type { ShareLink, ShareLinkScope } from '@continuum/contracts';

export type ShareLinkRow = {
  id: string;
  brand_id: string;
  token: string;
  scope: ShareLinkScope;
  asset_id: string | null;
  collection_id: string | null;
  version_mode: 'live' | 'pinned' | 'all';
  pinned_version_id: string | null;
  allow_comments: boolean;
  allow_approval: boolean;
  allow_download: boolean;
  show_metadata: boolean;
  show_custom_fields: boolean;
  require_identity: boolean;
  passcode_hash: string | null;
  permissions: 'view';
  created_by: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type ShareLinkStatus = { active: true } | { active: false; reason: 'revoked' | 'expired' };

export function shareLinkStatus(
  link: { revokedAt?: string | null; expiresAt?: string | null },
  now: Date = new Date(),
): ShareLinkStatus {
  if (link.revokedAt) return { active: false, reason: 'revoked' };
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime()) {
    return { active: false, reason: 'expired' };
  }
  return { active: true };
}

const MS_PER_DAY = 86_400_000;

export function expiresAtFromDays(days: number | undefined, now: Date = new Date()): string | null {
  if (!days) return null;
  return new Date(now.getTime() + days * MS_PER_DAY).toISOString();
}

export function buildShareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/share/${token}`;
}

export function rowToShareLink(
  row: ShareLinkRow,
  origin?: string,
  assetIds: string[] = [],
): ShareLink {
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
      hasPasscode: row.passcode_hash !== null,
    },
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    url: origin ? buildShareUrl(origin, row.token) : null,
  };
}
