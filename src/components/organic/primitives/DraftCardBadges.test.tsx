import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { StatusBadge, StatusDot } from './DraftCardBadges';
import { DRAFT_STATUS_PRESENTATION } from './draft-card-styles';

// Assertions stay on the rendered WORDS: bun's mock.module is process-wide, and sibling
// planner specs stub `ui/badge`, so a class/attribute assertion here would only be
// testing whichever stub won the process. The hues themselves are proved against the
// presentation map in draft-card-styles.test.ts.
describe('StatusBadge', () => {
  afterEach(() => {
    cleanup();
  });

  it('says the status in words, not in a color the reader has to decode', () => {
    render(<StatusBadge status="scheduled" />);

    expect(screen.getByText('Scheduled')).toBeTruthy();
  });

  it('distinguishes a post that will go out from one that already did', () => {
    render(<StatusBadge status="published" />);

    expect(screen.getByText('Published')).toBeTruthy();
    expect(screen.queryByText('Scheduled')).toBeNull();
  });

  it('names the run-scoped states rather than leaving them as a colored dot', () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText('Failed')).toBeTruthy();
    cleanup();

    render(<StatusBadge status="streaming" />);
    expect(screen.getByText('Generating')).toBeTruthy();
  });

  it('lets a newsletter format override the status word', () => {
    render(<StatusBadge status="draft" format="Newsletter" />);

    expect(screen.getByText('Newsletter')).toBeTruthy();
    expect(screen.queryByText('Draft')).toBeNull();
  });
});

// The month grid's chip is coloured by PLATFORM, so it carried no status signal at all —
// which made the legend's "every status is labeled" false on that surface.
describe('StatusDot', () => {
  afterEach(() => {
    cleanup();
  });

  it('announces the status even though the dot is only 6px', () => {
    render(<StatusDot status="scheduled" />);

    expect(screen.getByText('Scheduled')).toBeTruthy();
  });

  it('takes its hue from the canonical presentation table, not a local palette', () => {
    const { container } = render(<StatusDot status="published" />);

    expect(container.innerHTML).toContain(DRAFT_STATUS_PRESENTATION.published.strip);
  });

  it('carries the plain-language hint as its tooltip', () => {
    const { container } = render(<StatusDot status="failed" />);

    expect(
      container.querySelector(`[title="${DRAFT_STATUS_PRESENTATION.failed.hint}"]`),
    ).toBeTruthy();
  });
});
