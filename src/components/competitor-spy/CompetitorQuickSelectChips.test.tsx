import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Competitor } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { CompetitorQuickSelectChips } from './CompetitorQuickSelectChips';

function competitor(overrides: Partial<Competitor> = {}): Competitor {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    brandId: '00000000-0000-0000-0000-000000000002',
    name: 'Acme Co',
    slug: 'acme-co',
    source: 'user',
    metaPageId: null,
    status: 'active',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(cleanup);

describe('CompetitorQuickSelectChips', () => {
  it('renders an All chip plus one chip per competitor', () => {
    const { getByRole } = render(
      <CompetitorQuickSelectChips
        competitors={[competitor({ id: 'a', name: 'Nike' })]}
        onSelect={() => {}}
      />,
    );
    expect(getByRole('button', { name: 'All' })).toBeDefined();
    expect(getByRole('button', { name: /Nike/ })).toBeDefined();
  });

  it('renders nothing when there are no competitors', () => {
    const { container } = render(
      <CompetitorQuickSelectChips competitors={[]} onSelect={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onSelect with the competitor id when a chip is clicked', () => {
    const onSelect = mock((_id: string | undefined) => {});
    const { getByRole } = render(
      <CompetitorQuickSelectChips
        competitors={[competitor({ id: 'nike-id', name: 'Nike' })]}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(getByRole('button', { name: /Nike/ }));
    expect(onSelect).toHaveBeenCalledWith('nike-id');
  });

  it('calls onSelect with undefined when All is clicked', () => {
    const onSelect = mock((_id: string | undefined) => {});
    const { getByRole } = render(
      <CompetitorQuickSelectChips
        competitors={[competitor({ id: 'a', name: 'Nike' })]}
        selectedId="a"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(getByRole('button', { name: 'All' }));
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it('ranks competitors by follower count (highest first)', () => {
    const { getAllByRole } = render(
      <CompetitorQuickSelectChips
        competitors={[
          competitor({ id: 'small', name: 'Small', instagramFollowersCount: 100 }),
          competitor({ id: 'big', name: 'Big', instagramFollowersCount: 9000 }),
        ]}
        onSelect={() => {}}
      />,
    );
    const buttons = getAllByRole('button');
    // buttons[0] is "All"; the first competitor chip should be the highest-follower one.
    expect(buttons[1].textContent).toContain('Big');
    expect(buttons[2].textContent).toContain('Small');
  });

  it('caps the number of chips at max', () => {
    const competitors = Array.from({ length: 12 }, (_, i) =>
      competitor({ id: `c${i}`, name: `C${i}`, instagramFollowersCount: 1000 - i }),
    );
    const { getAllByRole } = render(
      <CompetitorQuickSelectChips competitors={competitors} onSelect={() => {}} max={3} />,
    );
    // 1 "All" + 3 competitor chips.
    expect(getAllByRole('button')).toHaveLength(4);
  });
});
