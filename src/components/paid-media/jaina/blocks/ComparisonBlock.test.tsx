import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { ComparisonBlockV2 } from '@/lib/jaina/schemas';
import ComparisonBlock from './ComparisonBlock';

afterEach(cleanup);

type Pair = ComparisonBlockV2['pairs'][number];

const pair = (overrides: Partial<Pair>): Pair => ({
  label: 'Cost per result',
  before: 42,
  after: 34,
  baseline: null,
  unit: null,
  format: 'number',
  percent_basis: null,
  change: -19,
  change_direction: 'down',
  severity: 'neutral',
  cite_ids: [],
  ...overrides,
});

const block = (pairs: Pair[]): ComparisonBlockV2 => ({
  block_id: 'wow',
  category: 'comparison',
  scope: 'account',
  title: 'This week vs last',
  priority: 'primary',
  provenance: null,
  before_label: 'Last week',
  after_label: 'This week',
  baseline_label: null,
  pairs,
  citations: [],
});

const cellFor = (label: string): HTMLElement => {
  const row = screen.getByText(label).closest('tr');
  if (!row) throw new Error(`no row for ${label}`);
  const cells = row.querySelectorAll('td');
  return cells[cells.length - 1] as HTMLElement;
};

describe('ComparisonBlock — the change column carries a judgement, not a sign', () => {
  it('reads a cost that FELL as good news', () => {
    // The bug this pins: the column used to colour off `severity` alone. Every pair arrives
    // with the schema's `'neutral'` default, so a cost per result down 19% — the outcome the
    // whole account is optimising for — rendered in the same grey as a figure nobody looked at.
    render(<ComparisonBlock block={block([pair({})])} isStreaming={false} />);
    const cell = cellFor('Cost per result');
    expect(cell.className).toContain('text-success');
    expect(cell.getAttribute('title')).toBe('Cost per result: good');
  });

  it('reads a cost that ROSE as a problem', () => {
    render(
      <ComparisonBlock
        block={block([pair({ change: 19, change_direction: 'up', before: 34, after: 42 })])}
        isStreaming={false}
      />,
    );
    expect(cellFor('Cost per result').className).toContain('text-destructive');
  });

  it('keeps the plain reading for a metric whose direction it will not guess', () => {
    render(
      <ComparisonBlock
        block={block([pair({ label: 'Spend', change: 19, change_direction: 'up' })])}
        isStreaming={false}
      />,
    );
    // Spend is not in the cost family, so the sign is the last resort and rising is "up is good".
    expect(cellFor('Spend').className).toContain('text-success');
  });

  it('still lets a severity the model actually chose win over the polarity', () => {
    render(<ComparisonBlock block={block([pair({ severity: 'risk' })])} isStreaming={false} />);
    expect(cellFor('Cost per result').className).toContain('text-destructive');
  });

  it('prints an em dash for a change nobody measured, never a fabricated 0%', () => {
    render(
      <ComparisonBlock
        block={block([pair({ change: null, change_direction: null })])}
        isStreaming={false}
      />,
    );
    const cell = cellFor('Cost per result');
    expect(cell.textContent).toBe('—');
    expect(cell.getAttribute('title')).toBeNull();
  });

  it('aligns every figure column right and only the metric column left', () => {
    render(<ComparisonBlock block={block([pair({})])} isStreaming={false} />);
    const headers = Array.from(document.querySelectorAll('th'));
    expect(headers[0].className).toContain('text-left');
    for (const header of headers.slice(1)) {
      expect(header.className).toContain('text-right');
      // The old row carried `text-left` AND `text-right` on every cell.
      expect(header.className).not.toContain('text-left');
    }
  });
});
