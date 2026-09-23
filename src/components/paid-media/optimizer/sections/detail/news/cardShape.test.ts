// The row rule, proved against the class strings that actually ship.
//
// Tailwind cannot read a template literal, so the row and the frame have to be written out as
// text — and a constant that is written out twice is a constant that drifts. These tests parse
// the numbers back OUT of the class strings and check them against the numbers the rule is
// stated in, so the literal and the arithmetic cannot disagree without something going red.

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CARD_ASPECT_BAND,
  CARD_FRAME,
  cardMinHeightCqw,
  cellWidthRem,
  JUSTIFICATION_SPLIT_REM,
  NEWS_CELL,
  NEWS_PANE,
  NEWS_ROW,
  NEWS_ROW_BREAKPOINT_REM,
  NEWS_ROW_COLUMNS,
  NEWS_ROW_SIZE,
  RECAP_BESIDE_SPAN,
} from './cardShape';

/** `@[36rem]/news:grid-cols-2` → { 36: 2 }, plus the unprefixed `grid-cols-1` under 0. */
function columnsByWidth(classes: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const token of classes.split(/\s+/)) {
    const scoped = /^@\[([0-9.]+)rem\]\/news:grid-cols-(\d+)$/.exec(token);
    if (scoped) out.set(Number(scoped[1]), Number(scoped[2]));
    const plain = /^grid-cols-(\d+)$/.exec(token);
    if (plain) out.set(0, Number(plain[1]));
  }
  return out;
}

/** The column count the row holds at a pane width, read from the classes as CSS would. */
function columnsAt(paneRem: number): number {
  const rules = [...columnsByWidth(NEWS_ROW)].sort(([a], [b]) => a - b);
  let columns = 0;
  for (const [minWidth, count] of rules) if (paneRem >= minWidth) columns = count;
  return columns;
}

describe('the row decides the column count, by the pane’s width', () => {
  it('holds one column on a phone, two on a tablet, three on a desktop', () => {
    expect(columnsAt(0)).toBe(NEWS_ROW_COLUMNS.phone);
    expect(columnsAt(NEWS_ROW_BREAKPOINT_REM.tablet - 1)).toBe(NEWS_ROW_COLUMNS.phone);
    expect(columnsAt(NEWS_ROW_BREAKPOINT_REM.tablet)).toBe(NEWS_ROW_COLUMNS.tablet);
    expect(columnsAt(NEWS_ROW_BREAKPOINT_REM.desktop - 1)).toBe(NEWS_ROW_COLUMNS.tablet);
    expect(columnsAt(NEWS_ROW_BREAKPOINT_REM.desktop)).toBe(NEWS_ROW_COLUMNS.desktop);
    expect(columnsAt(120)).toBe(NEWS_ROW_COLUMNS.desktop);
  });

  it('asks the pane, never the viewport', () => {
    expect(NEWS_PANE).toBe('@container/news');
    expect(NEWS_ROW).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):/);
    for (const token of NEWS_ROW.split(/\s+/)) {
      if (token.startsWith('@')) expect(token).toMatch(/^@\[[0-9.]+rem\]\/news:/);
    }
  });

  it('never uses auto-fit — the count is the rule, not whatever happens to fit', () => {
    expect(NEWS_ROW).not.toContain('auto-fit');
  });

  it('stretches the cells so the cards in one row share a height', () => {
    expect(NEWS_ROW).toContain('items-stretch');
    expect(CARD_FRAME).toContain('h-full');
  });

  it('shows exactly one desktop row before the disclosure', () => {
    expect(NEWS_ROW_SIZE).toBe(NEWS_ROW_COLUMNS.desktop);
  });

  it('gives the recap every column the cards left empty', () => {
    // One card: the recap takes the other one on a tablet and the other two on a desktop.
    expect(RECAP_BESIDE_SPAN[1]).toContain(
      `@[${NEWS_ROW_BREAKPOINT_REM.tablet}rem]/news:col-span-1`,
    );
    expect(RECAP_BESIDE_SPAN[1]).toContain(
      `@[${NEWS_ROW_BREAKPOINT_REM.desktop}rem]/news:col-span-2`,
    );
    // Two cards: the recap takes the last desktop column.
    expect(RECAP_BESIDE_SPAN[2]).toContain(
      `@[${NEWS_ROW_BREAKPOINT_REM.desktop}rem]/news:col-span-1`,
    );
  });
});

describe('a card fills its column and floors its own height', () => {
  it('fills the column: no cap, no fixed width', () => {
    expect(CARD_FRAME).toContain('w-full');
    expect(CARD_FRAME).not.toMatch(/(^|\s)max-w-/);
    expect(CARD_FRAME).not.toMatch(/(^|\s)w-\[/);
  });

  it('floors its height against its cell’s width, at the band’s widest ratio', () => {
    const found = /min-h-\[([0-9.]+)cqw\]/.exec(CARD_FRAME);
    expect(found).not.toBeNull();
    expect(Number(found?.[1])).toBe(cardMinHeightCqw());
    expect(100 / cardMinHeightCqw()).toBeCloseTo(CARD_ASPECT_BAND.max, 2);
    // The cell is the container the floor reads, so the floor is a real length.
    expect(NEWS_CELL).toContain('@container/news-cell');
  });
});

describe('the card components, not their callers, own the shape', () => {
  const source = (file: string): string => readFileSync(join(import.meta.dir, file), 'utf8');

  it.each(['NewsCard.tsx', 'InsightCard.tsx'])('%s puts the frame on its own root', (file) => {
    expect(source(file)).toContain('CARD_FRAME');
  });

  it.each([
    'NewsCard.tsx',
    'InsightCard.tsx',
  ])('%s takes no className, so a caller has nothing to reshape it with', (file) => {
    expect(source(file)).not.toMatch(/className\??:\s*string/);
  });

  it('the hero mounts the row and writes no viewport grid of its own', () => {
    const hero = readFileSync(join(import.meta.dir, '..', 'PortfolioHero.tsx'), 'utf8');
    expect(hero).toContain('NEWS_ROW');
    expect(hero).toContain('NEWS_PANE');
    expect(hero).not.toMatch(/\b(sm|md|lg|xl):grid-cols/);
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
    expect(code).not.toMatch(/\bsm:/);
  });

  it('never splits inside a three-column cell at the desktop threshold', () => {
    // At the width where the row first goes to three, a cell is about 18rem: a block that
    // split there would squeeze its two halves into 9rem each. It stacks until the pane is
    // wide enough for a cell to reach the split on its own.
    const cell = cellWidthRem(NEWS_ROW_BREAKPOINT_REM.desktop, NEWS_ROW_COLUMNS.desktop);
    expect(JUSTIFICATION_SPLIT_REM).toBeGreaterThan(cell);
  });
});
