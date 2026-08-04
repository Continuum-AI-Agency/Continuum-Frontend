import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import type { ReadinessAnalysis } from '@/lib/onboarding/agentClient';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

// Stub the visx RadarChart container (needs ResizeObserver); assert the data
// shape the readiness chart feeds into the bklit composable API.
let lastProps: {
  data?: Array<{ label: string; color: string; values: Record<string, number> }>;
  metrics?: Array<{ key: string; label: string }>;
} = {};

mock.module('@/components/charts/radar-chart', () => ({
  RadarChart: (props: typeof lastProps) => {
    lastProps = props;
    return <div data-series={props.data?.length ?? 0} data-testid="radar" />;
  },
}));

const { ReadinessRadarChart } = await import('./ReadinessRadarChart');

const readiness: ReadinessAnalysis = {
  overall_score: 72,
  generated_at: '2026-07-01T00:00:00.000Z',
  findings: [],
  dimensions: {
    value_proposition: { score: 80, rationale: 'Clear offer.' },
    icp_clarity: { score: 70, rationale: 'ICP is named.' },
    customer_pains: { score: 60, rationale: 'Pains are partial.' },
    success_metrics: { score: 55, rationale: 'Outcomes vague.' },
    positioning: { score: 75, rationale: 'Positioning solid.' },
    messaging_coherence: { score: 68, rationale: 'Messaging holds.' },
    brand_identity: { score: 90, rationale: 'Identity crisp.' },
  },
};

afterEach(() => {
  cleanup();
  lastProps = {};
});

describe('ReadinessRadarChart', () => {
  it('renders one bklit radar series with all seven dimensions', () => {
    const { getByTestId } = render(<ReadinessRadarChart readiness={readiness} />);

    expect(getByTestId('radar').getAttribute('data-series')).toBe('1');
    expect(lastProps.metrics?.map((m) => m.key)).toEqual([
      'brand_identity',
      'positioning',
      'messaging_coherence',
      'value_proposition',
      'icp_clarity',
      'customer_pains',
      'success_metrics',
    ]);
    expect(lastProps.data?.[0]?.values).toEqual({
      brand_identity: 90,
      positioning: 75,
      messaging_coherence: 68,
      value_proposition: 80,
      icp_clarity: 70,
      customer_pains: 60,
      success_metrics: 55,
    });
    // Strong band (≥70 overall) → teal pip.
    expect(lastProps.data?.[0]?.color).toBe('#0daea2');
    expect(lastProps.metrics?.[0]?.label).toBe('Identity · 90');
  });
});
