// Share analytics: what an external reviewer did on a link. The library-share
// edge function writes media.share_link_events (and hashes the IP per link);
// this server only forwards what the request knows — the reviewer's session
// cookie, the viewer's IP and user agent.

import 'server-only';

import type { LibraryShareRequest } from '@continuum/contracts';
import { cookies, headers } from 'next/headers';
import { reviewerSessionCookieName } from './reviewerSession.server';
import { invokeLibraryShare } from './shareEdge.server';

export async function viewerIp(): Promise<string | null> {
  const list = await headers();
  const forwarded = list.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || list.get('x-real-ip') || null;
}

export async function reviewerSessionToken(token: string): Promise<string | undefined> {
  return (await cookies()).get(reviewerSessionCookieName(token))?.value;
}

// What every guest call carries about the viewer.
export async function viewerContext(
  token: string,
  sessionToken?: string,
): Promise<{ sessionToken?: string; viewerIp?: string; userAgent?: string }> {
  const session = sessionToken ?? (await reviewerSessionToken(token));
  const ip = await viewerIp();
  const agent = (await headers()).get('user-agent');
  return {
    ...(session ? { sessionToken: session } : {}),
    ...(ip ? { viewerIp: ip } : {}),
    ...(agent ? { userAgent: agent.slice(0, 300) } : {}),
  };
}

type EventKind = Extract<LibraryShareRequest, { action: 'record_event' }>['kind'];

// Analytics never blocks the reviewer's action: a lost event is logged, not thrown.
export async function recordShareEvent(
  token: string,
  event: { kind: EventKind; assetId?: string; versionId?: string; sessionToken?: string },
): Promise<{ ok: boolean; status: number }> {
  const { sessionToken, ...rest } = event;
  const result = await invokeLibraryShare({
    action: 'record_event',
    token,
    ...(await viewerContext(token, sessionToken)),
    ...rest,
  });
  if (!result.ok) console.error('[share] event not recorded', { kind: event.kind, status: result.status });
  return { ok: result.ok, status: result.status };
}
