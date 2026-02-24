import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  instagramOrganicMetricsResponseSchema,
  linkedInOrganicMetricsResponseSchema,
  organicMetricsResponseSchema,
} from "./organicMetrics";

function basePayload() {
  return {
    accountId: "acct-1",
    range: {
      preset: "last_7d" as const,
      since: "2026-02-17",
      until: "2026-02-23",
    },
    metrics: {},
  };
}

describe("organic metrics platform schemas", () => {
  test("instagram schema rejects linkedin payloads", () => {
    const parsed = instagramOrganicMetricsResponseSchema.safeParse({
      ...basePayload(),
      platform: "linkedin",
      posts: [{ id: "li-post-1", content: "LinkedIn body copy" }],
    });

    assert.equal(parsed.success, false);
  });

  test("linkedin schema accepts linkedin-specific post fields", () => {
    const parsed = linkedInOrganicMetricsResponseSchema.safeParse({
      ...basePayload(),
      platform: "linkedin",
      posts: [
        {
          id: "li-post-1",
          content: "LinkedIn body copy",
          author: "Continuum",
          headline: "Team update",
          reactions: 42,
          reposts: 5,
          postUrl: "https://www.linkedin.com/feed/update/urn:li:activity:123",
        },
      ],
    });

    assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.message);
  });

  test("union schema routes linkedin payloads to dedicated branch", () => {
    const parsed = organicMetricsResponseSchema.safeParse({
      ...basePayload(),
      platform: "linkedin",
      posts: [{ id: "li-post-2", content: "Dedicated LinkedIn schema payload" }],
    });

    assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.message);
    if (!parsed.success) return;

    assert.equal(parsed.data.platform, "linkedin");
  });
});
