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
    expect(container.querySelector('[data-testid="news-comparison"]')?.textContent).toBe(
      '$120 → $186',
    );
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

describe('the arithmetic, shown — in the headline\u2019s own unit', () => {
  it('prints a percentage pair as percentages, not as money', () => {
    const { container } = render(
      <JustificationBlock
        card={card({
          headline: {
            kind: 'share',
            value: 30,
            unit: 'percent',
            label: 'of spend at the top',
            from: 90,
            to: 60,
          },
        })}
        currency="USD"
      />,
    );
    expect(angle(container)).toBe('arithmetic');
    expect(container.querySelector('[data-testid="news-comparison"]')?.textContent).toBe(
      '90% → 60%',
    );
    expect(container.querySelector('[data-testid="news-figure"]')?.textContent).toContain('30%');
  });

  it('prints a count pair as counts', () => {
    const { container } = render(
      <JustificationBlock
        card={card({
          headline: {
            kind: 'count',
            value: 4,
            unit: 'count',
            label: 'ad sets, combined',
            from: 6,
            to: 2,
          },
        })}
        currency="USD"
      />,
    );
    expect(container.querySelector('[data-testid="news-comparison"]')?.textContent).toBe('6 → 2');
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
    // The headline already said $120 a day; the support line carries the month alone.
    expect(container.querySelector('[data-testid="news-support"]')?.textContent).toBe('$3,600/mo');
  });

  it('lets money lead when the detector declared no headline — the state production renders', () => {
    const { container } = render(
      <JustificationBlock
        card={card({ moneyPerDay: null, basis: 'spend/day on the ad set' })}
        currency="USD"
      />,
    );
    expect(angle(container)).toBe('open');
    const figure = container.querySelector('[data-testid="news-figure"]');
    expect(figure?.getAttribute('data-headline')).toBe('money_fallback');
    expect(figure?.textContent).toContain('$14');
    expect(figure?.textContent).toContain('/day');
    // The formula IS the argument beside the figure — not a canned apology.
    expect(container.textContent).toContain('spend/day on the ad set');
    expect(container.querySelector('[data-testid="news-support"]')?.textContent).toBe('$420/mo');
  });

  it('says so plainly when there is no formula either', () => {
    const { container } = render(
      <JustificationBlock card={card({ moneyPerDay: null, impactPerDay: null })} currency="USD" />,
    );
    expect(container.querySelector('[data-testid="news-figure"]')).toBeNull();
    expect(container.querySelector('[data-testid="news-support"]')).toBeNull();
    expect(container.textContent).toContain('No point estimate to give.');
  });
});

describe('the register', () => {
  it('breathes on the shared calm rule, and nowhere near a figure', () => {
    const { container } = render(
      <JustificationBlock card={card({ headline: pair })} currency="USD" />,
    );
    // The SAME CalmRule the account surface uses, so two surfaces cannot drift into two rhythms.
    const rule = container.querySelector('[data-testid="news-calm-rule"]');
    expect(rule).toBeTruthy();
    expect(rule?.textContent).toBe('');
    expect(rule?.getAttribute('aria-hidden')).toBe('true');
  });

  it('lines the digits up', () => {
    const { container } = render(
      <JustificationBlock card={card({ headline: pair })} currency="USD" />,
    );
    const figure = container.querySelector('[data-testid="news-figure"] span');
    expect(figure?.className).toContain('tabular-nums');
  });
});
