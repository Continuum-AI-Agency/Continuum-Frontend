// Share analytics: what an external reviewer did on a link, written by this
// server (service role) into media.share_link_events. The IP is kept only as a
// per-link hash — enough to tell two viewers apart, never to find one.

import 'server-only';

import { createHash } from 'node:crypto';
import type { ShareLinkEventKind } from '@continuum/contracts';
import { cookies, headers } from 'next/headers';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { reviewerSessionCookieName } from './reviewerSession.server';

export type ShareEventTarget = {
  linkId: string;
  brandId: string;
  sessionId: string | null;
};

export async function viewerIp(): Promise<string | null> {
  const list = await headers();
  const forwarded = list.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || list.get('x-real-ip') || null;
}

export async function reviewerSessionToken(token: string): Promise<string | undefined> {
  return (await cookies()).get(reviewerSessionCookieName(token))?.value;
}

export async function recordShareEvent(
  target: ShareEventTarget,
  event: { kind: ShareLinkEventKind; assetId?: string | null; versionId?: string | null },
): Promise<void> {
  const ip = await viewerIp();
  const userAgent = (await headers()).get('user-agent');
  const { error } = await mediaSchema(createSupabaseAdminClient())
    .from('share_link_events')
    .insert({
      share_link_id: target.linkId,
      brand_id: target.brandId,
      reviewer_session_id: target.sessionId,
      asset_id: event.assetId ?? null,
      version_id: event.versionId ?? null,
      kind: event.kind,
      ip_hash: ip
        ? createHash('sha256').update(`${target.linkId}:${ip}`).digest('hex').slice(0, 32)
        : null,
      user_agent: userAgent ? userAgent.slice(0, 300) : null,
    });
  // Analytics never blocks the reviewer's action; a lost row is logged, not thrown.
  if (error) console.error('[share] event insert failed', { kind: event.kind, error });
}
