import { afterEach, describe, expect, it } from 'bun:test';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import type { OptimizerAdsetRow } from '../../kpiColumns';
import { vsTarget, vsTargetColumn } from './vsTargetColumn';

afterEach(cleanup);

const row = (over: Partial<OptimizerAdsetRow> = {}): OptimizerAdsetRow => ({
  adsetId: 'as-1',
  name: 'Monterrey Centro',
  spend: 2928,
  results: 48,
  cost: 61,
  ci: null,
  ...over,
});

describe('vsTarget', () => {
  it('reads a cost under the target as its share of it', () => {
    expect(vsTarget(61, 95)).toEqual({ ratio: 61 / 95, fill: 61 / 95, over: false });
  });

  it('caps the fill at a full track once the cost is over the target', () => {
    expect(vsTarget(128.4, 95)).toEqual({ ratio: 128.4 / 95, fill: 1, over: true });
  });

  it('has nothing to say without a cost or without a target', () => {
    expect(vsTarget(null, 95)).toBeNull();
    expect(vsTarget(61, null)).toBeNull();
    expect(vsTarget(61, 0)).toBeNull();
    expect(vsTarget(Number.NaN, 95)).toBeNull();
  });
});

describe('vsTargetColumn', () => {
  const column = vsTargetColumn({
    target: 95,
    metric: getOptimizationMetricDefinition('lead'),
    currency: null,
  });

  it('draws a green bar and the signed distance under the target', () => {
    const { container } = render(<div>{column.cell(row())}</div>);
    const cell = container.querySelector('[data-testid="vs-target"]');
    expect(cell?.getAttribute('data-over')).toBe('false');
    expect(cell?.textContent).toBe('-36%');
    const fill = cell?.querySelector('[style]') as HTMLElement | null;
    expect(fill?.style.width).toBe('64.2%');
    expect(fill?.className).toContain('bg-success/60');
  });

  it('draws a full red bar over the target', () => {
    const { container } = render(<div>{column.cell(row({ cost: 128.4 }))}</div>);
    const cell = container.querySelector('[data-testid="vs-target"]');
    expect(cell?.getAttribute('data-over')).toBe('true');
    expect(cell?.textContent).toBe('+35%');
    const fill = cell?.querySelector('[style]') as HTMLElement | null;
    expect(fill?.style.width).toBe('100.0%');
    expect(fill?.className).toContain('bg-destructive/60');
  });

  it('shows a dash for a held or unpriced ad set and sorts it last', () => {
    const held = row({ freezeReason: 'velocity_cap' });
    expect(render(<div>{column.cell(held)}</div>).container.textContent).toBe('—');
    expect(column.sortValue?.(held)).toBe(-1);
    expect(column.sortValue?.(row({ cost: null }))).toBe(-1);
  });
});
