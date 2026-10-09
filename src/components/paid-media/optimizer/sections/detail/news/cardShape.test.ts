// The list rule, proved against the class strings that actually ship.
//
// Tailwind cannot read a template literal, so the list and the line have to be written out as
// text — and a constant that is written out twice is a constant that drifts. These tests parse
// the numbers back OUT of the class strings and check them against the numbers the rule is
// stated in, so the literal and the arithmetic cannot disagree without something going red.

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FINDING_ROW,
  FINDING_ROW_BREAKPOINT_REM,
  NEWS_LIST,
  NEWS_PANE,
  NEWS_ROW_SIZE,
} from './cardShape';

const tokens = (classes: string): string[] => classes.split(/\s+/);

describe('a finding is one line, spread by the pane’s width', () => {
  it('stacks on a phone and spreads into tag · claim · action at the tablet width', () => {
    expect(tokens(FINDING_ROW)).toContain('grid-cols-1');
    const spread = tokens(FINDING_ROW).find((token) =>
      /^@\[[0-9.]+rem\]\/news:grid-cols-/.test(token),
    );
    expect(spread).toBe(
      `@[${FINDING_ROW_BREAKPOINT_REM}rem]/news:grid-cols-[8rem_minmax(0,1fr)_auto]`,
    );
  });

  it('asks the pane, never the viewport', () => {
    expect(NEWS_PANE).toBe('@container/news');
    for (const classes of [FINDING_ROW, NEWS_LIST]) {
      expect(classes).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):/);
      for (const token of tokens(classes)) {
        if (token.startsWith('@')) expect(token).toMatch(/^@\[[0-9.]+rem\]\/news:/);
      }
    }
  });

  it('separates findings with hairlines, never frames', () => {
    expect(tokens(NEWS_LIST)).toContain('divide-y');
    for (const classes of [FINDING_ROW, NEWS_LIST]) {
      for (const frame of ['border', 'rounded-lg', 'bg-card']) {
        expect(tokens(classes)).not.toContain(frame);
      }
    }
  });

  it('shows three findings before the disclosure', () => {
    expect(NEWS_ROW_SIZE).toBe(3);
  });
});

describe('the finding components, not their callers, own the line', () => {
  const source = (file: string): string => readFileSync(join(import.meta.dir, file), 'utf8');

  it.each(['NewsCard.tsx', 'InsightCard.tsx'])('%s puts the line on its own root', (file) => {
    expect(source(file)).toContain('className={FINDING_ROW}');
  });

  it.each([
    'NewsCard.tsx',
    'InsightCard.tsx',
  ])('%s takes no className, so a caller has nothing to reshape it with', (file) => {
    expect(source(file)).not.toMatch(/className\??:\s*string/);
  });

  it('the hero mounts the list and writes no viewport grid of its own', () => {
    const hero = readFileSync(join(import.meta.dir, '..', 'PortfolioHero.tsx'), 'utf8');
    expect(hero).toContain('NEWS_LIST');
    expect(hero).toContain('NEWS_PANE');
    expect(hero).not.toMatch(/\b(sm|md|lg|xl):grid-cols/);
  });
});

describe('the band draws the evidence at one fixed height', () => {
  const band = readFileSync(join(import.meta.dir, 'CardBand.tsx'), 'utf8');

  it('sizes the band, never the drawing', () => {
    expect(band).toMatch(/className=\{cn\('[^']*\bh-36\b/);
    expect(band).toContain('preserveAspectRatio="none"');
    expect(band).toContain('viewBox="0 0 100 100"');
  });

  it.each(['NewsCard.tsx', 'InsightCard.tsx'])('%s draws it behind a disclosure', (file) => {
    const card = readFileSync(join(import.meta.dir, file), 'utf8');
    expect(card).toMatch(/<FindingEvidence|<CardBand/);
  });
});
