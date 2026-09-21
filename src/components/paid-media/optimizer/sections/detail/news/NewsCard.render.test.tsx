import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';

mock.module('motion/react', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { variants: _v, initial: _i, animate: _a, transition: _t, ...rest } = props;
      return React.createElement(tag, { ...rest, ref });
    });
  return {
    motion: { span: passthrough('span'), div: passthrough('div'), p: passthrough('p') },
    useReducedMotion: () => true,
  };
});

import { InsightCard } from './InsightCard';
import type { NewsCardModel } from './justification';
import { NewsCard } from './NewsCard';

afterEach(cleanup);

const card = (over: Partial<NewsCardModel> = {}): NewsCardModel => ({
  id: 'budget:as-1',
  eyebrow: 'Budget',
  claim: 'Move $66/day onto Cold, which buys leads cheaper.',
  reason: 'Cold is 33% cheaper per lead than the portfolio average.',
  headline: {
    kind: 'money',
    value: 66,
    unit: 'currency_per_day',
    label: 'a day moved onto it',
    from: 120,
    to: 186,
  },
  moneyPerDay: 14,
  impactPerDay: 14,
  basis: '2 budget moves this cycle',
  chosenOver: null,
  interval: null,
  cappedBy: null,
  cta: { kind: 'queue_row', rowKey: 'budget:as-1', label: 'Review the budget moves' },
  ...over,
});

describe('NewsCard — the lead', () => {
  it('leads with one figure and one sentence, and sends the click on', () => {
    const clicks: string[] = [];
    const { container, getByText } = render(
      <NewsCard
        asOfLine="As of Sep 19 at 6:10 AM"
        card={card()}
        currency="USD"
        draft={false}
        explainHref="/scale?tab=jaina"
        onCta={(cta) => clicks.push(cta.rowKey ?? cta.kind)}
        tier={{ label: 'High impact', tone: 'destructive' }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Budget');
    expect(text).toContain('High impact');
    expect(text).toContain('Move $66/day onto Cold');
    expect(text).toContain('$66');
    expect(text).toContain('$14/day · $420/mo');
    expect(text).toContain('As of Sep 19 at 6:10 AM');
    fireEvent.click(getByText('Review the budget moves'));
    expect(clicks).toEqual(['budget:as-1']);
  });

  it('keeps the chart inside the card, because it is the same claim drawn', () => {
    const { container } = render(
      <NewsCard
        asOfLine={null}
        card={card()}
        chart={<div data-testid="hero-chart">drawn</div>}
        currency="USD"
        draft={false}
        explainHref="#"
        onCta={() => undefined}
        tier={null}
      />,
    );
    const lead = container.querySelector('[data-testid="portfolio-news-lead"]');
    expect(lead?.querySelector('[data-testid="hero-chart"]')).toBeTruthy();
  });

  it('says why this and not the biggest number, when the brief chose one', () => {
    const { container } = render(
      <NewsCard
        asOfLine={null}
        card={card({ chosenOver: 'The larger pause needs a week of data before it is safe.' })}
        currency="USD"
        draft
        explainHref="#"
        onCta={() => undefined}
        tier={null}
      />,
    );
    expect(container.querySelector('[data-testid="news-chosen-over"]')?.textContent).toContain(
      'needs a week of data',
    );
    expect(container.textContent).toContain('draft read');
  });
});

describe('InsightCard', () => {
  it('argues in the same vocabulary at half the volume', () => {
    const clicks: string[] = [];
    const { container, getByText } = render(
      <InsightCard
        card={card({ id: 'rec:2', eyebrow: 'Creative', claim: 'Creative on Warm' })}
        currency="USD"
        onCta={(cta) => clicks.push(cta.rowKey ?? cta.kind)}
        tier={{ label: 'Medium impact', tone: 'warning' }}
      />,
    );
    const insight = container.querySelector('[data-testid="portfolio-news-insight"]');
    expect(insight?.textContent).toContain('Creative on Warm');
    expect(insight?.textContent).toContain('Medium impact');
    // The SAME justification block, not a second smaller design.
    expect(insight?.querySelector('[data-justification]')?.getAttribute('data-justification')).toBe(
      'arithmetic',
    );
    fireEvent.click(getByText('Review the budget moves'));
    expect(clicks).toEqual(['budget:as-1']);
  });
});
