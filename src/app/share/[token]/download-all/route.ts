// Every file the link lets this reviewer download, as one streamed zip.

import { loadSharePayload } from '../loadSharePayload';
import { fetchShareDelivery } from '../shareDownload.server';
import { recordShareEvent, reviewerSessionToken, viewerIp } from '../shareEvents.server';

export const maxDuration = 300;

function zipName(title: string | null | undefined): string {
  const slug = (title ?? 'shared-files')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return `${slug || 'shared-files'}.zip`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sessionToken = await reviewerSessionToken(token);
  const ip = await viewerIp();
  // Every member, not one page: the zip is the whole share.
  const result = await loadSharePayload(token, sessionToken, ip, { pageSize: 1000 });
  if (!result.ok) return new Response('This link is not available.', { status: 404 });
  if (!result.payload.policy.allowDownload) {
    return new Response('Downloads are turned off for this link.', { status: 403 });
  }
  const files = result.payload.assets.flatMap(({ asset }) =>
    asset.signedUrl
      ? [{ url: asset.signedUrl, fileName: asset.fileName, mimeType: asset.mimeType }]
      : [],
  );
  if (files.length === 0) return new Response('Nothing to download.', { status: 404 });

  await recordShareEvent(result.context, { kind: 'download_all' });
  return fetchShareDelivery('zip', {
    token,
    sessionToken,
    viewerIp: ip ?? undefined,
    files,
    zipName: zipName(result.payload.collectionName ?? result.payload.branding?.headerTitle),
  });
}
