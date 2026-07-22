'use client';

import { useMemo } from 'react';

import {
  BrandInsightsDataTable,
  type BrandInsightsTableRow,
} from '@/components/brand-insights/BrandInsightsDataTable';
import {
  type BrandInsightsQuestionsByNiche,
  brandInsightsQuestionSchema,
} from '@/lib/schemas/brandInsights';

type BrandQuestionsListProps = {
  questionsByNiche: BrandInsightsQuestionsByNiche['questionsByNiche'];
  density?: 'default' | 'compact';
  scrollWithinSection?: boolean;
};

function normalizePlatforms(value?: string) {
  if (!value) return [];
  return value
    .split(/[,\s/|]+/)
    .map((platform) => platform.trim().toLowerCase())
    .filter(Boolean);
}

export function BrandQuestionsList({
  questionsByNiche,
  density = 'default',
  scrollWithinSection = false,
}: BrandQuestionsListProps) {
  const allQuestions = useMemo(() => {
    return Object.entries(questionsByNiche ?? {}).flatMap(([audience, nicheQuestions]) =>
      (nicheQuestions.questions ?? []).map((question) => ({
        ...question,
        audience,
      })),
    );
  }, [questionsByNiche]);

  const rows = useMemo<BrandInsightsTableRow[]>(() => {
    const mappedRows: BrandInsightsTableRow[] = [];

    allQuestions.forEach((questionWithNiche) => {
      const parsed = brandInsightsQuestionSchema.safeParse(questionWithNiche);
      if (!parsed.success) return;
      const question = parsed.data;
      mappedRows.push({
        id: question.id,
        title: question.question,
        subtitle:
          question.whyRelevant ??
          question.contentTypeSuggestion ??
          `Audience: ${questionWithNiche.audience}`,
        secondaryValue: questionWithNiche.audience,
        platforms: normalizePlatforms(question.socialPlatform),
        tags: ['question', questionWithNiche.audience],
        details: [
          { label: 'Audience niche', value: questionWithNiche.audience },
          { label: 'Platform', value: question.socialPlatform },
          { label: 'Content suggestion', value: question.contentTypeSuggestion },
          { label: 'Why relevant', value: question.whyRelevant },
        ],
      });
    });

    return mappedRows;
  }, [allQuestions]);

  return (
    <BrandInsightsDataTable
      rows={rows}
      density={density}
      scrollWithinSection={scrollWithinSection}
      countLabel="questions"
      searchPlaceholder="Search audience questions"
      secondaryHeaderLabel="Audience"
      emptyTitle="No audience questions yet"
      emptyDescription="Generate brand insights to surface audience questions by niche."
    />
  );
}
