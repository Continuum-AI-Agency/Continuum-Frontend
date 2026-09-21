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

import { JustificationBlock } from './JustificationBlock';
import type { NewsCardModel } from './justification';

afterEach(cleanup);

const card = (over: Partial<NewsCardModel> = {}): NewsCardModel => ({
  id: 'c1',
  eyebrow: 'Budget',
  claim: 'Move $66/day onto Cold.',
  reason: null,
  headline: null,
  moneyPerDay: 14,
  impactPerDay: 14,
  basis: null,
  chosenOver: null,
  interval: null,
  cappedBy: null,
  cta: null,
  ...over,
});

const pair = {
  kind: 'money',
  value: 66,
  unit: 'currency_per_day',
  label: 'a day moved onto it',
  from: 120,
  to: 186,
} as const;

const angle = (container: HTMLElement): string | null =>
  container.querySelector('[data-justification]')?.getAttribute('data-justification') ?? null;

describe('the arithmetic, shown', () => {
  it('prints both sides of the pair and the figure they produce', () => {
    const { container } = render(
      <JustificationBlock card={card({ headline: pair })} currency="USD" />,
    );
    expect(angle(container)).toBe('arithmetic');
    const text = container.textContent ?? '';
    expect(text).toContain('$120');
    expect(text).toContain('$186');
    expect(text).toContain('$66');
    expect(text).toContain('a day moved onto it');
  });

  it('keeps money a support line in day · month, never the headline', () => {
    const { container } = render(
      <JustificationBlock card={card({ headline: pair })} currency="USD" />,
    );
    const support = container.querySelector('[data-testid="news-support"]');
    expect(support?.textContent).toBe('$14/day · $420/mo');
  });
});

describe('bounded, not weak', () => {
  const bounded = card({
    headline: {
      kind: 'efficiency',
      value: 33,
      unit: 'percent',
      label: 'cheaper per lead',
      from: null,
      to: null,
    },
    interval: { low: 96, high: 190, estimate: 140, referenceLabel: 'target', reference: 70 },
    cappedBy: 'Capped by this objective’s per-cycle velocity band',
  });

  it('draws the range with the estimate placed inside it', () => {
    const { container } = render(<JustificationBlock card={bounded} currency="USD" />);
    expect(angle(container)).toBe('bounded');
    const rule = container.querySelector('[data-testid="news-interval"]');
    expect(rule?.textContent).toContain('$96');
    expect(rule?.textContent).toContain('$190');
    // (140 - 96) / (190 - 96) = 46.8%
    const tick = rule?.querySelector('span[style]') as HTMLElement | null;
    expect(tick?.style.left).toContain('46.8');
  });

  it('prints the cap as a footnote, in every model', () => {
    const { container } = render(<JustificationBlock card={bounded} currency="USD" />);
    expect(container.querySelector('[data-testid="news-cap"]')?.textContent).toContain(
      'velocity band',
    );
    cleanup();
    const arith = render(
      <JustificationBlock
        card={card({ headline: pair, cappedBy: 'Held · no own budget' })}
        currency="USD"
      />,
    );
    expect(angle(arith.container)).toBe('arithmetic');
    expect(arith.container.querySelector('[data-testid="news-cap"]')?.textContent).toBe(
      'Held · no own budget',
    );
  });

  it('does not multiply a percentage that is already in display units', () => {
    const { container } = render(<JustificationBlock card={bounded} currency="USD" />);
    expect(container.querySelector('[data-testid="news-figure"]')?.textContent).toContain('33%');
  });
});

describe('no point estimate to give', () => {
  it('leaves the range open and says why, with no tick inside it', () => {
    const open = card({
      eyebrow: 'Pause',
      headline: {
        kind: 'avoided',
        value: 120,
        unit: 'currency_per_day',
        label: 'a day buying nothing',
        from: null,
        to: null,
      },
      moneyPerDay: null,
      impactPerDay: 120,
      interval: { low: 96, high: 192, estimate: null, referenceLabel: 'target', reference: 70 },
    });
    const { container } = render(<JustificationBlock card={open} currency="USD" />);
    expect(angle(container)).toBe('open');
    const rule = container.querySelector('[data-testid="news-interval"]');
    expect(rule?.textContent).toContain('no upper bound');
    expect(rule?.querySelector('span[style]')).toBeNull();
    expect(container.textContent).toContain('no cost per result');
    // The money would say $120 twice; the model suppressed it.
    expect(container.querySelector('[data-testid="news-support"]')).toBeNull();
  });

  it('carries a card that holds no figure at all on its sentence alone', () => {
    const { container } = render(<JustificationBlock card={card()} currency="USD" />);
    expect(angle(container)).toBe('open');
    expect(container.querySelector('[data-testid="news-figure"]')).toBeNull();
    expect(container.querySelector('[data-testid="news-interval"]')).toBeNull();
    expect(container.textContent).toContain('No point estimate to give.');
  });
});

describe('the register', () => {
  it('breathes on the connector, and nowhere near a figure', () => {
    const { container } = render(
      <JustificationBlock card={card({ headline: pair })} currency="USD" />,
    );
    const breath = container.querySelector('[data-testid="news-breath"]');
    expect(breath?.textContent).toBe('→');
    expect(breath?.querySelector('[data-testid="news-figure"]')).toBeNull();
  });

  it('lines the digits up', () => {
    const { container } = render(
      <JustificationBlock card={card({ headline: pair })} currency="USD" />,
    );
    const figure = container.querySelector('[data-testid="news-figure"] span');
    expect(figure?.className).toContain('tabular-nums');
  });
});
