// Downloads leave through the Backend's share delivery when the link burns its
// watermark (ffmpeg and sharp live there). The reviewer cookie is httpOnly and
// scoped to /share/<token>, so this server forwards it; the Backend re-checks
// the link and the session itself and trusts nothing else it is sent.

import 'server-only';

import type { ShareDeliveryFile } from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';

export async function fetchShareDelivery(
  kind: 'file' | 'zip',
  body: {
    token: string;
    sessionToken?: string;
    viewerIp?: string;
    files: ShareDeliveryFile[];
    zipName?: string;
  },
): Promise<Response> {
  const upstream = await fetch(`${getApiBaseUrl()}/api/media/share-delivery/${kind}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error('[share] delivery failed', { kind, status: upstream.status, detail: detail.slice(0, 300) });
    return new Response('This download is not available right now.', { status: upstream.ok ? 502 : upstream.status });
  }
  const headers = new Headers();
  for (const name of ['content-type', 'content-disposition', 'x-share-watermark']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('cache-control', 'private, no-store');
  return new Response(upstream.body, { status: 200, headers });
}
