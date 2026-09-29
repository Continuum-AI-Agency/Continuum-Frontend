import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

mock.module('motion/react', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { variants: _v, initial: _i, animate: _a, transition: _t, ...rest } = props;
      return React.createElement(tag, { ...rest, ref });
    });
  return {
    motion: { span: passthrough('span'), div: passthrough('div'), p: passthrough('p') },
    useReducedMotion: () => false,
  };
});

import type { GoalPacingBlockV2 } from '@/lib/jaina/schemas';
import GoalPacingBlock from './GoalPacingBlock';

afterEach(cleanup);

const block = (overrides: Partial<GoalPacingBlockV2> = {}): GoalPacingBlockV2 => ({
  block_id: 'b_pacing',
  category: 'goal_pacing',
  scope: 'account',
  title: 'September budget',
  priority: 0,
  provenance: null,
  evidence_refs: [],
  budget: 12_000,
  spent: 9_000,
  currency_code: 'USD',
  period_start: '2026-09-01',
  period_end: '2026-09-30',
  elapsed_pct: 0.6,
  pace_ratio: 1.25,
  projected_end: 15_000,
  status: 'overpacing',
  ...overrides,
});

describe('GoalPacingBlock', () => {
  it('leads with the one figure a reader acts on — the pace against plan', () => {
    const { container } = render(<GoalPacingBlock block={block()} isStreaming={false} />);
    const figure = container.querySelector('[data-testid="goal-pacing-figure"]');
    expect(figure?.querySelector('span')?.textContent).toBe('125%');
    expect(figure?.textContent).toContain('of plan');
  });

  it('says the status in words, never in a colour a reader has to decode', () => {
    const { container, rerender } = render(<GoalPacingBlock block={block()} isStreaming={false} />);
    expect(container.querySelector('[data-testid="goal-pacing-figure"]')?.textContent).toContain(
      'ahead of the calendar',
    );
    rerender(
      <GoalPacingBlock
        block={block({ status: 'underpacing', pace_ratio: 0.5 })}
        isStreaming={false}
      />,
    );
    expect(container.querySelector('[data-testid="goal-pacing-figure"]')?.textContent).toContain(
      'behind the calendar',
    );
    rerender(
      <GoalPacingBlock block={block({ status: 'on_track', pace_ratio: 1 })} isStreaming={false} />,
    );
    expect(container.querySelector('[data-testid="goal-pacing-figure"]')?.textContent).toContain(
      'on plan',
    );
  });

  it('carries the money and the calendar it is judged against in one sentence', () => {
    const { container } = render(<GoalPacingBlock block={block()} isStreaming={false} />);
    const sentence = container.querySelector('[data-testid="goal-pacing-sentence"]');
    expect(sentence?.textContent).toContain('$9,000.00 of $12,000.00');
    expect(sentence?.textContent).toContain('60% of 2026-09-01 – 2026-09-30 elapsed');
  });

  it('uses the block’s own currency and never defaults an unknown one to USD', () => {
    const { container } = render(
      <GoalPacingBlock block={block({ currency_code: 'MXN' })} isStreaming={false} />,
    );
    expect(container.querySelector('[data-testid="goal-pacing-sentence"]')?.textContent).toContain(
      'MX$9,000.00',
    );
  });

  it('draws the comparison once: the fill is the money, the tick is the calendar', () => {
    const { container } = render(<GoalPacingBlock block={block()} isStreaming={false} />);
    // 9,000 of 12,000 spent against 60% of the month: the fill sits past the tick, which
    // is what "ahead of the calendar" means, visible without reading either number.
    const fill = container.querySelector<HTMLElement>('[data-testid="goal-pacing-spent-fill"]');
    const tick = container.querySelector<HTMLElement>('[data-testid="goal-pacing-elapsed-tick"]');
    expect(fill?.style.width).toBe('75%');
    expect(tick?.style.left).toBe('60%');
  });

  it('shows a projection only when the model gave one', () => {
    const { container, rerender } = render(<GoalPacingBlock block={block()} isStreaming={false} />);
    expect(
      container.querySelector('[data-testid="goal-pacing-projection"]')?.textContent,
    ).toContain('$15,000.00 projected by 2026-09-30');
    rerender(<GoalPacingBlock block={block({ projected_end: null })} isStreaming={false} />);
    expect(container.querySelector('[data-testid="goal-pacing-projection"]')).toBeNull();
  });

  it('breathes on the shared calm rule, silently', () => {
    const { container } = render(<GoalPacingBlock block={block()} isStreaming={false} />);
    const rule = container.querySelector('[data-testid="goal-pacing-calm-rule"]');
    expect(rule).toBeTruthy();
    expect(rule?.textContent).toBe('');
    expect(rule?.getAttribute('aria-hidden')).toBe('true');
  });
});
