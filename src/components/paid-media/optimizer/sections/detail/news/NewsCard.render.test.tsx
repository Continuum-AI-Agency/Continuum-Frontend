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
import { NewsCard } from './NewsCard';
import type { NewsCardModel } from './newsModel';

afterEach(cleanup);

const card = (over: Partial<NewsCardModel> = {}): NewsCardModel => ({
  id: 'budget:as-1',
  eyebrow: 'Budget · raise',
  tag: { label: 'Scale', tone: 'good', detail: null },
  subject: null,
  claim: 'Move $66/day onto Cold, which buys leads cheaper.',
  reason: 'Cold is 33% cheaper per lead than the portfolio average.',
  impactPerDay: 14,
  chosenOver: null,
  visual: { kind: 'budget_move', from: 120, to: 186, wanted: 240, cap: 200 },
  figure: { value: 66, unit: 'currency_per_day', label: 'a day moved', signed: true },
  tone: 'primary',
  cta: { kind: 'queue_row', rowKey: 'budget:as-1', label: 'Review the budget moves' },
  ...over,
});

describe('NewsCard — the lead', () => {
  it('reads tag, claim, why, evidence and action on one line, and sends the click on', () => {
    const clicks: string[] = [];
    const { container, getByText } = render(
      <NewsCard
        card={card()}
        currency="USD"
        draft={false}
        explainHref="/scale?tab=jaina"
        onCta={(cta) => clicks.push(cta.rowKey ?? cta.kind)}
        resultLabel="leads"
        tier={{ label: 'High impact', tone: 'destructive' }}
      />,
    );
    const text = container.textContent ?? '';
    const tag = container.querySelector('[data-testid="finding-tag"]');
    expect(tag?.textContent).toBe('Scale');
    expect(tag?.getAttribute('data-tone')).toBe('good');
    expect(tag?.getAttribute('class')).toContain('text-success');
    expect(tag?.getAttribute('title')).toBe('Budget · raise');
    expect(container.querySelector('[data-testid="finding-tier"]')?.textContent).toBe(
      'High impact',
    );
    expect(text).toContain('Move $66/day onto Cold');
    expect(text).toContain('Cold is 33% cheaper');
    // No frame: the line is a grid row, never a card.
    const line = container.querySelector('[data-testid="portfolio-news-lead"]');
    for (const token of ['border', 'rounded-lg', 'bg-card']) {
      expect((line?.getAttribute('class') ?? '').split(/\s+/)).not.toContain(token);
    }
    // The evidence picture is one click away, under the reason.
    expect(container.querySelector('details summary')?.textContent).toContain('Show the evidence');
    const band = container.querySelector('[data-testid="news-band"]');
    expect(band?.getAttribute('data-visual')).toBe('budget_move');
    expect(band?.querySelector('[data-testid="news-figure"]')?.textContent).toContain('+$66.00');
    expect(band?.textContent).toContain('wanted');
    expect(band?.textContent).toContain('cap $200');
    fireEvent.click(getByText('Review the budget moves'));
    expect(clicks).toEqual(['budget:as-1']);
  });

  it('says why this and not the biggest number, when the brief chose one', () => {
    const { container } = render(
      <NewsCard
        card={card({ chosenOver: 'The larger pause needs a week of data before it is safe.' })}
        currency="USD"
        draft
        explainHref="#"
        onCta={() => undefined}
        resultLabel="leads"
        tier={null}
      />,
    );
    expect(container.querySelector('[data-testid="news-chosen-over"]')?.textContent).toContain(
      'needs a week of data',
    );
    expect(container.textContent).toContain('draft read');
  });

  it('prints bare figures for an unknown currency, never a dollar sign', () => {
    const { container } = render(
      <NewsCard
        card={card()}
        currency={null}
        draft={false}
        explainHref="#"
        onCta={() => undefined}
        resultLabel="leads"
        tier={null}
      />,
    );
    const band = container.querySelector('[data-testid="news-band"]');
    expect(band?.textContent).toContain('+66.00');
    expect(band?.textContent).not.toContain('$');
  });
});

describe('InsightCard', () => {
  it('draws its own evidence in the same band the lead has', () => {
    const clicks: string[] = [];
    const { container, getByText } = render(
      <InsightCard
        card={card({
          id: 'rec:2',
          eyebrow: 'Creative · fatigue',
          tag: { label: 'Creative', tone: 'warn', detail: 'fatigue' },
          claim: 'Creative on Warm',
          visual: {
            kind: 'ctr_step',
            base: 0.68,
            baseWindowDays: 14,
            recent: 0.48,
            recentWindowDays: 3,
            changePct: -30,
            costChangePct: 120,
          },
          figure: { value: 23.17, unit: 'currency_per_day', label: 'a day', signed: false },
          tone: 'bad',
        })}
        currency="USD"
        onCta={(cta) => clicks.push(cta.rowKey ?? cta.kind)}
        resultLabel="leads"
        tier={{ label: 'Medium impact', tone: 'warning' }}
      />,
    );
    const insight = container.querySelector('[data-testid="portfolio-news-insight"]');
    expect(insight?.textContent).toContain('Creative on Warm');
    expect(insight?.textContent).toContain('Medium impact');
    const tag = insight?.querySelector('[data-testid="finding-tag"]');
    expect(tag?.textContent).toBe('Creative');
    expect(tag?.getAttribute('class')).toContain('text-warning');
    expect(insight?.textContent).toContain('fatigue');
    const band = insight?.querySelector('[data-testid="news-band"]');
    expect(band?.getAttribute('data-visual')).toBe('ctr_step');
    expect(band?.textContent).toContain('14-day CTR 0.68%');
    expect(band?.textContent).toContain('-30%');
    expect(band?.textContent).toContain('3 days 0.48%');
    expect(band?.textContent).toContain('cost per lead +120%');
    fireEvent.click(getByText('Review the budget moves'));
    expect(clicks).toEqual(['budget:as-1']);
  });
});
