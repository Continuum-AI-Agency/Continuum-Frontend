import type { BrandInsightsTrend } from "@/lib/schemas/brandInsights";

type FilterOptions = {
  query?: string;
  onlySelected?: boolean;
};

export function filterAndSortTrends(trends: BrandInsightsTrend[], options: FilterOptions) {
  const normalizedQuery = (options.query ?? "").trim().toLowerCase();

  return trends
    .filter((trend) => {
      if (!normalizedQuery) return true;
      return (
        trend.title.toLowerCase().includes(normalizedQuery) ||
        (trend.description?.toLowerCase().includes(normalizedQuery) ?? false) ||
        (trend.relevanceToBrand?.toLowerCase().includes(normalizedQuery) ?? false)
      );
    })
    .filter((trend) => (options.onlySelected ? trend.isSelected : true))
    .sort((a, b) => {
      if (a.isSelected !== b.isSelected) {
        return a.isSelected ? -1 : 1;
      }
      if ((b.timesUsed ?? 0) !== (a.timesUsed ?? 0)) {
        return (b.timesUsed ?? 0) - (a.timesUsed ?? 0);
      }
      return a.title.localeCompare(b.title);
    });
}
