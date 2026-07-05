// A unified view over a competitor's Instagram post, sourced either from the
// tracked-competitor feed (CompetitorOrganicPost) or from an ad-hoc handle
// search (InstagramCompetitorSearchResult). Both carry the same InstagramPost;
// search results have no competitorId (the account isn't tracked), which callers
// use to decide whether tracked-only actions (e.g. save-to-board) apply.

import type {
  CompetitorOrganicPost,
  InstagramCompetitorSearchResult,
  InstagramMediaItem,
  InstagramPost,
} from "@continuum/contracts";

export interface CompetitorPostView {
  competitorId?: string;
  competitorName: string;
  instagramUsername: string;
  post: InstagramPost;
}

export function competitorPostViewKey(view: CompetitorPostView): string {
  return `${view.instagramUsername}:${view.post.id}`;
}

// Slides to page through inside the enlarged hover preview. Only multi-item posts
// (carousels) are pageable; single posts and reels return an empty list so callers
// render the cover thumbnail instead of mounting a carousel.
export function carouselSlides(post: InstagramPost): InstagramMediaItem[] {
  return post.items.length > 1 ? post.items : [];
}

export function organicPostToView(item: CompetitorOrganicPost): CompetitorPostView {
  return {
    competitorId: item.competitorId,
    competitorName: item.competitorName,
    instagramUsername: item.instagramUsername,
    post: item.post,
  };
}

export function searchResultToViews(result: InstagramCompetitorSearchResult): CompetitorPostView[] {
  const competitorName = result.account.name ?? result.account.username;
  return result.posts.map((post) => ({
    competitorName,
    instagramUsername: result.account.username,
    post,
  }));
}
