import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

import { type InsightListItem, InsightsList } from './InsightsList';

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
  afterEach(() => cleanup());

  it('renders the dot, label, text, and detail for each item', () => {
    render(<InsightsList title="Insights" items={items} />);
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
});
