import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { DeltaBadge } from './DeltaBadge';

describe('DeltaBadge', () => {
  afterEach(cleanup);

  it('renders zero as a neutral no-change state', () => {
    render(<DeltaBadge value={0} />);
    const badge = screen.getByLabelText('No change');
    expect(badge.textContent).toContain('0%');
    expect(badge.className).toContain('text-muted-foreground');
  });

  it('announces positive and negative changes', () => {
    const { rerender } = render(<DeltaBadge value={12} />);
    expect(screen.getByLabelText('Up 12%')).toBeDefined();
    rerender(<DeltaBadge value={-7} />);
    expect(screen.getByLabelText('Down 7%')).toBeDefined();
  });
});
