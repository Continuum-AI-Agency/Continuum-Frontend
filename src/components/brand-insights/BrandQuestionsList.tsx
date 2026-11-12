'use client';

import { useTranslations } from 'next-intl';

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
  const uiText = useTranslations('common');
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
          uiText('m_ca00bedbd7', { v0: String(questionWithNiche.audience) }),
        secondaryValue: questionWithNiche.audience,
        platforms: normalizePlatforms(question.socialPlatform),
        tags: ['question', questionWithNiche.audience],
        details: [
          { label: uiText('m_f93653fc9b'), value: questionWithNiche.audience },
          { label: uiText('platform_c78ffe1'), value: question.socialPlatform },
          {
            label: uiText('m_fd51d73f71'),
            value: question.contentTypeSuggestion,
          },
          { label: uiText('m_5cb656c8a2'), value: question.whyRelevant },
        ],
      });
    });

    return mappedRows;
  }, [allQuestions, uiText]);

  return (
    <BrandInsightsDataTable
      rows={rows}
      density={density}
      scrollWithinSection={scrollWithinSection}
      formatCount={(count) => uiText('insightCount', { kind: 'questions', count })}
      searchPlaceholder={uiText('insightSearchQuestions')}
      secondaryHeaderLabel={uiText('insightAudienceHeader')}
      emptyTitle={uiText('insightNoQuestions')}
      emptyDescription={uiText('insightNoQuestionsDescription')}
    />
  );
}
