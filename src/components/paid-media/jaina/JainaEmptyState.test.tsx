import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';

mock.module('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: ComponentProps<'div'>) => <div {...props}>{children}</div>,
  },
}));

mock.module('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button {...props}>{children as ReactNode}</button>
  ),
  buttonVariants: () => '',
}));

const { JainaEmptyState } = await import('./components/JainaEmptyState');

afterEach(cleanup);

const CATEGORIES = {
  'Improve Performance': [
    'Budget Optimization',
    'Audience Targeting',
    'Creative Testing',
    'Funnel Analysis',
    'Scaling Opportunities',
    'Performance Risks',
  ],
  'Prep Client Review': [
    'Weekly Recap',
    'QBR Story',
    'Wins & Highlights',
    'Goal Progress',
    'Executive Summary',
    'Talking Points',
  ],
  'Reduce Churn Risk': [
    'Risk Signals',
    'Underperformance Explainer',
    'Value Proof',
    'Renewal Prep',
    'Objection Handling',
    'Recovery Plan',
  ],
  'Find Growth': ['Scale Headroom', 'New Channel', 'Untapped Audiences'],
} as const;

describe('JainaEmptyState starter prompts', () => {
  it('shows every supplied category and starter card', () => {
    render(<JainaEmptyState adAccountId="act_123" />);

    for (const [category, cards] of Object.entries(CATEGORIES)) {
      expect(screen.getByRole('heading', { name: category })).toBeTruthy();
      for (const card of cards) {
        expect(screen.getByRole('button', { name: card })).toBeTruthy();
      }
    }
  });

  it('submits a concrete prompt for the current scope', () => {
    const onExampleClick = mock();
    render(<JainaEmptyState adAccountId="act_123" onExampleClick={onExampleClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Budget Optimization' }));

    expect(onExampleClick).toHaveBeenCalledWith(
      'Analyze the current ad account and recommend specific budget reallocations to improve performance.',
      [],
    );
  });
});
