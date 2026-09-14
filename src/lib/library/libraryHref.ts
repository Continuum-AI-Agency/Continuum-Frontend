import {
  applyCommentDeepLink,
  type CommentDeepLink,
  type LibraryBrowseQuery,
} from '@continuum/contracts';
import { buildLibraryBrowseParams } from '@/lib/media/filters';

export function librarySearchPath(
  query: LibraryBrowseQuery,
  overlay: { assetId?: string | null; deepLink?: CommentDeepLink | null } = {},
): string {
  const params = buildLibraryBrowseParams(query, { includeBrandId: false, cursor: null });
  if (overlay.assetId) params.set('assetId', overlay.assetId);
  else params.delete('assetId');
  applyCommentDeepLink(params, overlay.assetId ? (overlay.deepLink ?? null) : null);
  const qs = params.toString();
  return qs ? `/library?${qs}` : '/library';
}
