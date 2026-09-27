// One asset's file from a share link. The edge function checks the link, the
// session and the download policy, records the download, and either hands back
// a signed URL to the original (no watermark to burn) or sends us to the Backend,
// which streams a copy marked with this reviewer's identity.

import type { SharePreparedDownload } from '@continuum/contracts';
import { invokeLibraryShare } from '../shareEdge.server';
import { fetchShareDelivery } from '../shareDownload.server';
import { viewerContext } from '../shareEvents.server';

export const maxDuration = 300;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const search = new URL(request.url).searchParams;
  const assetId = search.get('asset') ?? undefined;
  const versionId = search.get('version') ?? undefined;
  if (!assetId) return new Response('File not found.', { status: 404 });
  const viewer = await viewerContext(token);
  const prepared = await invokeLibraryShare<SharePreparedDownload>({
    action: 'prepare_download',
    token,
    ...viewer,
    assetId,
    ...(versionId ? { versionId } : {}),
  });
  if (!prepared.ok) {
    return new Response(
      prepared.status === 403 ? 'Downloads are turned off for this link.' : 'File not found.',
      { status: prepared.status === 403 ? 403 : 404 },
    );
  }
  if (prepared.data.mode === 'redirect') return Response.redirect(prepared.data.url, 302);
  return fetchShareDelivery('file', {
    token,
    ...(viewer.sessionToken ? { sessionToken: viewer.sessionToken } : {}),
    ...(viewer.viewerIp ? { viewerIp: viewer.viewerIp } : {}),
    assetId,
    ...(versionId ? { versionId } : {}),
  });
}
