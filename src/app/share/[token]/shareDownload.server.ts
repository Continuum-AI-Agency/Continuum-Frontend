// Downloads that must be made (a watermark burned in) or assembled (a zip) come
// from the Backend's share delivery. The reviewer cookie is httpOnly and scoped to
// /share/<token>, so this server forwards the session token; the Backend re-checks
// the link and the session and signs the originals itself.

import 'server-only';

import type { ShareDeliveryRequest } from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';

export async function fetchShareDelivery(
  kind: 'file' | 'zip',
  body: ShareDeliveryRequest,
): Promise<Response> {
  const upstream = await fetch(`${getApiBaseUrl()}/api/media/share-delivery/${kind}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error('[share] delivery failed', {
      kind,
      status: upstream.status,
      detail: detail.slice(0, 300),
    });
    return new Response('This download is not available right now.', {
      status: upstream.ok ? 502 : upstream.status,
    });
  }
  const headers = new Headers();
  for (const name of ['content-type', 'content-disposition', 'x-share-watermark']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('cache-control', 'private, no-store');
  return new Response(upstream.body, { status: 200, headers });
}
