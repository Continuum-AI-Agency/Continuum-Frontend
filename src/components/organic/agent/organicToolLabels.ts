const TOOL_LABELS: Record<string, string> = {
  summarizeOrganicDashboardData: 'Dashboard data pack',
  getAccountMetrics: 'Instagram KPIs',
  getAccountAnalytics: 'Instagram analytics',
  getFacebookOrganicAnalytics: 'Facebook analytics',
  getTikTokOrganicAnalytics: 'TikTok analytics',
  getAudienceDemographics: 'Audience demographics',
  getKpiInsights: 'KPI insights',
  getMetricsComparison: 'Metrics comparison',
  getMetricsTimeSeries: 'Metrics time series',
  getInteractionBreakdown: 'Interaction breakdown',
  getCalendarPostedContent: 'Posted content',
  getTopPosts: 'Top posts',
  getFacebookPostDetail: 'Facebook post detail',
  getTikTokPostDetail: 'TikTok post detail',
  getTrendsFromDb: 'Trend database',
  listTrends: 'Trend signals',
  getTrend: 'Trend detail',
  listDrafts: 'Calendar drafts',
  getDraft: 'Draft detail',
  webSearch: 'Web search',
  brandGrounding: 'Brand grounding',
};

const TOOL_MESSAGE_KEYS = {
  summarizeOrganicDashboardData: 'tool_summarizeOrganicDashboardData',
  getAccountMetrics: 'tool_getAccountMetrics',
  getAccountAnalytics: 'tool_getAccountAnalytics',
  getFacebookOrganicAnalytics: 'tool_getFacebookOrganicAnalytics',
  getTikTokOrganicAnalytics: 'tool_getTikTokOrganicAnalytics',
  getAudienceDemographics: 'tool_getAudienceDemographics',
  getKpiInsights: 'tool_getKpiInsights',
  getMetricsComparison: 'tool_getMetricsComparison',
  getMetricsTimeSeries: 'tool_getMetricsTimeSeries',
  getInteractionBreakdown: 'tool_getInteractionBreakdown',
  getCalendarPostedContent: 'tool_getCalendarPostedContent',
  getTopPosts: 'tool_getTopPosts',
  getFacebookPostDetail: 'tool_getFacebookPostDetail',
  getTikTokPostDetail: 'tool_getTikTokPostDetail',
  getTrendsFromDb: 'tool_getTrendsFromDb',
  listTrends: 'tool_listTrends',
  getTrend: 'tool_getTrend',
  listDrafts: 'tool_listDrafts',
  getDraft: 'tool_getDraft',
  webSearch: 'tool_webSearch',
  brandGrounding: 'tool_brandGrounding',
} as const;
export type OrganicToolMessageKey =
  | (typeof TOOL_MESSAGE_KEYS)[keyof typeof TOOL_MESSAGE_KEYS]
  | 'toolUnknown';

export function formatOrganicToolName(
  name: string,
  translate?: (key: OrganicToolMessageKey) => string,
): string {
  const trimmed = name.trim();
  if (translate)
    return translate(TOOL_MESSAGE_KEYS[trimmed as keyof typeof TOOL_MESSAGE_KEYS] ?? 'toolUnknown');
  if (!trimmed) return 'Unknown tool';
  const mapped = TOOL_LABELS[trimmed];
  if (mapped) return mapped;
  return trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
