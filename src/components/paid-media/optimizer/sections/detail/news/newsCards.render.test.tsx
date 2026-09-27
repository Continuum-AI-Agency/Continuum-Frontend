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
    motion: {
      section: passthrough('section'),
      div: passthrough('div'),
      p: passthrough('p'),
      span: passthrough('span'),
    },
    useReducedMotion: () => true,
    useMotionValue: (v: number) => ({ get: () => v, set: () => undefined }),
    useMotionValueEvent: () => undefined,
    animate: () => ({ stop: () => undefined }),
  };
});

import { PortfolioHero } from '../PortfolioHero';
import { REAL_BODIES, type RealBodyName, readBody } from './realBodies.fixture';

afterEach(cleanup);

// The news row, rendered from each real optimizer-status body with the currency these
// accounts actually carry — none. Every card must draw a picture of its own evidence.

function cardsOf(name: RealBodyName): Element[] {
  const { report, view, dailyTotal } = readBody(name);
  const { container } = render(
    <PortfolioHero
      currency={null}
      dailyTotal={dailyTotal}
      explainHref="#"
      items={report.latest_items}
      nextCycleAt={null}
      onCta={() => undefined}
      portfolioId="p1"
      view={view}
    />,
  );
  return [
    ...container.querySelectorAll(
      '[data-testid="portfolio-news-lead"], [data-testid="portfolio-news-insight"]',
    ),
  ];
}

const bandOf = (card: Element | undefined) => card?.querySelector('[data-testid="news-band"]');

describe('every card on every real body', () => {
  for (const name of Object.keys(REAL_BODIES) as RealBodyName[]) {
    it(`${name}: no card without a visual, and the visual fills the band`, () => {
      const cards = cardsOf(name);
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        const band = bandOf(card);
        expect(band?.getAttribute('class')).toContain('flex-1');
        const visual = band?.querySelector('[data-testid="news-visual"]');
        expect(visual?.getAttribute('role')).toBe('img');
        expect(visual?.getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(10);
        expect(visual?.childElementCount ?? 0).toBeGreaterThan(0);
      }
    });

    it(`${name}: never prints "$" for an unknown currency`, () => {
      for (const card of cardsOf(name)) expect(card.textContent).not.toContain('$');
    });

    it(`${name}: never prints the engine's formula string`, () => {
      for (const card of cardsOf(name)) {
        expect(card.textContent).not.toMatch(/the engine sized|spend\/day|impact\/day/);
        expect(card.textContent).not.toContain('Not enough priced days');
      }
    });

    it(`${name}: uses no text-2xs / text-3xs anywhere in a card`, () => {
      for (const card of cardsOf(name)) {
        const tiny = [card, ...card.querySelectorAll('*')].filter((node) =>
          /\btext-(2|3)xs\b/.test(node.getAttribute('class') ?? ''),
        );
        expect(tiny.map((node) => node.getAttribute('class'))).toEqual([]);
      }
    });
  }
});

describe('the figures each card draws', () => {
  it('FORMULARIOS: the RTG pause, the zero-lead pause and the worn-out creative', () => {
    const [p2, p3, f1] = cardsOf('formularios').map(bandOf);
    expect(p2?.getAttribute('data-visual')).toBe('cost_vs_reference');
    expect(p2?.textContent).toContain('75.65 / lead · this ad set');
    expect(p2?.textContent).toContain('28.86 · the reference');
    expect(p2?.textContent).toContain('2.5× line · 72.14');
    expect(p2?.querySelector('[data-testid="news-figure"]')?.textContent).toContain('43.23');
    expect(p3?.getAttribute('data-visual')).toBe('spend_blocks');
    expect(p3?.textContent).toContain('340 = 9.7 leads at target');
    expect(p3?.textContent).toContain('0 leads');
    expect(p3?.querySelectorAll('rect').length).toBe(10);
    expect(f1?.getAttribute('data-visual')).toBe('ctr_step');
    expect(f1?.textContent).toContain('14-day CTR 0.68%');
    expect(f1?.textContent).toContain('3 days 0.48%');
    expect(f1?.textContent).toContain('-30%');
    expect(f1?.textContent).toContain('cost per lead +120%');
  });

  it('Prueba (25 Sep cycle): CTR decay, the capped budget raise and the winner’s range', () => {
    const [f1, budget, range] = cardsOf('pruebaCycle').map(bandOf);
    expect(f1?.textContent).toContain('14-day CTR 0.86%');
    expect(f1?.textContent).toContain('3 days 0.62%');
    expect(f1?.textContent).toContain('-28%');
    expect(f1?.textContent).toContain('cost per lead +36%');
    expect(budget?.getAttribute('data-visual')).toBe('budget_move');
    for (const figure of ['33.75', '39.15', '52.42', 'cap 42.19', 'wanted', '+5.40']) {
      expect(budget?.textContent).toContain(figure);
    }
    expect(range?.getAttribute('data-visual')).toBe('range');
    for (const figure of ['13.15', '30.53', 'est. 19.56', 'target 25.00']) {
      expect(range?.textContent).toContain(figure);
    }
  });

  it('MENSAJES: cost per conversation across the 12 ad sets against the 30 target', () => {
    const [calm] = cardsOf('mensajes').map(bandOf);
    expect(calm?.getAttribute('data-visual')).toBe('cost_line');
    expect(calm?.getAttribute('data-tone')).toBe('warn');
    expect(calm?.textContent).toContain('portfolio 40.53');
    expect(calm?.textContent).toContain('target 30.00');
    expect(calm?.textContent).toContain('62.65');
    expect(calm?.textContent).toContain('12 ad sets, cheapest → dearest');
    expect(calm?.querySelector('[data-testid="news-figure"]')?.textContent).toContain(
      '40.53per conversation',
    );
  });

  it('Tours: the neutral strip names what is missing in the engine’s words', () => {
    const [strip] = cardsOf('tours').map(bandOf);
    expect(strip?.getAttribute('data-visual')).toBe('strip');
    expect(strip?.querySelector('[data-testid="band-strip-label"]')?.textContent).toBe(
      '12 of 12 ad sets frozen · kpi_mismatch',
    );
    expect(strip?.textContent).toContain('155spent');
    expect(strip?.textContent).toContain('0conversations');
    expect(strip?.querySelector('[data-testid="news-figure"]')).toBeNull();
  });
});
