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

describe('ComparisonBlock — two sides, money by the one rule', () => {
  const twoAdSets = (): ComparisonBlockV2 => ({
    ...block([
      pair({
        label: 'Cost per result',
        before: 85.47,
        after: 112.3,
        format: 'currency',
        currency: 'MXN',
        change: 31,
        change_direction: 'up',
      }),
    ]),
    title: 'CAÑADAS // MENSAJES vs SATÉLITE // MENSAJES',
    before_label: 'CAÑADAS // MENSAJES',
    after_label: 'SATÉLITE // MENSAJES',
    side_a: { label: 'CAÑADAS // MENSAJES', window: 'Last 7 days', entity: null },
    side_b: { label: 'SATÉLITE // MENSAJES', window: 'Last 7 days', entity: null },
  });

  it('heads each column with its side and names a shared window once', () => {
    render(<ComparisonBlock block={twoAdSets()} isStreaming={false} />);
    const headers = Array.from(document.querySelectorAll('th')).map((th) => th.textContent);
    expect(headers.slice(1, 3)).toEqual(['CAÑADAS // MENSAJES', 'SATÉLITE // MENSAJES']);
    expect(document.querySelector('[data-comparison-window]')?.textContent).toBe('Last 7 days');
  });

  it('names each side its own window when the windows differ', () => {
    const block = twoAdSets();
    render(
      <ComparisonBlock
        block={{
          ...block,
          side_a: { label: 'CAÑADAS', window: 'Sep 1–7', entity: null },
          side_b: { label: 'CAÑADAS', window: 'Sep 8–14', entity: null },
        }}
        isStreaming={false}
      />,
    );
    const headers = Array.from(document.querySelectorAll('th')).map((th) => th.textContent);
    expect(headers.slice(1, 3)).toEqual(['CAÑADASSep 1–7', 'CAÑADASSep 8–14']);
    expect(document.querySelector('[data-comparison-window]')).toBeNull();
  });

  it('reads a Spanish cost label that rose as a problem', () => {
    render(
      <ComparisonBlock
        block={{
          ...twoAdSets(),
          pairs: twoAdSets().pairs.map((p) => ({ ...p, label: 'Costo por resultado' })),
        }}
        isStreaming={false}
      />,
    );
    expect(cellFor('Costo por resultado').className).toContain('text-destructive');
  });

  it('prints each money leg as "$85.47 MXN" and stamps its raw value and currency', () => {
    render(<ComparisonBlock block={twoAdSets()} isStreaming={false} />);
    const figures = screen.getAllByTestId('figure');
    expect(figures.map((figure) => figure.textContent)).toEqual(['$85.47 MXN', '$112 MXN']);
    expect(figures[0].getAttribute('data-figure-raw')).toBe('85.47');
    expect(figures[0].getAttribute('data-figure-currency')).toBe('MXN');
  });

  it('names each side on its own figure cell, for the one-card-per-metric narrow reading', () => {
    render(<ComparisonBlock block={twoAdSets()} isStreaming={false} />);
    const sides = screen
      .getAllByTestId('figure')
      .map((figure) => figure.closest('td')?.getAttribute('data-side'));
    expect(sides).toEqual(['CAÑADAS // MENSAJES', 'SATÉLITE // MENSAJES']);
    expect(document.querySelector('table')?.parentElement?.className).toContain(
      '@container/comparison',
    );
  });

  it('keeps before_label / after_label on a block stored before the sides existed', () => {
    render(<ComparisonBlock block={block([pair({})])} isStreaming={false} />);
    const headers = Array.from(document.querySelectorAll('th')).map((th) => th.textContent);
    expect(headers.slice(1, 3)).toEqual(['Last week', 'This week']);
  });
});
