import { afterEach, describe, expect, it } from 'bun:test';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { resolveRange } from './rangeModel';
import { buildRecap } from './recapModel';

const { ObjectiveCostRecap } = await import('./ObjectiveCostRecap');

afterEach(cleanup);

const TODAY = '2026-09-11';
const lead = getOptimizationMetricDefinition('lead');

function day(date: string, spend: number, leads: number) {
  return { date, spend, leads, impressions: 1000, clicks: 20 };
}

describe('ObjectiveCostRecap', () => {
  it('shows spend, results, cost per result and the target verdict for the range', () => {
    const range = resolveRange({ kind: 'preset', preset: 'd3' }, null, TODAY);
    const recap = buildRecap({
      snapshots: [
        {
          id: 'a',
          daily: [
            day('2026-09-06', 100, 5),
            day('2026-09-07', 100, 5),
            day('2026-09-08', 100, 5),
            day('2026-09-09', 200, 4),
            day('2026-09-10', 200, 4),
            day('2026-09-11', 200, 2),
          ],
        },
      ],
      enrolledIds: ['a'],
      range,
      metric: lead,
      target: 50,
    });
    const { container, getAllByRole } = render(
      <ObjectiveCostRecap currency="USD" metric={lead} range={range} recap={recap} target={50} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('$600');
    expect(text).toContain('Leads');
    expect(text).toContain('10');
    expect(text).toContain('$60');
    expect(text).toContain('Above target');
    expect(text).toContain('+20%');
    expect(text).toContain('vs prior 3 days');
    // sparklines render for spend, results and cost
    expect(getAllByRole('img').length).toBeGreaterThanOrEqual(3);
  });

  it('says below target and no-target states plainly', () => {
    const range = resolveRange({ kind: 'preset', preset: 'd3' }, null, TODAY);
    const recap = buildRecap({
      snapshots: [{ id: 'a', daily: [day('2026-09-11', 100, 10)] }],
      enrolledIds: ['a'],
      range,
      metric: lead,
      target: 20,
    });
    const below = render(
      <ObjectiveCostRecap currency="USD" metric={lead} range={range} recap={recap} target={20} />,
    );
    expect(below.container.textContent).toContain('Below target');
    cleanup();
    const none = render(
      <ObjectiveCostRecap
        currency="USD"
        metric={lead}
        range={range}
        recap={buildRecap({
          snapshots: [{ id: 'a', daily: [day('2026-09-11', 100, 10)] }],
          enrolledIds: ['a'],
          range,
          metric: lead,
          target: null,
        })}
        target={null}
      />,
    );
    expect(none.container.textContent).toContain('No target set');
  });

  it('names the engine window it fell back to when no daily series exists', () => {
    const range = resolveRange({ kind: 'preset', preset: 'd14' }, null, TODAY);
    const recap = buildRecap({
      snapshots: [
        { id: 'a', windows: { d14: { spend: 140, leads: 14, impressions: 0, clicks: 0 } } },
      ],
      enrolledIds: ['a'],
      range,
      metric: lead,
      target: null,
    });
    const { container } = render(
      <ObjectiveCostRecap currency="USD" metric={lead} range={range} recap={recap} target={null} />,
    );
    expect(container.textContent).toContain('engine d14 window');
  });
});
