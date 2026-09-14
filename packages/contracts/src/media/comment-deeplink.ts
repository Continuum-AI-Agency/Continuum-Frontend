/**
 * Address a comment, a video moment, or a time range from a URL.
 * Library: `/library?assetId=&comment=&t=&end=`
 * Share: `/share/{token}?comment=&t=&end=`
 * `t` / `end` are milliseconds, matching `time` annotations.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CommentDeepLink = {
  commentId: string | null;
  timeMs: number | null;
  endMs: number | null;
};

export function emptyCommentDeepLink(): CommentDeepLink {
  return { commentId: null, timeMs: null, endMs: null };
}

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function parseCommentDeepLink(params: {
  get: (key: string) => string | null;
}): CommentDeepLink {
  const comment = params.get('comment');
  const timeMs = parseMs(params.get('t'));
  const endMs = parseMs(params.get('end'));
  return {
    commentId: comment && UUID_RE.test(comment) ? comment : null,
    timeMs,
    endMs: timeMs != null && endMs != null && endMs > timeMs ? endMs : null,
  };
}

export function commentDeepLinkHasTarget(link: CommentDeepLink): boolean {
  return Boolean(link.commentId || link.timeMs != null);
}

/** Mutates `params` so a later `toString()` carries the deep link. */
export function applyCommentDeepLink(
  params: URLSearchParams,
  link: CommentDeepLink | null | undefined,
): URLSearchParams {
  params.delete('comment');
  params.delete('t');
  params.delete('end');
  if (!link) return params;
  if (link.commentId) params.set('comment', link.commentId);
  if (link.timeMs != null) params.set('t', String(link.timeMs));
  if (link.timeMs != null && link.endMs != null) params.set('end', String(link.endMs));
  return params;
}

export function buildLibraryAssetHref(input: {
  origin?: string;
  assetId: string;
  browse?: URLSearchParams | string;
  deepLink?: CommentDeepLink | null;
}): string {
  const params =
    input.browse instanceof URLSearchParams
      ? new URLSearchParams(input.browse)
      : new URLSearchParams(input.browse ?? '');
  params.set('assetId', input.assetId);
  applyCommentDeepLink(params, input.deepLink ?? null);
  const path = `/library?${params.toString()}`;
  return input.origin ? `${input.origin.replace(/\/+$/, '')}${path}` : path;
}

export function buildShareDeepLinkHref(input: {
  origin?: string;
  token: string;
  deepLink?: CommentDeepLink | null;
}): string {
  const params = new URLSearchParams();
  applyCommentDeepLink(params, input.deepLink ?? null);
  const query = params.toString();
  const path = query ? `/share/${input.token}?${query}` : `/share/${input.token}`;
  return input.origin ? `${input.origin.replace(/\/+$/, '')}${path}` : path;
}

export function commentDeepLinkFromAnnotation(
  commentId: string,
  annotation: { kind: string; timeMs?: number; endMs?: number } | null | undefined,
): CommentDeepLink {
  if (annotation?.kind === 'time' && typeof annotation.timeMs === 'number') {
    return {
      commentId,
      timeMs: annotation.timeMs,
      endMs: typeof annotation.endMs === 'number' ? annotation.endMs : null,
    };
  }
  return { commentId, timeMs: null, endMs: null };
}
