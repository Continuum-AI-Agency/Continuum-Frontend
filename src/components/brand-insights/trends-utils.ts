import type { BrandInsightsTrend } from "@/lib/schemas/brandInsights";

type FilterOptions = {
  query?: string;
  onlySelected?: boolean;
  sourceFilter?: string;
};

function normalizeFilterValue(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

export function getUniqueSources(trends: BrandInsightsTrend[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const trend of trends) {
    const source = trend.source?.trim();
    if (!source) continue;

    const key = source.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(source);
  }

  return result;
}

export function filterAndSortTrends(trends: BrandInsightsTrend[], options: FilterOptions) {
  const normalizedQuery = normalizeFilterValue(options.query);
  const normalizedSourceFilter = normalizeFilterValue(options.sourceFilter);
  const shouldFilterBySource = normalizedSourceFilter.length > 0 && normalizedSourceFilter !== "all";

  return trends
    .filter((trend) => {
      if (!normalizedQuery) return true;
      return (
        trend.title.toLowerCase().includes(normalizedQuery) ||
        (trend.description?.toLowerCase().includes(normalizedQuery) ?? false) ||
        (trend.relevanceToBrand?.toLowerCase().includes(normalizedQuery) ?? false)
      );
    })
    .filter((trend) => {
      if (!shouldFilterBySource) return true;
      return (trend.source ?? "").trim().toLowerCase() === normalizedSourceFilter;
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
