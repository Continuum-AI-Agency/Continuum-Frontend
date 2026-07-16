import { afterEach, beforeAll, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { ComparisonBlockV2, InsightListBlockV2, NarrativeBlockV2 } from '@/lib/jaina/schemas';

// Render markdown as plain text so the narrative-body assertions are
// deterministic (the real SafeMarkdown is lazy via next/dynamic + streamdown).
mock.module('@/components/ui/SafeMarkdownLazy', () => ({
  SafeMarkdown: ({ content }: { content: string }) => <span>{content}</span>,
}));

let NarrativeBlock: typeof import('./NarrativeBlock')['default'];
let InsightListBlock: typeof import('./InsightListBlock')['default'];
let ComparisonBlock: typeof import('./ComparisonBlock')['default'];

beforeAll(async () => {
  NarrativeBlock = (await import('./NarrativeBlock')).default;
  InsightListBlock = (await import('./InsightListBlock')).default;
  ComparisonBlock = (await import('./ComparisonBlock')).default;
});

afterEach(() => {
  cleanup();
});

const citation = {
  id: 'c1',
  tool: 'analytics_query',
  cache_key: 'cache-c1',
  label: 'Spend by day',
};

const narrativeBlock: NarrativeBlockV2 = {
  block_id: 'b1',
  category: 'narrative',
  scope: 'account',
  title: 'Overview',
  priority: 1,
  body: 'Spend rose 24% [cite:c1] this week.',
  highlights: [],
  citations: [citation],
};

const insightBlock: InsightListBlockV2 = {
  block_id: 'b2',
  category: 'insight_list',
  scope: 'account',
  title: 'Insights',
  priority: 1,
  items: [
    {
      item_type: 'insight',
      title: 'CPA improved',
      summary: 'CPA fell 12%',
      rationale: 'lower CPC',
      impact: 'higher ROAS',
      severity: 'positive',
      priority: 'now',
      cite_ids: ['c1'],
    },
  ],
  citations: [citation],
};

const comparisonBlock: ComparisonBlockV2 = {
  block_id: 'b3',
  category: 'comparison',
  scope: 'account',
  title: 'Before vs After',
  priority: 1,
  before_label: 'Last',
  after_label: 'This',
  pairs: [
    {
      label: 'CPA',
      before: 10,
      after: 8,
      unit: null,
      format: 'currency',
      change: -20,
      change_direction: 'down',
      severity: 'positive',
      cite_ids: ['c1'],
    },
  ],
  citations: [citation],
};

describe('Jaina block citations', () => {
  it('renders a [cite:id] marker as a resolvable citation, never literal text', () => {
    const { container } = render(<NarrativeBlock block={narrativeBlock} isStreaming={false} />);

    expect(container.textContent ?? '').not.toContain('[cite:');

    const chip = screen.getByLabelText(/analytics_query/);
    expect(chip.getAttribute('aria-label')).toContain('Spend by day');
    expect(chip.textContent).toContain('1');
  });

  it('strips an unmatched [cite:id] marker rather than showing the literal', () => {
    const block: NarrativeBlockV2 = {
      ...narrativeBlock,
      body: 'No source here [cite:zzz] still shown.',
      citations: [],
    };

    const { container } = render(<NarrativeBlock block={block} isStreaming={false} />);

    expect(container.textContent ?? '').not.toContain('[cite:');
    expect(container.textContent ?? '').toContain('No source here');
    expect(container.textContent ?? '').toContain('still shown.');
    expect(screen.queryByText(/sources/i)).toBeNull();
  });

  it('renders numbered chips and a Sources footer for insight items with cite_ids', () => {
    render(<InsightListBlock block={insightBlock} isStreaming={false} />);

    const chip = screen.getByLabelText(/analytics_query/);
    expect(chip.textContent).toContain('1');
    expect(screen.getByText(/Used 1 sources/)).toBeDefined();
  });

  it('renders citation chips and a Sources footer for comparison pairs with cite_ids', () => {
    render(<ComparisonBlock block={comparisonBlock} isStreaming={false} />);

    const chip = screen.getByLabelText(/analytics_query/);
    expect(chip.textContent).toContain('1');
    expect(screen.getByText(/Used 1 sources/)).toBeDefined();
  });

  it('omits chips and the Sources footer when the block has no citations', () => {
    const block: InsightListBlockV2 = { ...insightBlock, citations: [] };

    render(<InsightListBlock block={block} isStreaming={false} />);

    expect(screen.queryByLabelText(/analytics_query/)).toBeNull();
    expect(screen.queryByText(/Used/)).toBeNull();
  });
});
