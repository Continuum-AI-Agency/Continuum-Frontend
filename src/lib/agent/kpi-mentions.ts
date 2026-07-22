// KPI / dashboard-insight context grabbing for the organic agent's @-mention menu.
//
// Surfaces three nested buckets under the "KPIs" folder:
//   - What's Working  → creative_strategy_reports insight rows (shared-performance angles)
//   - Insights        → organic computed insights (growth/content/engagement/audience)
//   - Metrics         → account-level KPI snapshots when the caller has live metrics
//
// Pure mappers are unit-tested; fetch helpers speak to the same stores/APIs the
// Organic metrics dashboard uses so grabbed context matches what the user saw.

import type {
  AgentMentionReference,
  CreativeInsight,
  CreativeStrategyReport,
  OrganicComputedInsight,
  OrganicMetricPlatform,
} from '@continuum/contracts';
import {
  creativeStrategyReportSchema,
  creativeStrategyStatusSchema,
  metricsForPlatform,
  ORGANIC_METRIC_CATALOG,
} from '@continuum/contracts';
import type { AgentMentionSuggestion } from '@/lib/agent-references';

export const KPI_GROUP = 'KPIs';
export const KPI_WHATS_WORKING_FOLDER_KEY = 'folder:KPIs:WhatsWorking';
export const KPI_INSIGHTS_FOLDER_KEY = 'folder:KPIs:Insights';
/** AI-Awareness "What Changed" narrative lines (not What's Working creatives). */
export const KPI_WHAT_CHANGED_FOLDER_KEY = 'folder:KPIs:Insights:WhatChanged';
/** Dashboard computed insights (growth / content / engagement / audience). */
export const KPI_COMPUTED_INSIGHTS_FOLDER_KEY = 'folder:KPIs:Insights:Computed';
export const KPI_METRICS_FOLDER_KEY = 'folder:KPIs:Metrics';
export const KPI_PACKS_FOLDER_KEY = 'folder:KPIs:Packs';

/** One-click bundles of metric optimization targets for common organic jobs. */
export type OptimizationPackId = 'grow_followers' | 'improve_retention' | 'boost_engagement';

export type OptimizationPack = {
  id: OptimizationPackId;
  key: string;
  label: string;
  description: string;
  metricKeys: string[];
};

export const OPTIMIZATION_PACKS: readonly OptimizationPack[] = [
  {
    id: 'grow_followers',
    key: 'pack:grow_followers',
    label: 'Grow followers',
    description: 'Optimize for audience growth + discovery',
    metricKeys: ['newFollowers', 'subscribers', 'nonFollowerReach', 'reach', 'profileVisits24h'],
  },
  {
    id: 'improve_retention',
    key: 'pack:improve_retention',
    label: 'Improve retention',
    description: 'Optimize for watch-through and hook hold',
    metricKeys: ['avgRetentionRate', 'hookRate', 'avgSkipRate', 'reelsViews', 'views'],
  },
  {
    id: 'boost_engagement',
    key: 'pack:boost_engagement',
    label: 'Boost engagement',
    description: 'Optimize for interactions and saves-adjacent signals',
    metricKeys: ['accountsEngaged', 'totalInteractions', 'likes', 'comments', 'shares'],
  },
] as const;

/** Group labels for metric catalog buckets (optimization targets). */
const COMPARABLE_GROUP_LABEL: Record<string, string> = {
  attention: 'Attention',
  engagement: 'Engagement',
  audience_growth: 'Audience growth',
  interactions: 'Interactions',
  retention: 'Retention',
  inventory: 'Inventory',
};

export type KpiMetricSnapshot = {
  key: string;
  label: string;
  value: number | null;
  previous?: number | null;
  percentageChange?: number | null;
  unit?: string | null;
  platform?: string | null;
  rangePreset?: string | null;
};

function truncate(text: string | null | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export function creativeInsightToMentionSuggestion(
  insight: CreativeInsight,
  reportMeta?: {
    windowDays?: number;
    generatedAt?: string | null;
    /** List index — creative_strategy cluster ids can collide (kind-archetype). */
    index?: number;
  },
): AgentMentionSuggestion {
  const topMetric = insight.evidence.find((e) => e.metric)?.metric ?? null;
  const exemplarSnippets = insight.exemplars
    .map((e) => e.snippet)
    .filter((s): s is string => Boolean(s && s.trim()))
    .slice(0, 3);
  const exemplarPermalinks = insight.exemplars
    .map((e) => e.permalinkUrl)
    .filter((u): u is string => Boolean(u && u.startsWith('http')))
    .slice(0, 3);
  const exemplarRefIds = insight.exemplars.map((e) => e.refId).slice(0, 6);
  const exemplarThumbnails = insight.exemplars
    .map((e) => e.thumbnailRef)
    .filter((u): u is string => Boolean(u && (u.startsWith('http') || u.startsWith('data:'))))
    .slice(0, 6);
  const thumb = exemplarThumbnails[0] ?? null;

  // Cluster ids are `${kind}-${archetype|slug}` and are not guaranteed unique
  // across parallel format/hook clusters. Disambiguate for React keys + agent
  // refs so the picker never remounts two rows under the same identity.
  const contentFingerprint = simpleHash(
    [
      insight.id,
      insight.label,
      insight.recommendation,
      insight.surface,
      exemplarRefIds[0] ?? '',
      String(reportMeta?.index ?? ''),
    ].join('|'),
  );
  const uniqueId =
    reportMeta?.index != null
      ? `${insight.id}#${reportMeta.index}`
      : `${insight.id}#${contentFingerprint}`;

  const reference: AgentMentionReference = {
    id: uniqueId,
    type: 'creative_insight',
    label: insight.label,
    source: 'organic',
    metadata: {
      insightId: insight.id,
      instanceId: uniqueId,
      kind: insight.kind,
      surface: insight.surface,
      description: insight.description,
      recommendation: insight.recommendation,
      confidence: insight.confidence,
      performanceSummary: insight.performanceSummary,
      audienceNote: insight.audience?.note ?? null,
      tags: insight.tags,
      metricName: topMetric?.name ?? null,
      metricValue: topMetric?.value ?? null,
      metricUnit: topMetric?.unit ?? null,
      exemplarRefIds,
      exemplarSnippets,
      exemplarPermalinks,
      exemplarThumbnails,
      windowDays: reportMeta?.windowDays ?? null,
      generatedAt: reportMeta?.generatedAt ?? null,
      source: 'whats_working',
    },
  };

  return {
    key: `creative_insight:${uniqueId}`,
    label: insight.label,
    type: 'creative_insight',
    source: 'organic',
    group: KPI_GROUP,
    description: [
      insight.kind,
      insight.surface,
      insight.performanceSummary ?? truncate(insight.recommendation, 80),
    ]
      .filter(Boolean)
      .join(' · '),
    badge: insight.kind,
    reference,
    preview: thumb ? { url: thumb, kind: 'image', label: insight.label } : undefined,
  };
}

export function organicInsightToMentionSuggestion(
  insight: OrganicComputedInsight,
  index: number,
  meta?: { generatedAt?: string | null; rangePreset?: string | null; platform?: string | null },
): AgentMentionSuggestion {
  // Computed insights have no durable id on the wire; fingerprint from content
  // so re-grabs of the same text stay stable within a session.
  const fingerprint = [
    insight.category,
    insight.metric ?? '',
    insight.text.slice(0, 80),
    insight.post_id ?? '',
  ].join('|');
  // Browser-safe stable id (no Node Buffer).
  const id = `oi:${simpleHash(fingerprint)}`;
  const label = truncate(insight.text, 72) ?? `${insight.category} insight`;

  const reference: AgentMentionReference = {
    id,
    type: 'organic_insight',
    label,
    source: 'organic',
    metadata: {
      insightKey: id,
      category: insight.category,
      severity: insight.severity,
      source: insight.source,
      text: insight.text,
      recommendation: insight.recommendation ?? null,
      metric: insight.metric ?? null,
      value: insight.value ?? null,
      delta: insight.delta ?? null,
      estimatedImpact: insight.estimated_impact ?? null,
      postId: insight.post_id ?? null,
      generatedAt: meta?.generatedAt ?? null,
      rangePreset: meta?.rangePreset ?? null,
      platform: meta?.platform ?? null,
      index,
    },
  };

  return {
    key: `organic_insight:${id}`,
    label,
    type: 'organic_insight',
    source: 'organic',
    group: KPI_GROUP,
    description: [
      insight.category,
      insight.severity,
      insight.metric,
      insight.recommendation ? truncate(insight.recommendation, 60) : null,
    ]
      .filter(Boolean)
      .join(' · '),
    badge: insight.severity,
    reference,
  };
}

export function kpiMetricToMentionSuggestion(metric: KpiMetricSnapshot): AgentMentionSuggestion {
  const valueLabel =
    metric.value == null
      ? '—'
      : metric.unit === 'percent' || metric.unit === '%'
        ? `${metric.value.toFixed(1)}%`
        : metric.value.toLocaleString();
  const deltaLabel =
    typeof metric.percentageChange === 'number'
      ? `${metric.percentageChange >= 0 ? '+' : ''}${metric.percentageChange.toFixed(1)}%`
      : null;
  const label = `${metric.label}${deltaLabel ? ` (${deltaLabel})` : ''}`;
  const id = [metric.platform ?? 'account', metric.key, metric.rangePreset ?? 'target'].join(':');

  const reference: AgentMentionReference = {
    id,
    type: 'kpi',
    label: metric.label,
    source: 'organic',
    metadata: {
      metricKey: metric.key,
      metricLabel: metric.label,
      // Selecting a metric from KPIs > Metrics means "optimize / prioritize this".
      intent: 'optimize_for',
      value: metric.value,
      previous: metric.previous ?? null,
      percentageChange: metric.percentageChange ?? null,
      unit: metric.unit ?? null,
      platform: metric.platform ?? null,
      rangePreset: metric.rangePreset ?? null,
      displayValue: valueLabel,
    },
  };

  return {
    key: `kpi:${id}`,
    label,
    type: 'kpi',
    source: 'organic',
    group: KPI_GROUP,
    description: [
      'Optimize for this metric',
      metric.platform,
      metric.rangePreset,
      metric.value != null ? valueLabel : null,
    ]
      .filter(Boolean)
      .join(' · '),
    badge: 'target',
    reference,
  };
}

/**
 * Lists catalog metrics the user can tag as optimization targets
 * (follower growth, reach, hook rate, etc.). Prefer the connected platform's
 * available set; fall back to the full catalog when platform is unknown.
 */
export type LiveMetricValues = Partial<
  Record<
    string,
    {
      value?: number | null;
      previous?: number | null;
      percentageChange?: number | null;
    }
  >
>;

export function metricCatalogToKpiSuggestions(input?: {
  platform?: OrganicMetricPlatform | null;
  rangePreset?: string | null;
  /** Live dashboard numbers keyed by OrganicMetrics field id. */
  liveValues?: LiveMetricValues | null;
}): AgentMentionSuggestion[] {
  const platform = input?.platform ?? null;
  const entries = platform ? metricsForPlatform(platform) : [...ORGANIC_METRIC_CATALOG];

  return entries.map((entry) => {
    const live = input?.liveValues?.[entry.id];
    const suggestion = kpiMetricToMentionSuggestion({
      key: entry.id,
      label: entry.label,
      value: live?.value ?? null,
      previous: live?.previous ?? null,
      percentageChange: live?.percentageChange ?? null,
      unit: entry.format === 'percent' ? 'percent' : 'count',
      platform,
      rangePreset: input?.rangePreset ?? null,
    });
    const groupLabel = COMPARABLE_GROUP_LABEL[entry.comparableGroup] ?? entry.comparableGroup;
    const liveBits = [
      live?.value != null ? `now ${live.value.toLocaleString()}` : null,
      typeof live?.percentageChange === 'number'
        ? `${live.percentageChange >= 0 ? '+' : ''}${live.percentageChange.toFixed(1)}%`
        : null,
    ].filter(Boolean);
    return {
      ...suggestion,
      description: [
        'Optimize for this metric',
        groupLabel,
        platform,
        ...liveBits,
        entry.format === 'percent' ? 'rate' : 'count',
      ]
        .filter(Boolean)
        .join(' · '),
      badge: groupLabel,
      reference: suggestion.reference
        ? {
            ...suggestion.reference,
            metadata: {
              ...suggestion.reference.metadata,
              comparableGroup: entry.comparableGroup,
              format: entry.format,
              summable: entry.summable,
              intent: 'optimize_for',
            },
          }
        : suggestion.reference,
    };
  });
}

/** Expand an optimization pack into concrete metric target suggestions. */
export function optimizationPackToSuggestions(
  packId: OptimizationPackId,
  input?: {
    platform?: OrganicMetricPlatform | null;
    rangePreset?: string | null;
    liveValues?: LiveMetricValues | null;
  },
): AgentMentionSuggestion[] {
  const pack = OPTIMIZATION_PACKS.find((p) => p.id === packId);
  if (!pack) return [];
  const all = metricCatalogToKpiSuggestions(input);
  const wanted = new Set(pack.metricKeys);
  return all.filter((s) => {
    const key = s.reference?.metadata?.metricKey;
    return typeof key === 'string' && wanted.has(key);
  });
}

export function optimizationPackFolderSuggestions(): AgentMentionSuggestion[] {
  return OPTIMIZATION_PACKS.map((pack) => ({
    key: pack.key,
    label: pack.label,
    type: 'kpi' as const,
    source: 'organic' as const,
    group: KPI_GROUP,
    description: pack.description,
    // Selecting a pack inserts its metrics as chips (not a nested folder).
    // childrenLabel is intentionally omitted so PromptInput treats this as a leaf
    // only when we wire multi-insert; we use isFolder false + special key handling.
    badge: 'pack',
    reference: {
      id: pack.id,
      type: 'kpi' as const,
      label: pack.label,
      source: 'organic' as const,
      metadata: {
        intent: 'optimize_for',
        packId: pack.id,
        metricKeys: pack.metricKeys,
        isPack: true,
      },
    },
  }));
}

export function filterKpiSuggestions(
  suggestions: AgentMentionSuggestion[],
  query: string,
): AgentMentionSuggestion[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return suggestions;
  return suggestions.filter((s) =>
    [s.label, s.description, s.badge].some((v) => v?.toLowerCase().includes(normalized)),
  );
}

export type FetchCreativeInsightsInput = {
  brandId: string;
};

/** Loads What's Working rows from the materialized creative_strategy_reports row. */
export async function fetchCreativeInsightSuggestions(
  input: FetchCreativeInsightsInput,
): Promise<AgentMentionSuggestion[]> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('creative_strategy_reports' as never)
    .select('status, report, refreshed_at')
    .eq('brand_id' as never, input.brandId)
    .maybeSingle();

  if (error || !data) return [];

  const row = data as {
    status?: string | null;
    report?: unknown;
    refreshed_at?: string | null;
  };
  const status = creativeStrategyStatusSchema.safeParse(row.status);
  if (!status.success || status.data !== 'ready') return [];

  const parsed = creativeStrategyReportSchema.safeParse(row.report);
  if (!parsed.success) return [];

  const report: CreativeStrategyReport = parsed.data;
  return report.insights.map((insight, index) =>
    creativeInsightToMentionSuggestion(insight, {
      windowDays: report.windowDays,
      generatedAt: report.generatedAt ?? row.refreshed_at,
      index,
    }),
  );
}

export type FetchOrganicInsightSuggestionsInput = {
  brandId: string;
  integrationAccountId: string;
  platform: 'instagram' | 'facebook' | 'tiktok';
  rangePreset?: string;
};

type InsightsApiPayload = {
  insights?: OrganicComputedInsight[];
  generated_at?: string;
  range?: { preset?: string };
  awareness?: {
    blocks?: Array<{ category?: string; title?: string; data?: unknown }>;
    windowStart?: string;
    windowEnd?: string;
  };
};

async function fetchInsightsPayload(
  input: FetchOrganicInsightSuggestionsInput,
): Promise<InsightsApiPayload | null> {
  const rangePreset = input.rangePreset ?? 'last_7d';
  const response = await fetch('/api/organic/insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brandId: input.brandId,
      integrationAccountId: input.integrationAccountId,
      platform: input.platform,
      range: { preset: rangePreset },
    }),
  });
  if (!response.ok) return null;
  return (await response.json()) as InsightsApiPayload;
}

/** Loads dashboard organic insights (same path as OrganicInsightsPanel). */
export async function fetchOrganicInsightSuggestions(
  input: FetchOrganicInsightSuggestionsInput,
): Promise<AgentMentionSuggestion[]> {
  const rangePreset = input.rangePreset ?? 'last_7d';
  const payload = await fetchInsightsPayload(input);
  if (!payload) return [];
  const insights = payload.insights ?? [];
  return insights.map((insight, index) =>
    organicInsightToMentionSuggestion(insight, index, {
      generatedAt: payload.generated_at ?? null,
      rangePreset: payload.range?.preset ?? rangePreset,
      platform: input.platform,
    }),
  );
}

/**
 * AI-Awareness "What Changed" narrative lines — period-over-period change copy
 * from the insights endpoint's awareness block. Distinct from What's Working
 * (creative strategy angles) and from computed category insights.
 */
export function whatChangedLineToMentionSuggestion(
  line: string,
  index: number,
  meta?: {
    generatedAt?: string | null;
    rangePreset?: string | null;
    platform?: string | null;
    windowStart?: string | null;
    windowEnd?: string | null;
  },
): AgentMentionSuggestion {
  const text = line.trim();
  const label = text.length > 72 ? `${text.slice(0, 71)}…` : text;
  const id = `wc:${simpleHash(`${index}|${text.slice(0, 120)}`)}`;
  const reference: AgentMentionReference = {
    id,
    type: 'organic_insight',
    label,
    source: 'organic',
    metadata: {
      insightKey: id,
      category: 'narrative',
      severity: 'neutral',
      source: 'what_changed',
      text,
      platform: meta?.platform ?? null,
      rangePreset: meta?.rangePreset ?? null,
      generatedAt: meta?.generatedAt ?? null,
      windowStart: meta?.windowStart ?? null,
      windowEnd: meta?.windowEnd ?? null,
      index,
    },
  };
  return {
    key: `what_changed:${id}`,
    label,
    type: 'organic_insight',
    source: 'organic',
    group: KPI_GROUP,
    description: 'What Changed · AI-Awareness',
    badge: 'changed',
    reference,
  };
}

export async function fetchWhatChangedSuggestions(
  input: FetchOrganicInsightSuggestionsInput,
): Promise<AgentMentionSuggestion[]> {
  const rangePreset = input.rangePreset ?? 'last_7d';
  const payload = await fetchInsightsPayload(input);
  if (!payload?.awareness?.blocks) return [];
  const narrative = payload.awareness.blocks.find(
    (b) => b.category === 'narrative' || /what\s*changed/i.test(b.title ?? ''),
  );
  if (!narrative) return [];
  const lines = Array.isArray(narrative.data)
    ? narrative.data.filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
    : typeof narrative.data === 'string' && narrative.data.trim()
      ? [narrative.data.trim()]
      : [];
  return lines.map((line, index) =>
    whatChangedLineToMentionSuggestion(line, index, {
      generatedAt: payload.generated_at ?? null,
      rangePreset: payload.range?.preset ?? rangePreset,
      platform: input.platform,
      windowStart: payload.awareness?.windowStart ?? null,
      windowEnd: payload.awareness?.windowEnd ?? null,
    }),
  );
}

/** Nested families under Insights (not What's Working). */
export function insightFamilySuggestions(): AgentMentionSuggestion[] {
  return [
    {
      key: KPI_WHAT_CHANGED_FOLDER_KEY,
      label: 'What Changed',
      type: 'organic_insight',
      source: 'organic',
      group: KPI_GROUP,
      childrenLabel: 'AI-Awareness period narrative',
      isFolder: true,
    },
    {
      key: KPI_COMPUTED_INSIGHTS_FOLDER_KEY,
      label: 'Insights',
      type: 'organic_insight',
      source: 'organic',
      group: KPI_GROUP,
      childrenLabel: 'Growth, content, engagement, audience',
      isFolder: true,
    },
  ];
}

export function kpiSubfolderSuggestions(): AgentMentionSuggestion[] {
  // Families under KPIs (navigable, not labeled "folder" in the UI):
  //   Metrics        — pick concrete KPIs to optimize for
  //   Packs          — multi-metric optimization bundles
  //   What's Working — creative strategy shared-performance rows
  //   Insights       — What Changed + computed dashboard insights
  return [
    {
      key: KPI_METRICS_FOLDER_KEY,
      label: 'Metrics',
      type: 'kpi',
      source: 'organic',
      group: KPI_GROUP,
      childrenLabel: 'Optimize for reach, followers, engagement…',
      isFolder: true,
    },
    {
      key: KPI_PACKS_FOLDER_KEY,
      label: 'Packs',
      type: 'kpi',
      source: 'organic',
      group: KPI_GROUP,
      childrenLabel: 'One-click optimization bundles',
      isFolder: true,
    },
    {
      key: KPI_WHATS_WORKING_FOLDER_KEY,
      label: "What's Working",
      type: 'creative_insight',
      source: 'organic',
      group: KPI_GROUP,
      childrenLabel: 'Shared-performance insights',
      isFolder: true,
    },
    {
      key: KPI_INSIGHTS_FOLDER_KEY,
      label: 'Insights',
      type: 'organic_insight',
      source: 'organic',
      group: KPI_GROUP,
      childrenLabel: 'What Changed + dashboard insights',
      isFolder: true,
    },
  ];
}
