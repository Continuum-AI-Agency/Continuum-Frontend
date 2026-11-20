'use client';

import { Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import {
  BrandInsightsDataTable,
  type BrandInsightsTableRow,
} from '@/components/brand-insights/BrandInsightsDataTable';
import { useRouter } from '@/i18n/navigation';
import { type BrandInsightsTrend, brandInsightsTrendSchema } from '@/lib/schemas/brandInsights';

// Only real (uuid) trend ids can anchor a one-shot generation on the planner.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BrandTrendsGridProps = {
  trends: BrandInsightsTrend[];
  platforms?: string[];
  generatedAt?: string;
  isLoading?: boolean;
};

function formatDate(value: string | undefined, uiLocale: string, noDate: string) {
  if (!value) return noDate;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return noDate;
  return parsed.toLocaleDateString(uiLocale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function BrandTrendsGrid({
  trends,
  platforms = [],
  generatedAt,
  isLoading = false,
}: BrandTrendsGridProps) {
  const uiText = useTranslations('common');
  const uiLocale = useLocale();
  const router = useRouter();
  const normalizedTrends = useMemo(() => {
    const parsed = brandInsightsTrendSchema.array().safeParse(trends);
    return parsed.success ? parsed.data : [];
  }, [trends]);

  const generatedAtLabel = useMemo(
    () => formatDate(generatedAt, uiLocale, uiText('insightNoDate')),
    [generatedAt, uiLocale, uiText],
  );

  // One-click handoff into the planner: /organic opens the AI composer pre-seeded
  // with this trend (see OrganicPage composeTrendId handling).
  const renderRowAction = useCallback(
    (row: BrandInsightsTableRow) => {
      if (!UUID_RE.test(row.id)) return null;
      const trend = normalizedTrends.find((t) => t.id === row.id);
      const platform = trend?.recommendedPlatforms?.[0] ?? trend?.platforms?.[0];
      const params = new URLSearchParams({ composeTrendId: row.id });
      if (platform) params.set('composePlatform', platform);
      return (
        <button
          type="button"
          aria-label={uiText('generate_content_from_this_trend_ebcebff')}
          title={uiText('generate_content_from_this_trend_ebcebff')}
          onClick={() => router.push(`/organic?${params.toString()}`)}
          className="rounded p-1 text-muted-foreground/70 outline-none transition-colors hover:bg-muted hover:text-primary focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Sparkles className="size-3.5" />
        </button>
      );
    },
    [normalizedTrends, router, uiText],
  );

  const rows = useMemo<BrandInsightsTableRow[]>(
    () =>
      normalizedTrends.map((trend) => ({
        id: trend.id,
        title: trend.title,
        subtitle: trend.description ?? trend.relevanceToBrand,
        secondaryValue: generatedAtLabel,
        platforms: trend.platforms?.length ? trend.platforms : platforms,
        tags: [],
        details: [
          { label: uiText('description_526e008'), value: trend.description },
          { label: uiText('m_aea9a1e318'), value: trend.relevanceToBrand },
        ],
      })),
    [generatedAtLabel, normalizedTrends, platforms, uiText],
  );

  return (
    <BrandInsightsDataTable
      rows={rows}
      isLoading={isLoading}
      formatCount={(count) => uiText('insightCount', { kind: 'trends', count })}
      searchPlaceholder={uiText('insightSearchTrends')}
      secondaryHeaderLabel={uiText('date_99c40ab')}
      emptyTitle={uiText('insightNoTrends')}
      emptyDescription={uiText('insightNoTrendsDescription')}
      density="compact"
      scrollWithinSection
      renderRowAction={renderRowAction}
    />
  );
}
