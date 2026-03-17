import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  calendarPlacementSchema,
  calendarGenerationRequestSchema,
  toBackendCalendarGenerationRequest,
} from "./calendar-generation";

function buildRequestPayload() {
  return {
    brandProfileId: "brand-123",
    weekStart: "2026-02-23",
    timezone: "America/New_York",
    placements: [
      {
        placementId: "seed-1",
        schedule: {
          dayId: "2026-02-23",
          scheduledAt: "2026-02-23T14:00:00.000Z",
          timeLabel: "9:00 AM",
        },
        platform: {
          name: "instagram" as const,
          accountId: "acct-1",
        },
        seed: {
          source: "trend" as const,
          trendId: "trend-42",
        },
        content: {
          format: "static",
        },
      },
    ],
    platformAccountIds: {
      instagram: "acct-1",
    },
    options: {
      schedulePreset: "beta-launch" as const,
      includeNewsletter: true,
      newsletterDayId: "2026-02-25",
      preferredPlatforms: ["instagram", "linkedin"] as const,
    },
  };
}

describe("calendarGenerationRequestSchema", () => {
  test("accepts a valid placement with schedule/platform/seed blocks", () => {
    const parsed = calendarGenerationRequestSchema.safeParse(buildRequestPayload());
    assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.message);
  });

  test("rejects scheduledAt when it does not match dayId", () => {
    const parsed = calendarGenerationRequestSchema.safeParse({
      ...buildRequestPayload(),
      placements: [
        {
          ...buildRequestPayload().placements[0],
          schedule: {
            dayId: "2026-02-23",
            scheduledAt: "2026-02-24T09:00:00.000Z",
            timeLabel: "9:00 AM",
          },
        },
      ],
    });
    assert.equal(parsed.success, false);
  });

  test("rejects trend source seed without trendId", () => {
    const parsed = calendarGenerationRequestSchema.safeParse({
      ...buildRequestPayload(),
      placements: [
        {
          ...buildRequestPayload().placements[0],
          seed: {
            source: "trend",
          },
        },
      ],
    });
    assert.equal(parsed.success, false);
  });

  test("accepts mediaSuggestion generationContext payload", () => {
    const parsed = calendarPlacementSchema.safeParse({
      placementId: "seed-1",
      schedule: {
        dayId: "2026-02-23",
        scheduledAt: "2026-02-23T14:00:00.000Z",
      },
      platform: {
        name: "instagram",
      },
      seed: {
        source: "manual",
      },
      content: {
        format: "FeedPost",
      },
      creative: {
        mediaSuggestion: {
          kind: "carousel",
          assetBase64: "iVBORw0KGgoAAAANSUhEUgAA",
          generationContext: {
            sourceAgent: "creative-director",
            finalPrompt: "Generate the hero slide",
            request: {
              provider: "nano-banana",
              model: "2-flash",
              imageSize: "500x500",
            },
            placement: {
              placementId: "seed-1",
              dayId: "2026-02-23",
              scheduledAt: "2026-02-23T14:00:00.000Z",
            },
            strategist: {
              objective: "Awareness",
              funnel: "TOFU",
              funnelStage: "middle",
              targetAudience: "Families",
              tone: "Direct",
              angle: "Pain-point",
              postType: "Post",
              postSize: "Square",
            },
            creativeDirection: {
              title: "Monday Momentum",
              conceptTitle: "Monday Momentum",
              direction: "Fast-paced",
              creativeDirection: "Focus on family dinner relief",
              hook: "60-second save",
              storyHook: "Dinner solved in one tap",
              trendIntegration: "Tie to weekly trend",
              modes: ["carousel", "static"],
              visualMode: "carousel",
              audioMode: "music-led",
              notes: "High contrast visuals",
              productionNotes: ["Use warm natural light"],
            },
            trend: {
              trendId: "trend-42",
              seedSource: "trend",
            },
          },
        },
      },
    });

    assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.message);
    if (parsed.success) {
      assert.equal(parsed.data.creative?.mediaSuggestion?.generationContext?.strategist?.funnelStage, "middle");
      assert.equal(
        parsed.data.creative?.mediaSuggestion?.generationContext?.creativeDirection?.conceptTitle,
        "Monday Momentum"
      );
      assert.equal(
        parsed.data.creative?.mediaSuggestion?.generationContext?.creativeDirection?.storyHook,
        "Dinner solved in one tap"
      );
    }
  });

  test("accepts nullable mediaSuggestion fields from streaming payloads", () => {
    const parsed = calendarPlacementSchema.safeParse({
      placementId: "seed-2",
      schedule: {
        dayId: "2026-02-24",
        scheduledAt: "2026-02-24T14:00:00.000Z",
      },
      platform: {
        name: "instagram",
      },
      seed: {
        source: "manual",
      },
      content: {
        format: "FeedPost",
      },
      creative: {
        mediaSuggestion: {
          provider: "nano-banana",
          model: "2-flash",
          kind: "carousel",
          prompt: "Prompt",
          width: 512,
          height: 512,
          assetUrl: null,
          assetBase64: null,
          alt: null,
          generationContext: null,
        },
      },
    });

    assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.message);
  });

});

describe("toBackendCalendarGenerationRequest", () => {
  test("flattens placement schedule and seed data for backend payload", () => {
    const backend = toBackendCalendarGenerationRequest(
      calendarGenerationRequestSchema.parse(buildRequestPayload())
    );

    assert.equal(backend.placements[0]?.placementId, "seed-1");
    assert.equal(backend.placements[0]?.dayId, "2026-02-23");
    assert.equal(backend.placements[0]?.scheduledAt, "2026-02-23T14:00:00.000Z");
    assert.equal(backend.placements[0]?.trendId, "trend-42");
    assert.equal(backend.placements[0]?.seedSource, "trend");
    assert.equal(backend.placements[0]?.desiredFormat, "post");
    assert.equal(backend.placements[0]?.platform, "instagram");
  });

  test("rejects mixed-platform placement batches", () => {
    const parsed = calendarGenerationRequestSchema.parse({
      ...buildRequestPayload(),
      placements: [
        buildRequestPayload().placements[0],
        {
          ...buildRequestPayload().placements[0],
          placementId: "seed-2",
          platform: { name: "linkedin", accountId: "acct-2" },
        },
      ],
      platformAccountIds: {
        instagram: "acct-1",
        linkedin: "acct-2",
      },
    });

    assert.throws(() => toBackendCalendarGenerationRequest(parsed));
  });
});
