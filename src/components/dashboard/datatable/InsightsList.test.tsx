import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

import { type InsightListItem, InsightsList, normalizeInsightItems } from './InsightsList';

const items: InsightListItem[] = [
  {
    id: 'a',
    text: 'Reach is up',
    severity: 'positive',
    label: 'Growth',
    detail: 'Keep posting reels',
  },
  { id: 'b', text: 'Saves dipped', severity: 'negative', label: 'Engagement' },
];

describe('InsightsList', () => {
  it('deduplicates repeated insight copy while preserving the first item', () => {
    const normalized = normalizeInsightItems([
      items[0],
      { ...items[0], id: 'duplicate', text: '  REACH is up! ' },
      items[1],
    ]);

    expect(normalized.map((item) => item.id)).toEqual(['a', 'b']);
  });

  afterEach(() => cleanup());

  it('renders text severity, label, insight, and detail for each item', () => {
    render(<InsightsList title="Insights" items={items} />);
    expect(screen.getByText('Positive')).toBeDefined();
    expect(screen.getByText('Needs attention')).toBeDefined();
    expect(screen.getByText('Reach is up')).toBeDefined();
    expect(screen.getByText('Growth')).toBeDefined();
    expect(screen.getByText('Keep posting reels')).toBeDefined();
    expect(screen.getByText('Saves dipped')).toBeDefined();
  });

  it('caps the list height and scrolls the body when maxHeight is set', () => {
    const { container } = render(<InsightsList title="Insights" items={items} maxHeight="21rem" />);
    const list = container.querySelector('ul') as HTMLElement | null;
    expect(list?.className).toContain('overflow-y-auto');
    expect(list?.style.maxHeight).toBe('21rem');
  });

  it('does not constrain height by default', () => {
    const { container } = render(<InsightsList title="Insights" items={items} />);
    const list = container.querySelector('ul') as HTMLElement | null;
    expect(list?.className).not.toContain('overflow-y-auto');
    expect(list?.style.maxHeight).toBe('');
  });

  it('shows the empty state when there are no items', () => {
    render(<InsightsList title="Insights" items={[]} emptyState="No insights yet." />);
    expect(screen.getByText('No insights yet.')).toBeDefined();
  });

  it('labels the shaped loading state', () => {
    render(<InsightsList title="Insights" items={[]} isLoading />);
    expect(screen.getByRole('status', { name: 'Loading recent insights' })).toBeDefined();
    expect(screen.getByText('Loading recent insights…')).toBeDefined();
  });
});
