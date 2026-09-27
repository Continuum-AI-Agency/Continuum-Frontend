// Pure share-link rules shared by the public /share/[token] page and the
// ShareLinkMenu. Kept free of server-only imports so bun:test covers it
// directly. Backed by media.share_links (deny-all RLS: only the library-share
// and library-creative-operations edge functions read or write rows).

export type { ShareLinkRow } from '@continuum/contracts';

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

// The row mapper lives in contracts, shared with the library-share edge function.
export { buildShareUrl, shareLinkFromRow as rowToShareLink } from '@continuum/contracts';
