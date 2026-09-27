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

/**
 * A Library URL with the custom review states set (or cleared) and every other filter kept.
 * The states live in client state mirrored into ?reviewStates=; building this from anything
 * but the latest intended URL drops filters (a base status picked a moment earlier was lost
 * while its navigation was still pending).
 */
export function withReviewStates(path: string, ids: readonly string[]): string {
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  if (ids.length > 0) params.set('reviewStates', ids.join(','));
  else params.delete('reviewStates');
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : (pathname ?? '/library');
}
