import assert from "node:assert/strict";
import test from "node:test";

import { mapDashboardResponse } from "../../src/lib/competitors/backend.ts";

test("mapDashboardResponse accepts object carousel items", () => {
  const payload = {
    status: "success",
    cache_age_seconds: 12,
    profile: {
      username: "microsoft",
      followers_count: 123,
      profile_pic_url: "https://example.com/pic.jpg",
      verified: true,
      full_name: "Microsoft",
    },
    posts: [
      {
        id: "post-1",
        caption: "hello",
        hashtags: ["#one"],
        media_urls: null,
        carousel_items: [
          { media_url: "https://example.com/a.jpg" },
          { url: "https://example.com/b.jpg" },
          "https://example.com/c.jpg",
          { display_url: "   https://example.com/d.jpg   " },
          { some_new_key: "https://example.com/e.jpg" },
          { unexpected: "ignored" },
        ],
        shortcode: "abc",
        product_type: "feed",
        type: "carousel",
        likes_count: 1,
        comments_count: 2,
        views: 3,
        is_pinned: false,
        timestamp: "2024-01-01T00:00:00Z",
      },
    ],
  };

  const result = mapDashboardResponse(payload);

  assert.equal(result.status, "success");
  assert.equal(result.profile?.username, "microsoft");
  assert.deepEqual(result.posts[0]?.carouselItems, [
    "https://example.com/a.jpg",
    "https://example.com/b.jpg",
    "https://example.com/c.jpg",
    "https://example.com/d.jpg",
    "https://example.com/e.jpg",
  ]);
});
