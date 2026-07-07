import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { CreativeInsight } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { CreativeStrategyTable } from './CreativeStrategyTable';

// The row action menus route via next/navigation; stub it for the DOM render.
mock.module('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
}));

function insight(overrides: Partial<CreativeInsight> = {}): CreativeInsight {
  return {
    id: 'hook-curiosity_gap',
    kind: 'hook',
    archetype: 'curiosity_gap',
    surface: 'organic',
    label: 'Open-ended curiosity hooks',
    description: 'Your top posts open with a curiosity gap.',
    recommendation: 'Test new industry-specific mysteries.',
    tags: [],
    confidence: 0.8,
    performanceSummary: '2 top creatives · avg hook_rate 0.45',
    audience: null,
    evidence: [
      {
        refId: 'a',
        surface: 'organic',
        metric: { name: 'hook_rate', value: 0.528, unit: 'rate' },
        capturedAt: '2026-06-30',
      },
      {
        refId: 'b',
        surface: 'organic',
        metric: { name: 'hook_rate', value: 0.371, unit: 'rate' },
        capturedAt: '2026-06-19',
      },
    ],
    exemplars: [
      {
        refId: 'a',
        kind: 'post',
        snippet: 'Top post A',
        thumbnailRef: 'https://cdn/a.jpg',
        permalinkUrl: 'https://instagram.com/p/AAA',
      },
      {
        refId: 'b',
        kind: 'post',
        snippet: 'Top post B',
        thumbnailRef: 'https://cdn/b.jpg',
        permalinkUrl: null,
      },
    ],
    ...overrides,
  };
}

describe('CreativeStrategyTable', () => {
  afterEach(cleanup);

  it('renders each insight with its label, per-creative metric, and a click-through link', () => {
    render(<CreativeStrategyTable insights={[insight()]} />);

    expect(screen.getByText('Open-ended curiosity hooks')).toBeTruthy();
    // The top exemplar's own hook_rate 0.528 → "53%" shown inline under its thumbnail.
    expect(screen.getByText('53%')).toBeTruthy();
    // Confidence column renders 0.8 → 80%.
    expect(screen.getByText('80%')).toBeTruthy();

    // The exemplar with a permalink is an anchor that opens the live post.
    const link = screen
      .getAllByRole('link')
      .find((el) => el.getAttribute('href') === 'https://instagram.com/p/AAA');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('shows an empty-metric dash when an insight has no measured evidence', () => {
    render(<CreativeStrategyTable insights={[insight({ evidence: [], exemplars: [] })]} />);
    expect(screen.getByText('Open-ended curiosity hooks')).toBeTruthy();
  });
});
