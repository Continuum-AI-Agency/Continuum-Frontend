// Every file the link lets this reviewer download, as one streamed zip from the
// Backend's share delivery (which resolves and signs the files itself).

import type { SharePreparedDownload } from '@continuum/contracts';
import { loadSharePresentation } from '../loadSharePayload';
import { invokeLibraryShare } from '../shareEdge.server';
import { fetchShareDelivery } from '../shareDownload.server';
import { viewerContext } from '../shareEvents.server';

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
  const viewer = await viewerContext(token);
  const prepared = await invokeLibraryShare<SharePreparedDownload>({
    action: 'prepare_download',
    token,
    ...viewer,
    all: true,
  });
  if (!prepared.ok) {
    return new Response(
      prepared.status === 403 ? 'Downloads are turned off for this link.' : 'This link is not available.',
      { status: prepared.status === 403 ? 403 : 404 },
    );
  }
  const presentation = await loadSharePresentation(token);
  return fetchShareDelivery('zip', {
    token,
    ...(viewer.sessionToken ? { sessionToken: viewer.sessionToken } : {}),
    ...(viewer.viewerIp ? { viewerIp: viewer.viewerIp } : {}),
    zipName: zipName(presentation?.title ?? presentation?.brandName),
  });
}
