import type { OrganicComputedInsight } from '@/lib/organic/organic-insights.types';

export function isZeroDataInsightSet(insights: readonly OrganicComputedInsight[]): boolean {
  return (
    insights.length > 1 &&
    insights.every((insight) => (insight.value ?? 0) === 0 && (insight.delta ?? 0) === 0)
  );
}
