import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';

import { CreativeSlot } from './HomeOverview';

const row = {
  id: 'ad-1',
  name: 'Tours — Octubre',
  accountId: 'act_1',
  accountName: 'Easy Fit',
} as unknown as Parameters<typeof CreativeSlot>[0]['row'];

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
