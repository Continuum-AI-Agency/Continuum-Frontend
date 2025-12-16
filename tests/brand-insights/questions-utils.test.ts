import assert from "node:assert/strict";
import test from "node:test";

import type { BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";
import { filterAndSortQuestionsByNiche } from "@/components/brand-insights/questions-utils.ts";

const questionsByNiche: BrandInsightsQuestionsByNiche["questionsByNiche"] = {
  Marketing: {
    questions: [
      {
        id: "q1",
        question: "How do I measure ROI on TikTok ads?",
        socialPlatform: "tiktok",
        contentTypeSuggestion: "short-form explainer",
        whyRelevant: "Common objection for marketers",
        isSelected: false,
        timesUsed: 1,
      },
      {
        id: "q2",
        question: "What is the best cadence for posting?",
        isSelected: true,
        timesUsed: 0,
      },
    ],
  },
  Product: {
    questions: [
      {
        id: "q3",
        question: "Which features matter most to beginners?",
        whyRelevant: "Supports onboarding content",
        isSelected: false,
        timesUsed: 5,
      },
    ],
  },
};

test("filterAndSortQuestionsByNiche filters questions by query case-insensitively", () => {
  const result = filterAndSortQuestionsByNiche(questionsByNiche, { query: "tiktok" });
  assert.equal(result.length, 1);
  assert.equal(result[0].audience, "Marketing");
  assert.deepEqual(result[0].questions.map((q) => q.id), ["q1"]);
});

test("filterAndSortQuestionsByNiche sorts selected first then usage then question text", () => {
  const result = filterAndSortQuestionsByNiche(questionsByNiche, {});
  const marketingQuestions = result.find((entry) => entry.audience === "Marketing")!;
  assert.deepEqual(marketingQuestions.questions.map((q) => q.id), ["q2", "q1"]);
});

test("filterAndSortQuestionsByNiche respects selected-only toggle and removes empty niches", () => {
  const result = filterAndSortQuestionsByNiche(questionsByNiche, { onlySelected: true });
  assert.deepEqual(result.map((entry) => entry.audience), ["Marketing"]);
  assert.deepEqual(result[0].questions.map((q) => q.id), ["q2"]);
});

test("filterAndSortQuestionsByNiche infers supported platform filters from query tokens", () => {
  const youtubeQuestionsByNiche: BrandInsightsQuestionsByNiche["questionsByNiche"] = {
    AudienceA: {
      questions: [
        { id: "q1", question: "YT question", socialPlatform: "YouTube", isSelected: false, timesUsed: 0 },
        { id: "q2", question: "Other platform question", socialPlatform: "instagram", isSelected: false, timesUsed: 0 },
      ],
    },
  };

  const result = filterAndSortQuestionsByNiche(youtubeQuestionsByNiche, { query: "youtube" });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].questions.map((q) => q.id), ["q1"]);
});

test("filterAndSortQuestionsByNiche treats 'yt' token as YouTube platform filter", () => {
  const youtubeQuestionsByNiche: BrandInsightsQuestionsByNiche["questionsByNiche"] = {
    AudienceA: {
      questions: [
        { id: "q1", question: "YT question", socialPlatform: "YouTube", isSelected: false, timesUsed: 0 },
        { id: "q2", question: "Other platform question", socialPlatform: "instagram", isSelected: false, timesUsed: 0 },
      ],
    },
  };

  const result = filterAndSortQuestionsByNiche(youtubeQuestionsByNiche, { query: "yt" });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].questions.map((q) => q.id), ["q1"]);
});

test("filterAndSortQuestionsByNiche respects explicit platformFilter", () => {
  const result = filterAndSortQuestionsByNiche(questionsByNiche, {
    platformFilter: "linkedin",
  });
  assert.equal(result.length, 0);
});
