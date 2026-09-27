// One asset's file from a share link. A link without a burned watermark hands
// out the stored file through a signed URL; a burning link streams the copy
// the Backend marked with this reviewer's identity.

import { withForcedDownload } from '@/lib/media/downloadUrl';
import { loadSharePayload } from '../loadSharePayload';
import { fetchShareDelivery } from '../shareDownload.server';
import { recordShareEvent, reviewerSessionToken, viewerIp } from '../shareEvents.server';

export const maxDuration = 300;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const search = new URL(request.url).searchParams;
  const sessionToken = await reviewerSessionToken(token);
  const ip = await viewerIp();
  const result = await loadSharePayload(token, sessionToken, ip, {
    assetId: search.get('asset') ?? undefined,
  });
  if (!result.ok) return new Response('This link is not available.', { status: 404 });
  if (!result.payload.policy.allowDownload) {
    return new Response('Downloads are turned off for this link.', { status: 403 });
  }
  const shared = result.payload.assets.find(
    (entry) =>
      entry.asset.id === search.get('asset') &&
      (!search.get('version') || entry.versionId === search.get('version')),
  );
  if (!shared?.asset.signedUrl) return new Response('File not found.', { status: 404 });

  await recordShareEvent(result.context, {
    kind: 'download',
    assetId: shared.asset.id,
    versionId: shared.versionId,
  });
  const { asset } = shared;
  if (!result.payload.watermark?.burnDownloads) {
    return Response.redirect(withForcedDownload(asset.signedUrl as string, asset.fileName), 302);
  }
  return fetchShareDelivery('file', {
    token,
    sessionToken,
    viewerIp: ip ?? undefined,
    files: [{ url: asset.signedUrl as string, fileName: asset.fileName, mimeType: asset.mimeType }],
  });
}
