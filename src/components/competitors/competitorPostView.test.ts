import { describe, expect, it } from "bun:test";
import type {
  CompetitorOrganicPost,
  InstagramCompetitorSearchResult,
  InstagramPost,
} from "@continuum/contracts";

import {
  competitorPostViewKey,
  organicPostToView,
  searchResultToViews,
} from "./competitorPostView";

const post: InstagramPost = {
  id: "p1",
  shortcode: "abc",
  permalink: "https://instagram.com/p/abc/",
  kind: "post",
  coverUrl: "https://cdn.example.com/cover.jpg",
  caption: "hello",
  timestamp: "2026-01-01T00:00:00.000Z",
  likeCount: 12,
  commentsCount: 3,
  mediaCount: 1,
  items: [{ kind: "image", url: "https://cdn.example.com/cover.jpg" }],
};

describe("competitorPostView", () => {
  it("maps a tracked organic post preserving competitorId and the raw post", () => {
    const item: CompetitorOrganicPost = {
      competitorId: "c1",
      competitorName: "Nike",
      instagramUsername: "nike",
      post,
    };
    const view = organicPostToView(item);
    expect(view.competitorId).toBe("c1");
    expect(view.competitorName).toBe("Nike");
    expect(view.instagramUsername).toBe("nike");
    expect(view.post).toBe(post);
    expect(competitorPostViewKey(view)).toBe("nike:p1");
  });

  it("maps search results with no competitorId and account name fallback", () => {
    const result: InstagramCompetitorSearchResult = {
      query: "nike",
      resolvedUsername: "nike",
      account: {
        id: "1",
        username: "nike",
        name: "Nike",
        followersCount: 1000,
        mediaCount: 50,
        profilePictureUrl: "https://cdn.example.com/pic.jpg",
      },
      posts: [post],
      metaPageCandidates: [],
      warnings: [],
    };
    const views = searchResultToViews(result);
    expect(views).toHaveLength(1);
    expect(views[0].competitorId).toBeUndefined();
    expect(views[0].competitorName).toBe("Nike");
    expect(views[0].instagramUsername).toBe("nike");
  });

  it("falls back to the username when the account has no display name", () => {
    const result: InstagramCompetitorSearchResult = {
      query: "someshop",
      resolvedUsername: "someshop",
      account: { username: "someshop", name: null, followersCount: null },
      posts: [post],
      metaPageCandidates: [],
      warnings: [],
    };
    const [view] = searchResultToViews(result);
    expect(view.competitorName).toBe("someshop");
  });
});
