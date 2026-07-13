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

export function rowToShareLink(row: ShareLinkRow, origin?: string): ShareLink {
  return {
    id: row.id,
    brandId: row.brand_id,
    token: row.token,
    scope: row.scope,
    assetId: row.asset_id,
    collectionId: row.collection_id,
    permissions: row.permissions,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    url: origin ? buildShareUrl(origin, row.token) : null,
  };
}
