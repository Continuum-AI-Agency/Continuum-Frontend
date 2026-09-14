import { describe, expect, it } from 'bun:test';
import {
  applyCommentDeepLink,
  buildLibraryAssetHref,
  buildShareDeepLinkHref,
  commentDeepLinkFromAnnotation,
  parseCommentDeepLink,
} from './comment-deeplink';

const commentId = '11111111-1111-4111-8111-111111111111';
const assetId = '22222222-2222-4222-8222-222222222222';

describe('comment deep links', () => {
  it('parses comment + range and drops an inverted range', () => {
    expect(
      parseCommentDeepLink(new URLSearchParams(`comment=${commentId}&t=4000&end=9000`)),
    ).toEqual({ commentId, timeMs: 4000, endMs: 9000 });
    expect(parseCommentDeepLink(new URLSearchParams('t=9000&end=4000'))).toEqual({
      commentId: null,
      timeMs: 9000,
      endMs: null,
    });
  });

  it('ignores a non-uuid comment id', () => {
    expect(parseCommentDeepLink(new URLSearchParams('comment=not-a-uuid')).commentId).toBeNull();
  });

  it('round-trips onto library and share URLs', () => {
    const deepLink = { commentId, timeMs: 1200, endMs: 3400 };
    const library = buildLibraryAssetHref({
      origin: 'https://app.trycontinuum.ai',
      assetId,
      browse: 'destination=home',
      deepLink,
    });
    expect(library).toBe(
      `https://app.trycontinuum.ai/library?destination=home&assetId=${assetId}&comment=${commentId}&t=1200&end=3400`,
    );
    expect(parseCommentDeepLink(new URL(library).searchParams)).toEqual(deepLink);

    const share = buildShareDeepLinkHref({
      origin: 'https://app.trycontinuum.ai',
      token: 'tok_abc',
      deepLink,
    });
    expect(share).toBe(
      `https://app.trycontinuum.ai/share/tok_abc?comment=${commentId}&t=1200&end=3400`,
    );
  });

  it('pins a time annotation onto the comment id', () => {
    expect(
      commentDeepLinkFromAnnotation(commentId, { kind: 'time', timeMs: 1500, endMs: 2000 }),
    ).toEqual({ commentId, timeMs: 1500, endMs: 2000 });
    expect(commentDeepLinkFromAnnotation(commentId, { kind: 'box' })).toEqual({
      commentId,
      timeMs: null,
      endMs: null,
    });
  });

  it('clears stale t/end when applying an empty link', () => {
    const params = new URLSearchParams('comment=x&t=1&end=2');
    applyCommentDeepLink(params, { commentId: null, timeMs: null, endMs: null });
    expect(params.toString()).toBe('');
  });
});
