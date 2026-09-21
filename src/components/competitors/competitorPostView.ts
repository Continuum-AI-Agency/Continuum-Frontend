// One post in the Inspiration grid. The tracked feed and the saved view already
// arrive in this shape (CompetitorInspirationPost from @continuum/contracts); an
// ad-hoc handle search returns bare InstagramPosts, which are lifted into it with
// the contract's own format rule and no analysis. Search results have no
// competitorId (the account isn't tracked), which callers use to decide whether
// tracked-only actions (e.g. save-to-board) apply.

import {
  type CompetitorInspirationPost,
  type CompetitorPostFormat,
  competitorPostFormat,
  type InstagramCompetitorSearchResult,
  type InstagramMediaItem,
  type InstagramPost,
} from '@continuum/contracts';

export type CompetitorPostView = CompetitorInspirationPost;

export function competitorPostViewKey(view: CompetitorPostView): string {
  return `${view.instagramUsername}:${view.post.id}`;
}

// Slides to page through inside the enlarged preview. Only multi-item posts
// (carousels) are pageable; single posts and reels return an empty list so callers
// render the cover or the reel instead of mounting a carousel.
export function carouselSlides(post: InstagramPost): InstagramMediaItem[] {
  return post.items.length > 1 ? post.items : [];
}

export function searchResultToViews(result: InstagramCompetitorSearchResult): CompetitorPostView[] {
  const competitorName = result.account.name ?? result.account.username;
  return result.posts.map((post) => ({
    competitorId: null,
    competitorName,
    instagramUsername: result.account.username,
    post,
    format: competitorPostFormat(post.kind, null),
    analysis: null,
    relevance: null,
    whyItWorked: null,
  }));
}

export type PostTypeFilter = 'all' | InstagramPost['kind'];
export type FormatFilter = 'all' | CompetitorPostFormat;

export const POST_TYPE_LABELS: Record<InstagramPost['kind'], string> = {
  reel: 'Reels',
  carousel: 'Carousels',
  post: 'Posts',
};

// '3.2x' — how far a post beat its own account's median engagement. Two digits
// before the point drop the decimal ('12x'); null when the account has too few
// scorable posts for a baseline.
export function formatOutlier(score: number | null | undefined): string | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return score >= 10 ? `${Math.round(score)}x` : `${score.toFixed(1)}x`;
}

const outlierOf = (view: CompetitorPostView): number => view.post.outlierScore ?? -1;

// Highest multiplier first; unscored posts sink to the end in their incoming order.
export function sortByOutlier(views: CompetitorPostView[]): CompetitorPostView[] {
  return [...views].sort((a, b) => outlierOf(b) - outlierOf(a));
}

export function filterViews(
  views: CompetitorPostView[],
  filter: { postType: PostTypeFilter; format: FormatFilter },
): CompetitorPostView[] {
  return views.filter(
    (view) =>
      (filter.postType === 'all' || view.post.kind === filter.postType) &&
      (filter.format === 'all' || view.format === filter.format),
  );
}

// How many posts carry each value, in first-seen order, so the chip row only
// offers choices that return something.
export function countBy<T extends string>(
  views: CompetitorPostView[],
  pick: (view: CompetitorPostView) => T,
): Array<[T, number]> {
  const counts = new Map<T, number>();
  for (const view of views) {
    const key = pick(view);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts];
}
