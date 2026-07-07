import { describe, expect, it } from 'bun:test';
import type { CreativeInsight } from '@continuum/contracts';
import {
  audienceLine,
  buildExemplarViews,
  formatMetricValue,
  toInsightRow,
} from './creative-strategy-rows';

function insight(overrides: Partial<CreativeInsight> = {}): CreativeInsight {
  return {
    id: 'hook-curiosity_gap',
    kind: 'hook',
    archetype: 'curiosity_gap',
    surface: 'organic',
    label: 'Open-ended curiosity hooks',
    description: '3 of your top organic posts open with a curiosity gap.',
    recommendation: 'Test new industry-specific mysteries.',
    tags: [],
    confidence: 0.8,
    performanceSummary: '3 top creatives · avg hook_rate 0.421',
    audience: null,
    evidence: [],
    exemplars: [],
    ...overrides,
  };
}

describe('formatMetricValue', () => {
  it('renders rates as whole percentages', () => {
    expect(formatMetricValue({ name: 'hook_rate', value: 0.421, unit: 'rate' })).toBe('42%');
  });
  it('renders pct values directly with one decimal', () => {
    expect(formatMetricValue({ name: 'ctr', value: 3.25, unit: 'pct' })).toBe('3.3%');
  });
  it('renders ratios as multipliers', () => {
    expect(formatMetricValue({ name: 'roas', value: 2.345, unit: 'ratio' })).toBe('2.35×');
  });
  it('compacts counts', () => {
    expect(formatMetricValue({ name: 'purchases', value: 12345, unit: 'count' })).toBe('12.3K');
  });
  it('returns null for a missing or non-finite metric', () => {
    expect(formatMetricValue(null)).toBeNull();
    expect(formatMetricValue({ name: 'x', value: Number.NaN, unit: 'rate' })).toBeNull();
  });
});

describe('audienceLine', () => {
  it('prefers the note', () => {
    expect(audienceLine({ segments: [], note: 'skews female, 45-54' })).toBe('skews female, 45-54');
  });
  it('falls back to the first segment with its share', () => {
    expect(
      audienceLine({
        segments: [{ dimension: 'age', key: '45-54', label: '45-54', sharePct: 55.2 }],
        note: null,
      }),
    ).toBe('45-54 (55.2%)');
  });
  it('returns null when empty', () => {
    expect(audienceLine(null)).toBeNull();
  });
});

describe('buildExemplarViews', () => {
  it('joins exemplars to evidence by refId and ranks by metric desc', () => {
    const views = buildExemplarViews(
      insight({
        evidence: [
          {
            refId: 'a',
            surface: 'organic',
            metric: { name: 'hook_rate', value: 0.3, unit: 'rate' },
            capturedAt: '2026-07-01',
          },
          {
            refId: 'b',
            surface: 'organic',
            metric: { name: 'hook_rate', value: 0.6, unit: 'rate' },
            capturedAt: '2026-07-02',
          },
        ],
        exemplars: [
          {
            refId: 'a',
            kind: 'post',
            snippet: 'A',
            thumbnailRef: 'https://cdn/a.jpg',
            permalinkUrl: 'https://insta/a',
          },
          {
            refId: 'b',
            kind: 'post',
            snippet: 'B',
            thumbnailRef: 'https://cdn/b.jpg',
            permalinkUrl: null,
          },
        ],
      }),
    );
    expect(views.map((v) => v.refId)).toEqual(['b', 'a']);
    expect(views[0].metricValueLabel).toBe('60%');
    expect(views[0].capturedAt).toBe('2026-07-02');
    expect(views[1].metricName).toBe('hook rate');
  });

  it('nulls out non-http thumbnails and permalinks so the UI can guard', () => {
    const [view] = buildExemplarViews(
      insight({
        evidence: [{ refId: 'a', surface: 'organic', metric: null, capturedAt: '2026-07-01' }],
        exemplars: [
          {
            refId: 'a',
            kind: 'post',
            snippet: null,
            thumbnailRef: 'blob:xyz',
            permalinkUrl: 'not-a-url',
          },
        ],
      }),
    );
    expect(view.thumbnailUrl).toBeNull();
    expect(view.permalinkUrl).toBeNull();
    expect(view.metricValueLabel).toBeNull();
  });
});

describe('toInsightRow', () => {
  it('computes the average metric label and picks the first http permalink', () => {
    const row = toInsightRow(
      insight({
        audience: { segments: [], note: 'skews female' },
        evidence: [
          {
            refId: 'a',
            surface: 'organic',
            metric: { name: 'hook_rate', value: 0.4, unit: 'rate' },
            capturedAt: '2026-07-01',
          },
          {
            refId: 'b',
            surface: 'organic',
            metric: { name: 'hook_rate', value: 0.6, unit: 'rate' },
            capturedAt: '2026-07-02',
          },
        ],
        exemplars: [
          {
            refId: 'a',
            kind: 'post',
            snippet: 'A',
            thumbnailRef: 'https://cdn/a.jpg',
            permalinkUrl: null,
          },
          {
            refId: 'b',
            kind: 'post',
            snippet: 'B',
            thumbnailRef: 'https://cdn/b.jpg',
            permalinkUrl: 'https://insta/b',
          },
        ],
      }),
    );
    expect(row.avgMetricValue).toBeCloseTo(0.5, 5);
    expect(row.avgMetricLabel).toBe('50%');
    expect(row.metricName).toBe('hook rate');
    expect(row.audienceNote).toBe('skews female');
    // 'b' ranks first (0.6) and carries the only http permalink.
    expect(row.topPermalink).toBe('https://insta/b');
    expect(row.exemplars[0].refId).toBe('b');
  });
});
