import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

// `CalmRule` is a `motion.span`. The animation is the point of the component and worthless to
// assert in jsdom, so the element is rendered as a plain span and what the tests check is that
// it is THERE, silent, and hidden from the accessibility tree.
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

import type { ActionsBlockV2 } from '@/lib/jaina/schemas';
import ActionsBlock from './ActionsBlock';

afterEach(cleanup);

type Row = ActionsBlockV2['rows'][number];

const row = (overrides: Partial<Row> = {}): Row => ({
  priority: 'P1',
  entity: { id: '120210', name: 'Prospecting — Broad', kind: 'campaign' },
  action: 'Cut daily budget by 30%',
  sizing: '−$450/day',
  evidence: {
    metric: 'cost_per_purchase',
    value: 88.4,
    unit: 'USD',
    window: 'L14D',
    comparator: 'vs $40 target',
  },
  cite_ids: [],
  ...overrides,
});

const block = (rows: Row[]): ActionsBlockV2 => ({
  block_id: 'b_actions',
  category: 'actions',
  scope: 'account',
  title: 'What to do next',
  priority: 0,
  provenance: null,
  evidence_refs: [],
  rows,
  citations: [],
});

describe('ActionsBlock', () => {
  it('leads each move with its evidence figure, in the evidence’s own unit', () => {
    const { container } = render(<ActionsBlock block={block([row()])} isStreaming={false} />);
    const figure = container.querySelector('[data-testid="actions-figure"]');
    // The currency comes from the evidence unit; a three-letter code is a currency and
    // nothing else in this block is allowed to decide that.
    expect(figure?.textContent).toContain('$88.40');
    expect(figure?.textContent).toContain('cost_per_purchase · L14D');
    // Never appended to the figure — that is how a screen ships "$88.40 USD".
    expect(figure?.querySelector('span')?.textContent).toBe('$88.40');
  });

  it('prints a non-currency unit’s value as a plain number', () => {
    const { container } = render(
      <ActionsBlock
        block={block([
          row({
            evidence: {
              metric: 'frequency',
              value: 4.2,
              unit: 'impressions_per_person',
              window: 'd7',
              comparator: null,
            },
          }),
        ])}
        isStreaming={false}
      />,
    );
    expect(container.querySelector('[data-testid="actions-figure"]')?.textContent).toContain('4.2');
    expect(container.querySelector('[data-testid="actions-figure"]')?.textContent).not.toContain(
      '$',
    );
  });

  it('says the move in one sentence that names the entity and its size', () => {
    const { container } = render(<ActionsBlock block={block([row()])} isStreaming={false} />);
    const sentence = container.querySelector('[data-testid="actions-sentence"]');
    expect(sentence?.textContent).toContain('Prospecting — Broad');
    expect(sentence?.textContent).toContain('(campaign)');
    expect(sentence?.textContent).toContain('Cut daily budget by 30%');
    expect(sentence?.textContent).toContain('−$450/day');
  });

  it('shows the comparator only when the model named one', () => {
    const { container, rerender } = render(
      <ActionsBlock block={block([row()])} isStreaming={false} />,
    );
    expect(container.querySelector('[data-testid="actions-comparator"]')?.textContent).toBe(
      'vs $40 target',
    );
    rerender(
      <ActionsBlock
        block={block([
          row({
            evidence: {
              metric: 'cost_per_purchase',
              value: 88.4,
              unit: 'USD',
              window: 'L14D',
              comparator: null,
            },
          }),
        ])}
        isStreaming={false}
      />,
    );
    // A bare figure beside a null would be the card inventing a comparison nobody made.
    expect(container.querySelector('[data-testid="actions-comparator"]')).toBeNull();
  });

  it('keeps the ranking it was given — the lead move is set larger than the ones under it', () => {
    const { container } = render(
      <ActionsBlock
        block={block([row(), row({ priority: 'P2', action: 'Hold' }), row({ priority: 'P3' })])}
        isStreaming={false}
      />,
    );
    const figures = [
      ...container.querySelectorAll('[data-testid="actions-figure"] span:first-child'),
    ];
    expect(figures).toHaveLength(3);
    expect(figures[0]?.className).toContain('text-2xl');
    expect(figures[1]?.className).toContain('text-lg');
    expect(figures[2]?.className).toContain('text-base');
    expect(
      [...container.querySelectorAll('[data-testid="actions-row"]')].map((node) =>
        node.getAttribute('data-priority'),
      ),
    ).toEqual(['P1', 'P2', 'P3']);
  });

  it('lines the digits up and breathes on the shared calm rule', () => {
    const { container } = render(<ActionsBlock block={block([row()])} isStreaming={false} />);
    expect(container.querySelector('[data-testid="actions-figure"] span')?.className).toContain(
      'tabular-nums',
    );
    const rule = container.querySelector('[data-testid="actions-calm-rule"]');
    expect(rule).toBeTruthy();
    expect(rule?.textContent).toBe('');
    expect(rule?.getAttribute('aria-hidden')).toBe('true');
  });
});
