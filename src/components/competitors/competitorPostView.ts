// A unified view over a competitor's Instagram post, sourced either from the
// tracked-competitor feed (CompetitorOrganicPost) or from an ad-hoc handle
// search (InstagramCompetitorSearchResult). Both carry the same InstagramPost;
// search results have no competitorId (the account isn't tracked), which callers
// use to decide whether tracked-only actions (e.g. save-to-board) apply.

import type {
  CompetitorOrganicPost,
  InstagramCompetitorSearchResult,
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
