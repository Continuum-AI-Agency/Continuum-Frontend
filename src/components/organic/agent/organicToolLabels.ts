const TOOL_LABELS: Record<string, string> = {
  summarizeOrganicDashboardData: "Dashboard data pack",
  getAccountMetrics: "Instagram KPIs",
  getAccountAnalytics: "Instagram analytics",
  getFacebookOrganicAnalytics: "Facebook analytics",
  getTikTokOrganicAnalytics: "TikTok analytics",
  getAudienceDemographics: "Audience demographics",
  getKpiInsights: "KPI insights",
  getMetricsComparison: "Metrics comparison",
  getMetricsTimeSeries: "Metrics time series",
  getInteractionBreakdown: "Interaction breakdown",
  getCalendarPostedContent: "Posted content",
  getTopPosts: "Top posts",
  getFacebookPostDetail: "Facebook post detail",
  getTikTokPostDetail: "TikTok post detail",
  getTrendsFromDb: "Trend database",
  listTrends: "Trend signals",
  getTrend: "Trend detail",
  listDrafts: "Calendar drafts",
  getDraft: "Draft detail",
  webSearch: "Web search",
  brandGrounding: "Brand grounding",
}

export function formatOrganicToolName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return "Unknown tool"
  const mapped = TOOL_LABELS[trimmed]
  if (mapped) return mapped
  return trimmed
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
