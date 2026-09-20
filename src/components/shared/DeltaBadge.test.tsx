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

  it('announces the movement AND whether it is welcome', () => {
    // The label used to stop at "Up 12%". The colour carried whether that was good news,
    // and colour is exactly what a screen reader cannot see — so the word carries it now.
    const { rerender } = render(<DeltaBadge value={12} />);
    expect(screen.getByLabelText('Up 12%, good')).toBeDefined();
    rerender(<DeltaBadge value={-7} />);
    expect(screen.getByLabelText('Down 7%, a problem')).toBeDefined();
  });

  it('colours a rising value green and a falling one red, by default', () => {
    const { rerender } = render(<DeltaBadge value={12} />);
    expect(screen.getByLabelText(/Up 12%/).className).toContain('text-success');
    rerender(<DeltaBadge value={-7} />);
    expect(screen.getByLabelText(/Down 7%/).className).toContain('text-destructive');
  });

  it('inverts the colour for a metric whose falling is the good outcome', () => {
    // A cost per result that fell used to render red across every dashboard in the app.
    const { rerender } = render(<DeltaBadge goodWhenDown value={-7} />);
    const fell = screen.getByLabelText(/Down 7%/);
    expect(fell.className).toContain('text-success');
    expect(fell.getAttribute('aria-label')).toBe('Down 7%, good');

    rerender(<DeltaBadge goodWhenDown value={12} />);
    const rose = screen.getByLabelText(/Up 12%/);
    expect(rose.className).toContain('text-destructive');
    expect(rose.getAttribute('aria-label')).toBe('Up 12%, a problem');
  });

  it('keeps the arrow pointing the way the number moved, whatever the colour', () => {
    // Direction is a fact; judgement is an opinion. The arrow must never lie about the fact.
    const { container } = render(<DeltaBadge goodWhenDown value={-7} />);
    // lucide renders the icon name onto the svg's class list
    expect(container.querySelector('svg')?.getAttribute('class')).toContain('arrow-down-right');
  });

  it('leaves existing call sites unchanged — the default is the old behaviour', () => {
    render(<DeltaBadge value={5} />);
    expect(screen.getByLabelText(/Up 5%/).className).toContain('text-success');
  });
});
