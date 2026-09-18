import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

mock.module('./CpaConfidenceBar', () => ({
  CpaConfidenceBar: () => <div data-testid="ci-bar" />,
}));

const { RecEvidenceChart } = await import('./RecEvidenceChart');

afterEach(cleanup);

const w = (spend: number, leads: number, clicks: number, impressions: number) => ({
  spend,
  purchases: 0,
  addToCarts: 0,
  clicks,
  impressions,
  leads,
});
const snapshot = {
  id: 'a',
  status: 'active',
  currentBudget: 100,
  ageDays: 30,
  windows: { d3: w(300, 2, 30, 3000), d7: w(700, 10, 100, 8000), d14: w(1400, 35, 300, 20000) },
} as never;

const base = {
  id: 'r1',
  adset_id: 'a',
  kind: 'creative_refresh',
  trigger: 'F1_creative_fatigue',
  severity: 'medium',
  reason: 'x',
  status: 'pending',
  evidence: {
    metric: 'ctr',
    value: 0.01,
    comparator: 'down 33% vs 14d',
    threshold: 0.015,
    window: 'd3' as const,
    estImpactPerDay: 20,
    source: 'engine',
  },
};

describe('RecEvidenceChart', () => {
  it('draws the three windows with the threshold for a fatigue call', () => {
    const { getByTestId, container } = render(
      <RecEvidenceChart
        currency="USD"
        denominatorMultiplier={1}
        item={null}
        kpiField="leads"
        maxCpa={100}
        rec={base as never}
        snapshot={snapshot}
      />,
    );
    expect(getByTestId('rec-evidence-bars')).toBeTruthy();
    const text = container.textContent ?? '';
    expect(text).toContain('1.00%');
    expect(text).toContain('1.50%');
    expect(text).toContain('dashed line = 14d 1.50%');
  });

  it('draws the cost interval for a pause when the cycle item carries one', () => {
    const { getByTestId } = render(
      <RecEvidenceChart
        currency="USD"
        denominatorMultiplier={1}
        item={
          { adset_id: 'a', diagnostics: { ci: { cpa: 40, lo: 30, hi: 55, events: 12 } } } as never
        }
        kpiField="leads"
        maxCpa={100}
        rec={{ ...base, kind: 'pause', trigger: 'P2_sustained_poor' } as never}
        snapshot={snapshot}
      />,
    );
    expect(getByTestId('rec-evidence-ci')).toBeTruthy();
    expect(getByTestId('ci-bar')).toBeTruthy();
  });

  it('renders nothing without a snapshot to draw from', () => {
    const { container } = render(
      <RecEvidenceChart
        currency="USD"
        denominatorMultiplier={1}
        item={null}
        kpiField="leads"
        maxCpa={100}
        rec={base as never}
        snapshot={null}
      />,
    );
    expect(container.textContent).toBe('');
  });
});
