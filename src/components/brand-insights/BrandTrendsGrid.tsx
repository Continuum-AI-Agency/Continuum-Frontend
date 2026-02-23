"use client";

import { useMemo } from "react";

import { BrandInsightsDataTable, type BrandInsightsTableRow } from "@/components/brand-insights/BrandInsightsDataTable";
import { brandInsightsTrendSchema, type BrandInsightsTrend } from "@/lib/schemas/brandInsights";

type BrandTrendsGridProps = {
  trends: BrandInsightsTrend[];
  platforms?: string[];
  generatedAt?: string;
  isLoading?: boolean;
};

function formatDate(value?: string) {
  if (!value) return "No date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No date";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BrandTrendsGrid({ trends, platforms = [], generatedAt, isLoading = false }: BrandTrendsGridProps) {
  const normalizedTrends = useMemo(() => {
    const parsed = brandInsightsTrendSchema.array().safeParse(trends);
    return parsed.success ? parsed.data : [];
  }, [trends]);

  const generatedAtLabel = useMemo(() => formatDate(generatedAt), [generatedAt]);

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
          { label: "Description", value: trend.description },
          { label: "Relevance to brand", value: trend.relevanceToBrand },
        ],
      })),
    [generatedAtLabel, normalizedTrends, platforms]
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
    />
  );
}
