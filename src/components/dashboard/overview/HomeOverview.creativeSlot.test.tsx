import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

import { CreativeSlot, ModuleCard } from './HomeOverview';

const row = {
  id: 'ad-1',
  name: 'Tours — Octubre',
  accountId: 'act_1',
  accountName: 'Easy Fit',
} as unknown as Parameters<typeof CreativeSlot>[0]['row'];

afterEach(() => cleanup());

describe('HomeOverview — the creative slot', () => {
  // PP-L1V-muted-caption-contrast-4.41: text-success / text-destructive measure 3.0:1 and 3.5:1
  // on the card; the ink tokens are the typographic colour (4.6:1 and 5.9:1).
  it('names Best and Worst in the ink tokens, never the fill colours', () => {
    const best = render(<CreativeSlot tone="best" row={row} image={null} valueLabel="251.26x" />);
    expect(best.getByText('Best').className).toContain('text-success-ink');
    expect(best.getByText('Best').className).not.toMatch(/(^|\s)text-success(\s|$)/);
    const worst = render(<CreativeSlot tone="worst" row={row} image={null} valueLabel="0.38x" />);
    expect(worst.getByText('Worst').className).toContain('text-destructive-ink');
    expect(worst.getByText('Worst').className).not.toMatch(/(^|\s)text-destructive(\s|$)/);
  });
});

describe('HomeOverview — the creative slot image', () => {
  // PP-L1V-overlaps-jaina-band-labels-home-image: the value badge sat on the image, which the
  // geometry audit reads as an image over text. The value has its own line under the image.
  it('keeps the value label out of the image box', () => {
    const { container, getByText } = render(
      <CreativeSlot
        tone="best"
        row={row}
        image="https://cdn.example/creative.jpg"
        valueLabel="251.26x"
      />,
    );
    const imageBox = container.querySelector('img')?.parentElement;
    expect(imageBox).toBeTruthy();
    expect(imageBox?.textContent).toBe('');
    const value = getByText('251.26x');
    expect(imageBox?.contains(value)).toBe(false);
    expect(getByText('Tours — Octubre')).toBeTruthy();
  });
});

describe('HomeOverview — a module card', () => {
  it("gives the header's Open link an invisible 24px hit area, the header line as drawn", () => {
    // PP-L1V tap-target: "Open ↗" painted 15px tall in each module header.
    const { getByRole } = render(
      <ModuleCard accent="perf" href="/scale" title="Performance +">
        <p>body</p>
      </ModuleCard>,
    );
    const open = getByRole('link', { name: /Open/ });
    expect(open.className.split(' ')).toContain('hit-area');
    expect(open.className).not.toMatch(/\b(min-h|h|py|p)-/);
  });
});
