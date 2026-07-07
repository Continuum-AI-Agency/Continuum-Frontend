import { afterEach, describe, expect, it } from 'bun:test';
import type { OrganicAwarenessReportPayload } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { OrganicAwarenessReportView } from './OrganicAwarenessReportView';

// happy-dom does not expose these constructors on `window`; testing-library's
// selector parser needs them. Matches the project's other component tests.
Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

afterEach(() => cleanup());

const report: OrganicAwarenessReportPayload = {
  windowStart: '2026-06-03',
  windowEnd: '2026-06-10',
  summary: { posts: 2, reach: 1000, views: 2000, topHookRate: 80, lowHookCount: 1 },
  blocks: [
    {
      category: 'summary',
      title: 'Window summary',
      data: { reach: 1000, views: 2000, engagement: 150, comments: 20 },
    },
    {
      category: 'top_posts',
      title: 'Top posts by hook rate',
      data: [{ id: '1', mediaProductType: 'REELS', hookRate: 80, views: 900, reach: 700 }],
    },
    {
      category: 'narrative',
      title: 'What changed',
      data: ['Reels outperformed feed posts this week.'],
    },
  ],
};

describe('OrganicAwarenessReportView', () => {
  it('teaches the feature in the empty state', () => {
    render(<OrganicAwarenessReportView report={null} />);
    expect(screen.getByText(/AI-Awareness report builds with your data/i)).toBeDefined();
  });

  it('renders the window, summary metrics, top hooks, and narrative', () => {
    render(<OrganicAwarenessReportView report={report} />);
    expect(screen.getByText('2026-06-03 – 2026-06-10')).toBeDefined();
    expect(screen.getByText('Window summary')).toBeDefined();
    expect(screen.getByText('80.0%')).toBeDefined();
    expect(screen.getByText('Reel')).toBeDefined();
    expect(screen.getByText(/Reels outperformed feed posts/i)).toBeDefined();
  });

  it('links a top post to its permalink when one is present', () => {
    const linked: OrganicAwarenessReportPayload = {
      ...report,
      blocks: [
        {
          category: 'top_posts',
          title: 'Top posts by hook rate',
          data: [
            {
              id: '1',
              mediaProductType: 'REELS',
              hookRate: 80,
              views: 900,
              reach: 700,
              permalink: 'https://instagram.com/reel/abc',
            },
          ],
        },
      ],
    };
    render(<OrganicAwarenessReportView report={linked} />);
    const link = screen.getByRole('link', { name: /open reel/i });
    expect(link.getAttribute('href')).toBe('https://instagram.com/reel/abc');
  });
});
