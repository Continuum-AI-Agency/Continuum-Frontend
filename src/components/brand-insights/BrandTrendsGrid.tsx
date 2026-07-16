'use client';

import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import {
  BrandInsightsDataTable,
  type BrandInsightsTableRow,
} from '@/components/brand-insights/BrandInsightsDataTable';
import { type BrandInsightsTrend, brandInsightsTrendSchema } from '@/lib/schemas/brandInsights';

// Only real (uuid) trend ids can anchor a one-shot generation on the planner.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BrandTrendsGridProps = {
  trends: BrandInsightsTrend[];
  platforms?: string[];
  generatedAt?: string;
  isLoading?: boolean;
};

function formatDate(value?: string) {
  if (!value) return 'No date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No date';
  return parsed.toLocaleDateString('en-US', {
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
  const router = useRouter();
  const normalizedTrends = useMemo(() => {
    const parsed = brandInsightsTrendSchema.array().safeParse(trends);
    return parsed.success ? parsed.data : [];
  }, [trends]);

  const generatedAtLabel = useMemo(() => formatDate(generatedAt), [generatedAt]);

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
          aria-label="Generate content from this trend"
          title="Generate content from this trend"
          onClick={() => router.push(`/organic?${params.toString()}`)}
          className="rounded p-1 text-muted-foreground/70 outline-none transition-colors hover:bg-muted hover:text-primary focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Sparkles className="size-3.5" />
        </button>
      );
    },
    [normalizedTrends, router],
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
          { label: 'Description', value: trend.description },
          { label: 'Relevance to brand', value: trend.relevanceToBrand },
        ],
      })),
    [generatedAtLabel, normalizedTrends, platforms],
  );

  return (
    <BrandInsightsDataTable
      rows={rows}
      isLoading={isLoading}
      countLabel="trends"
      searchPlaceholder="Search trends"
      secondaryHeaderLabel="Date"
      emptyTitle="No trends yet"
      emptyDescription="Generate brand insights to populate trend signals for this brand."
      density="compact"
      scrollWithinSection
      renderRowAction={renderRowAction}
    />
  );
}
