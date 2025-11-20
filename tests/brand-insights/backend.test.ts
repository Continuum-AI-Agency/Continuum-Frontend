import assert from "node:assert/strict";
import test from "node:test";

import {
  mapBackendGenerationResponse,
  mapBackendInsightsResponse,
  mapBackendProfileResponse,
  mapBackendStatusResponse,
} from "../../src/lib/brand-insights/backend.ts";

test("mapBackendInsightsResponse normalizes snake_case fields", () => {
  const payload = {
    status: "success",
    generated_at: "2024-07-01T00:00:00Z",
    data: {
      generation_id: "gen-123",
      trends_and_events: {
        status: "success",
        trends: [
          {
            id: "trend-1",
            title: "AI-driven personalization",
            description: null,
            relevance_to_brand: "Highly aligned with current campaigns",
            source: "Forrester",
            is_selected: null,
            times_used: null,
          },
        ],
        events: [
          {
            id: "event-1",
            title: "Black Friday",
            date: "2024-11-29",
            description: "Seasonal spike",
            opportunity: "Launch gift bundles",
            is_selected: true,
            times_used: 1,
          },
        ],
        country: "US",
        week_analyzed: "2024-W27",
        generated_at: "2024-07-01T00:00:00Z",
      },
      questions_by_niche: {
        status: "success",
        questions_by_niche: {
          Fitness: {
            questions: [
              {
                id: "q1",
                question: "How do I stay consistent when traveling?",
                social_platform: "instagram",
                content_type_suggestion: "story",
                why_relevant: "Matches brand travel audience",
                is_selected: null,
                times_used: null,
              },
            ],
            total_generated: 1,
          },
        },
        summary: {
          total_niches: 1,
          total_questions: 1,
          average_per_niche: 1,
        },
        generated_at: "2024-07-01T00:00:00Z",
      },
      country: "US",
      week_start_date: "2024-07-01",
      from_cache: true,
      selected_social_platforms: ["instagram"],
    },
  };

  const result = mapBackendInsightsResponse(payload);

  assert.equal(result.status, "success");
  assert.equal(result.data.generationId, "gen-123");
  assert.equal(result.data.trendsAndEvents.trends[0].relevanceToBrand, "Highly aligned with current campaigns");
  assert.equal(result.data.trendsAndEvents.trends[0].timesUsed, 0);
  assert.equal(result.data.trendsAndEvents.events[0].date, "2024-11-29");
  assert.equal(result.data.questionsByNiche.questionsByNiche.Fitness.questions[0].socialPlatform, "instagram");
  assert.equal(result.data.questionsByNiche.questionsByNiche.Fitness.questions[0].isSelected, false);
  assert.equal(result.data.fromCache, true);
  assert.deepEqual(result.data.selectedSocialPlatforms, ["instagram"]);
});

test("mapBackendGenerationResponse maps processing and success responses", () => {
  const processing = mapBackendGenerationResponse({
    status: "processing",
    data: { task_id: "task-1", brand_id: "brand-123" },
  });

  assert.equal(processing.status, "processing");
  assert.equal(processing.taskId, "task-1");
  assert.equal(processing.brandId, "brand-123");

  const success = mapBackendGenerationResponse({
    status: "success",
    data: {
      brand_id: "brand-123",
      generation_id: "gen-999",
      from_cache: true,
      counts: { trends: 4, events: 2, questions: 12 },
    },
  });

  assert.equal(success.status, "success");
  assert.equal(success.brandId, "brand-123");
  assert.equal(success.generationId, "gen-999");
  assert.equal(success.fromCache, true);
  assert.equal(success.counts?.trends, 4);
  assert.equal(success.counts?.events, 2);
  assert.equal(success.counts?.questions, 12);
});

test("mapBackendGenerationResponse accepts legacy platform ids", () => {
  const result = mapBackendGenerationResponse({
    status: "success",
    data: {
      platform_account_id: "acct-789",
      generation_id: "gen-789",
      from_cache: false,
    },
  });

  assert.equal(result.brandId, "acct-789");
  assert.equal(result.generationId, "gen-789");
  assert.equal(result.fromCache, false);
});

test("mapBackendStatusResponse normalizes known and unknown statuses", () => {
  const running = mapBackendStatusResponse({
    status: "running",
    task_id: "task-1",
    brand_id: "brand-123",
  });

  assert.equal(running.status, "running");
  assert.equal(running.taskId, "task-1");
  assert.equal(running.brandId, "brand-123");

  const unknown = mapBackendStatusResponse({
    status: "bogus",
    task_id: "task-2",
  });

  assert.equal(unknown.status, "error");
  assert.equal(unknown.taskId, "task-2");
});

test("mapBackendProfileResponse maps new strategic analysis fields", () => {
  const payload = {
    status: "success",
    data: {
      brand_id: "brand-abc",
      brand_summary: "Premium fitness brand focused on mobility.",
      brand_foundation: {
        mission: "Empower everyday athletes",
        vision: "Movement without pain",
        core_values: ["Consistency", "Curiosity", ""],
        niches: ["Mobility"],
      },
      niches: ["Strength"],
      audience_profile: {
        summary: "Busy professionals seeking quick wins",
        pain_points: ["Lack of time"],
        motivations: ["Visible progress"],
        segments: [{ name: "Corporate athletes", description: "Office workers training after hours" }],
      },
      competitive_landscape: {
        top_competitors: [
          { name: "GymCo", strategy: "Price leader", messaging: "Strong every day", urls: ["https://gym.co"] },
        ],
      },
      brand_voice: {
        tone: "Encouraging",
        keywords: ["mobile", "resilient", ""],
        emoji_usage: "light",
        key_messaging: ["Progress over perfection"],
      },
    },
  };

  const result = mapBackendProfileResponse(payload);

  assert.equal(result.status, "success");
  assert.equal(result.brandId, "brand-abc");
  assert.equal(result.mission, "Empower everyday athletes");
  assert.deepEqual(result.coreValues, ["Consistency", "Curiosity"]);
  assert.deepEqual(result.niches, ["Strength"]);
  assert.equal(result.audience?.summary, "Busy professionals seeking quick wins");
  assert.equal(result.audience?.painsAndFears?.[0], "Lack of time");
  assert.equal(result.audience?.motivationsAndTriggers?.[0], "Visible progress");
  assert.equal(result.competitors?.[0].name, "GymCo");
  assert.equal(result.brandVoice?.tone, "Encouraging");
  assert.deepEqual(result.brandVoice?.keywords, ["mobile", "resilient"]);
});

test("mapBackendProfileResponse gracefully handles onboarding_required", () => {
  const result = mapBackendProfileResponse({
    status: "onboarding_required",
    data: null,
  });

  assert.equal(result.status, "onboarding_required");
  assert.equal(result.brandId, undefined);
});

test("mapBackendProfileResponse drops empty competitor rows and voice noise", () => {
  const payload = {
    status: "success",
    data: {
      brand_id: "brand-empty",
      brand_foundation: {
        mission: "Do more with less",
      },
      competitive_landscape: {
        top_competitors: [
          { name: "", strategy: "missing name", urls: [""] },
          { name: "Named", primary_url: "https://example.com", messaging: null, strategy: null },
        ],
      },
      brand_voice: {
        tone: null,
        keywords: [null, "sharp"],
        emoji_usage: "minimal",
        key_messaging: [""],
      },
    },
  };

  const result = mapBackendProfileResponse(payload);

  assert.equal(result.competitors?.length, 1);
  assert.equal(result.competitors?.[0].name, "Named");
  assert.deepEqual(result.brandVoice?.keywords, ["sharp"]);
  assert.equal(result.brandVoice?.keyMessaging, undefined);
});

test("mapBackendInsightsResponse falls back to event_date and defaults selection flags", () => {
  const payload = {
    status: "success",
    data: {
      generation_id: "gen-xyz",
      trends_and_events: {
        trends: [],
        events: [
          {
            id: "event-legacy",
            title: "Launch",
            event_date: "2024-09-01",
          },
        ],
      },
      questions_by_niche: {
        questions_by_niche: {
          Default: {
            questions: [
              {
                id: "q-legacy",
                question: "What changed?",
                platform: "tiktok",
              },
            ],
          },
        },
      },
      week_start_date: "2024-09-01",
    },
  };

  const result = mapBackendInsightsResponse(payload);

  assert.equal(result.data.trendsAndEvents.events[0].date, "2024-09-01");
  assert.equal(result.data.trendsAndEvents.events[0].isSelected, false);
  assert.equal(result.data.questionsByNiche.questionsByNiche.Default.questions[0].socialPlatform, "tiktok");
  assert.equal(result.data.questionsByNiche.questionsByNiche.Default.questions[0].isSelected, false);
});
