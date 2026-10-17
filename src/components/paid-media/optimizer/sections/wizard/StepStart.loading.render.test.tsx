import { afterEach, describe, expect, it } from 'bun:test';
import type { PortfolioSuggestion } from '@continuum/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { StepStart } from './StepStart';

// PP-L1V Optimizer Overview EMPTY layout shift (div.divide-y.border-b, CLS 0.29): with no
// portfolio the Overview lands on onboarding, whose "Start from a suggestion" list loaded as two
// 7rem bordered boxes. React reused that wrapper for the list, which then grew from 214px to
// 556px (375 wide) and slid 18px down when the "grouped from…" line appeared beside the heading;
// everything under it moved with it. The placeholders now take the shape of what arrives —
// borderless suggestion rows inside the same list, ahead of the "Start from scratch" row that
// never depended on the read — and the heading's line is held while it loads.

const suggestion: PortfolioSuggestion = {
  objective: 'purchase',
  name: 'Purchases',
  level: 'adset',
  mode: 'efficiency',
  daily_total: 591,
  cpa_target: 273,
  adset_ids: ['as-1', 'as-2'],
  summary: { adsets: 2, spend14: 8274, conv14: 30 },
  reason: '2 ad sets grouped by Purchase objective',
};

function renderStart(props: { isLoading: boolean; suggestions: PortfolioSuggestion[] }) {
  return (
    <StepStart
      accountId="act_1"
      brandId="brand-1"
      currency="MXN"
      emptyMessage="No grouped suggestions yet."
      isError={false}
      isLoading={props.isLoading}
      onPick={() => {}}
      onScratch={() => {}}
      snapshots={[]}
      suggestions={props.suggestions}
    />
  );
}

afterEach(cleanup);

describe('StepStart while the suggestions load', () => {
  it('holds the list with suggestion-shaped, borderless rows ahead of the real scratch row', () => {
    render(renderStart({ isLoading: true, suggestions: [] }));
    const list = screen.getByTestId('suggestion-list');
    const placeholders = within(list).getAllByTestId('suggestion-skeleton');
    expect(placeholders.length).toBeGreaterThan(0);
    for (const row of placeholders) {
      expect(row.tagName).toBe('ARTICLE');
      expect(row.getAttribute('aria-hidden')).toBe('true');
      expect(row.querySelector('[data-slot="skeleton"]')).toBeNull();
    }
    expect(within(list).getByRole('button', { name: /Start from scratch/ })).toBeTruthy();
    expect(screen.getByTestId('suggestions-subtitle')).toBeTruthy();
  });

  it('keeps the same list and the same scratch row when the suggestions land', () => {
    const view = render(renderStart({ isLoading: true, suggestions: [] }));
    const list = screen.getByTestId('suggestion-list');
    const scratch = within(list).getByRole('button', { name: /Start from scratch/ });

    view.rerender(renderStart({ isLoading: false, suggestions: [suggestion] }));

    expect(screen.getByTestId('suggestion-list')).toBe(list);
    expect(within(list).getByRole('button', { name: /Start from scratch/ })).toBe(scratch);
    expect(within(list).queryAllByTestId('suggestion-skeleton')).toHaveLength(0);
    expect(within(list).getByText('Purchases')).toBeTruthy();
    expect(screen.getByTestId('suggestions-subtitle').textContent).toMatch(/grouped from/);
  });
});
