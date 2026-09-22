// The shape rule, proved against the class strings that actually ship.
//
// Tailwind cannot read a template literal, so the frame has to be written out as text — and a
// constant that is written out twice is a constant that drifts. These tests parse the rem
// values back OUT of the class strings and check them against the numbers the rule is stated
// in, so the literal and the arithmetic cannot disagree without something going red.

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CARD_ASPECT_BAND,
  CARD_FRAME,
  CARD_MAX_WIDTH_REM,
  cardMinHeightRem,
  INSIGHT_TRACK,
  JUSTIFICATION_SPLIT_REM,
  type NewsCardRole,
} from './cardShape';

const ROLES: NewsCardRole[] = ['lead', 'insight'];

/** `max-w-[34rem]` → 34. */
const remIn = (classes: string, utility: string): number | null => {
  const found = new RegExp(`${utility}-\\[([0-9.]+)rem\\]`).exec(classes);
  return found ? Number(found[1]) : null;
};

describe('a card carries its own box', () => {
  it.each(ROLES)('%s declares both a cap and a floor', (role) => {
    expect(remIn(CARD_FRAME[role], 'max-w')).toBe(CARD_MAX_WIDTH_REM[role]);
    expect(remIn(CARD_FRAME[role], 'min-h')).toBe(cardMinHeightRem(role));
  });

  it.each(ROLES)('%s at its full width sits inside the aspect band', (role) => {
    const width = remIn(CARD_FRAME[role], 'max-w') as number;
    const height = remIn(CARD_FRAME[role], 'min-h') as number;
    expect(width / height).toBeLessThanOrEqual(CARD_ASPECT_BAND.max);
    expect(width / height).toBeGreaterThanOrEqual(CARD_ASPECT_BAND.min);
  });

  it.each(ROLES)('%s holds at phone width — it fills, it does not overflow', (role) => {
    expect(CARD_FRAME[role]).toContain('w-full');
    // 400px is 25rem. Both caps must be reachable by a phone without a horizontal scroll,
    // which `w-full` guarantees only because the cap is a MAX and never a fixed width.
    expect(CARD_FRAME[role]).not.toMatch(/(^|\s)w-\[/);
  });

  it('an insight can never be as wide as the lead', () => {
    expect(CARD_MAX_WIDTH_REM.insight).toBeLessThan(CARD_MAX_WIDTH_REM.lead);
  });
});

describe('the track cannot stretch a card', () => {
  it('caps every column at exactly one insight width', () => {
    expect(INSIGHT_TRACK).toContain(`minmax(15rem,${CARD_MAX_WIDTH_REM.insight}rem)`);
  });

  it('pushes the leftover into the gutter, not into the tracks', () => {
    expect(INSIGHT_TRACK).toContain('justify-start');
  });

  it('lets the column count follow the room, never a hard-coded two', () => {
    expect(INSIGHT_TRACK).toContain('auto-fit');
    expect(INSIGHT_TRACK).not.toMatch(/grid-cols-\d/);
  });
});

describe('the card components, not their callers, own the shape', () => {
  const source = (file: string): string => readFileSync(join(import.meta.dir, file), 'utf8');

  it.each([
    ['NewsCard.tsx', 'CARD_FRAME.lead'],
    ['InsightCard.tsx', 'CARD_FRAME.insight'],
  ])('%s puts the frame on its own root', (file, frame) => {
    expect(source(file)).toContain(frame);
  });

  it.each([
    'NewsCard.tsx',
    'InsightCard.tsx',
  ])('%s takes no className, so a caller has nothing to widen it with', (file) => {
    expect(source(file)).not.toMatch(/className\??:\s*string/);
  });

  it('the hero mounts the track it is given and writes no grid of its own', () => {
    const hero = readFileSync(join(import.meta.dir, '..', 'PortfolioHero.tsx'), 'utf8');
    expect(hero).toContain('INSIGHT_TRACK');
    expect(hero).not.toContain('sm:grid-cols-2');
  });
});

describe('the justification angles are container queries', () => {
  const block = readFileSync(join(import.meta.dir, 'JustificationBlock.tsx'), 'utf8');
  /** Comment lines say the word `sm:` to explain why it is gone; code may not use it. */
  const code = block
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

  it('splits on the block’s own width, at the declared rem', () => {
    expect(block).toContain('@container/news-just');
    expect(block).toContain(`@[${JUSTIFICATION_SPLIT_REM}rem]/news-just:`);
  });

  it('asks nothing about the viewport', () => {
    // `sm:` is a viewport query. An insight card is narrower than `sm` and still matched it,
    // which is how a 312px block ended up laid out in two columns.
    expect(code).not.toMatch(/\bsm:/);
  });

  it('splits only above an insight’s own width, so an insight always stacks', () => {
    expect(JUSTIFICATION_SPLIT_REM).toBeGreaterThan(CARD_MAX_WIDTH_REM.insight);
    expect(JUSTIFICATION_SPLIT_REM).toBeLessThan(CARD_MAX_WIDTH_REM.lead);
  });
});
