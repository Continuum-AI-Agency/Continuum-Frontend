import type { BrandInsights, BrandInsightsQuestionsByNiche } from "@/lib/schemas/brandInsights";

type AutoGenerateInput = {
  insights: BrandInsights | null;
  errorMessage?: string | null;
};

function countQuestions(questionsByNiche: BrandInsightsQuestionsByNiche) {
  return Object.values(questionsByNiche.questionsByNiche ?? {}).reduce((total, niche) => {
    return total + (niche.questions?.length ?? 0);
  }, 0);
}

function isProcessingStatus(value?: string | null) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized.includes("processing") || normalized.includes("running");
}

function isMissingInsightsError(message?: string | null) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("unavailable") ||
    normalized.includes("not found") ||
    normalized.includes("no data") ||
    normalized.includes("missing")
  );
}

export function shouldAutoGenerateBrandInsights({
  insights,
  errorMessage,
}: AutoGenerateInput): boolean {
  if (isMissingInsightsError(errorMessage)) {
    return true;
  }

  if (!insights) {
    return false;
  }

  const statusValues = [
    insights.status,
    insights.data.trendsAndEvents.status,
    insights.data.questionsByNiche.status,
  ];

  if (statusValues.some(isProcessingStatus)) {
    return false;
  }

  const trendsCount = insights.data.trendsAndEvents.trends.length;
  const eventsCount = insights.data.trendsAndEvents.events.length;
  const questionsCount =
    insights.data.questionsByNiche.summary?.totalQuestions ??
    countQuestions(insights.data.questionsByNiche);

  const hasSignals = trendsCount + eventsCount + questionsCount > 0;
  const hasGeneratedAt = Boolean(
    insights.generatedAt ??
      insights.data.trendsAndEvents.generatedAt ??
      insights.data.questionsByNiche.generatedAt
  );

  return !hasSignals && !hasGeneratedAt;
}
