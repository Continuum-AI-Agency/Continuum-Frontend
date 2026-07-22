import { describe, expect, it } from 'bun:test';
import type { CreativeInsight, OrganicComputedInsight } from '@continuum/contracts';
import {
  creativeInsightToMentionSuggestion,
  filterKpiSuggestions,
  kpiMetricToMentionSuggestion,
  kpiSubfolderSuggestions,
  metricCatalogToKpiSuggestions,
  optimizationPackToSuggestions,
  organicInsightToMentionSuggestion,
} from './kpi-mentions';

function makeCreativeInsight(overrides: Partial<CreativeInsight> = {}): CreativeInsight {
  return {
    id: 'ci-1',
    kind: 'hook',
    archetype: null,
    surface: 'organic',
    label: 'Pattern interrupt openers',
    description: 'Top reels share a hard cut + question in the first 1s.',
    recommendation: 'Lead every reel with a pattern interrupt question.',
    tags: ['reel', 'hook'],
    confidence: 0.82,
    performanceSummary: 'Avg hook rate 48% across 4 reels',
    audience: { segments: [], note: 'skews non-followers' },
    evidence: [
      {
        refId: 'post-1',
        surface: 'organic',
        metric: { name: 'hook_rate', value: 0.48, unit: 'ratio' },
        capturedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    exemplars: [
      {
        refId: 'post-1',
        kind: 'post',
        snippet: 'Wait — did you know this about SPF?',
        thumbnailRef: 'https://cdn.example/thumb.jpg',
        permalinkUrl: 'https://instagram.com/p/abc',
      },
    ],
    ...overrides,
  };
}

describe('creativeInsightToMentionSuggestion', () => {
  it("maps What's Working rows to creative_insight references with exemplar snapshot", () => {
    const suggestion = creativeInsightToMentionSuggestion(makeCreativeInsight(), {
      windowDays: 30,
      generatedAt: '2026-07-09T00:00:00.000Z',
      index: 0,
    });
    expect(suggestion.type).toBe('creative_insight');
    expect(suggestion.reference?.type).toBe('creative_insight');
    expect(suggestion.reference?.metadata?.kind).toBe('hook');
    expect(suggestion.reference?.metadata?.recommendation).toContain('pattern interrupt');
    expect(suggestion.reference?.metadata?.exemplarPermalinks).toEqual([
      'https://instagram.com/p/abc',
    ]);
    expect(suggestion.reference?.metadata?.metricName).toBe('hook_rate');
    expect(suggestion.preview?.url).toBe('https://cdn.example/thumb.jpg');
    expect(suggestion.badge).toBe('hook');
    expect(suggestion.key).toBe('creative_insight:ci-1#0');
    expect(suggestion.reference?.id).toBe('ci-1#0');
  });

  it('disambiguates colliding cluster ids across list indexes', () => {
    const a = creativeInsightToMentionSuggestion(
      makeCreativeInsight({ id: 'format-talking-head-video', label: 'Talking head A' }),
      { index: 0 },
    );
    const b = creativeInsightToMentionSuggestion(
      makeCreativeInsight({ id: 'format-talking-head-video', label: 'Talking head B' }),
      { index: 1 },
    );
    expect(a.key).not.toBe(b.key);
    expect(a.reference?.id).not.toBe(b.reference?.id);
    expect(a.reference?.metadata?.insightId).toBe('format-talking-head-video');
    expect(b.reference?.metadata?.insightId).toBe('format-talking-head-video');
  });
});

describe('organicInsightToMentionSuggestion', () => {
  it('fingerprints computed insights and carries metric/delta/recommendation', () => {
    const insight: OrganicComputedInsight = {
      category: 'engagement',
      text: 'Save rate is up 22% week over week on carousels.',
      severity: 'positive',
      source: 'computed',
      metric: 'save_share_ratio',
      value: 0.12,
      delta: 0.22,
      recommendation: 'Double down on carousel education posts.',
    };
    const suggestion = organicInsightToMentionSuggestion(insight, 0, {
      platform: 'instagram',
      rangePreset: 'last_7d',
      generatedAt: '2026-07-09T00:00:00.000Z',
    });
    expect(suggestion.type).toBe('organic_insight');
    expect(suggestion.reference?.metadata?.category).toBe('engagement');
    expect(suggestion.reference?.metadata?.delta).toBe(0.22);
    expect(suggestion.reference?.metadata?.recommendation).toContain('carousel');
    expect(suggestion.reference?.id.startsWith('oi:')).toBe(true);
  });
});

describe('kpiMetricToMentionSuggestion', () => {
  it('builds a kpi reference for an account metric snapshot', () => {
    const suggestion = kpiMetricToMentionSuggestion({
      key: 'reach',
      label: 'Reach',
      value: 12000,
      previous: 10000,
      percentageChange: 20,
      platform: 'instagram',
      rangePreset: 'last_7d',
    });
    expect(suggestion.type).toBe('kpi');
    expect(suggestion.reference?.id).toBe('instagram:reach:last_7d');
    expect(suggestion.reference?.metadata?.percentageChange).toBe(20);
    expect(suggestion.reference?.metadata?.intent).toBe('optimize_for');
    expect(suggestion.badge).toBe('target');
  });
});

describe('metricCatalogToKpiSuggestions', () => {
  it('lists platform metrics as optimization targets', () => {
    const rows = metricCatalogToKpiSuggestions({ platform: 'instagram' });
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((r) => r.type === 'kpi')).toBe(true);
    expect(
      rows.some(
        (r) => r.label === 'New followers' || r.reference?.metadata?.metricKey === 'newFollowers',
      ),
    ).toBe(true);
    expect(rows.every((r) => r.reference?.metadata?.intent === 'optimize_for')).toBe(true);
  });
});

describe('kpiSubfolderSuggestions', () => {
  it("exposes Metrics, Packs, What's Working, and Insights families", () => {
    const folders = kpiSubfolderSuggestions();
    expect(folders.map((f) => f.label)).toEqual(['Metrics', 'Packs', "What's Working", 'Insights']);
    expect(folders.every((f) => f.isFolder)).toBe(true);
  });
});

describe('insightFamilySuggestions', () => {
  it('nests What Changed and computed Insights under Insights', () => {
    const { insightFamilySuggestions } =
      require('./kpi-mentions') as typeof import('./kpi-mentions');
    expect(insightFamilySuggestions().map((f) => f.label)).toEqual(['What Changed', 'Insights']);
  });
});

describe('whatChangedLineToMentionSuggestion', () => {
  it('maps AI-Awareness narrative lines as organic_insight with what_changed source', () => {
    const { whatChangedLineToMentionSuggestion } =
      require('./kpi-mentions') as typeof import('./kpi-mentions');
    const s = whatChangedLineToMentionSuggestion('Reels outperformed static posts this week.', 0, {
      platform: 'instagram',
      rangePreset: 'last_7d',
    });
    expect(s.type).toBe('organic_insight');
    expect(s.reference?.metadata?.source).toBe('what_changed');
    expect(s.reference?.metadata?.text).toContain('Reels outperformed');
    expect(s.description).toContain('What Changed');
  });
});

describe('optimizationPackToSuggestions', () => {
  it('expands grow_followers into metric targets available on the platform', () => {
    const rows = optimizationPackToSuggestions('grow_followers', { platform: 'instagram' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.reference?.metadata?.intent === 'optimize_for')).toBe(true);
    expect(rows.some((r) => r.reference?.metadata?.metricKey === 'newFollowers')).toBe(true);
  });

  it('hydrates live values when provided', () => {
    const rows = metricCatalogToKpiSuggestions({
      platform: 'instagram',
      liveValues: { newFollowers: { value: 120, previous: 100, percentageChange: 20 } },
    });
    const hit = rows.find((r) => r.reference?.metadata?.metricKey === 'newFollowers');
    expect(hit?.reference?.metadata?.value).toBe(120);
    expect(hit?.reference?.metadata?.percentageChange).toBe(20);
  });
});

describe('filterKpiSuggestions', () => {
  it('filters by label/description', () => {
    const rows = [
      creativeInsightToMentionSuggestion(makeCreativeInsight()),
      creativeInsightToMentionSuggestion(
        makeCreativeInsight({ id: 'ci-2', label: 'Soft lifestyle B-roll', kind: 'format' }),
      ),
    ];
    expect(filterKpiSuggestions(rows, 'pattern').map((r) => r.label)).toEqual([
      'Pattern interrupt openers',
    ]);
  });
});
