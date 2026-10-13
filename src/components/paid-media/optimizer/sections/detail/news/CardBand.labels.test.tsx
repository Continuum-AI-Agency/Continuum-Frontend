import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';

import { CardBand } from './CardBand';

// PP-L1V-overlaps-jaina-band-labels-home-image: a label hung BELOW a point near the band's floor
// leaves the band and lands on whatever sits under it — at 768 the "target 300 MXN" label sat on
// the ranking table's header. Past 85% of the box a label hangs above its point instead.

describe('CardBand labels', () => {
  it('hangs a floor-level label above its point, never below the band', () => {
    const { getAllByTestId } = render(
      <CardBand
        currency="MXN"
        figure={null}
        id="range"
        resultLabel="lead"
        tone="neutral"
        visual={{
          kind: 'range',
          low: 200,
          high: 400,
          estimate: 311,
          target: 300,
          results: 12,
          winner: null,
        }}
      />,
    );
    const target = getAllByTestId('band-label').find((node) =>
      node.textContent?.startsWith('target'),
    );
    expect(target).toBeTruthy();
    expect(target?.className).toContain('-translate-y-full');
    expect(target?.style.top).toBe('88.00%');
  });

  it('keeps a label hung below a point that sits high in the band', () => {
    const { getAllByTestId } = render(
      <CardBand
        currency="MXN"
        figure={null}
        id="ctr"
        resultLabel="lead"
        tone="neutral"
        visual={{
          kind: 'ctr_step',
          base: 1.2,
          baseWindowDays: 14,
          recent: 0.6,
          recentWindowDays: 7,
          changePct: -50,
          costChangePct: null,
        }}
      />,
    );
    const labels = getAllByTestId('band-label');
    // Every label stays inside the band: a below-anchored label that starts past 85% flips.
    for (const label of labels) {
      const top = Number.parseFloat(label.style.top);
      if (top >= 85) expect(label.className).toContain('-translate-y-full');
    }
    expect(labels.length).toBeGreaterThan(0);
  });
});
