import { describe, expect, it } from 'bun:test';
import { dedupeById, pageOnTimestamp } from './feedPaging';

const row = (id: number, ts: string) => ({ id, ts });

describe('pageOnTimestamp', () => {
  it('reports a short page as the end of the feed', () => {
    const page = pageOnTimestamp([row(1, 'c'), row(2, 'b')], 5);
    expect(page.rows).toHaveLength(2);
    expect(page.nextBefore).toBeNull();
  });

  // The last row is held back and its timestamp becomes the cursor, so a strict `<` on the
  // next read starts exactly where this page stopped — no row is skipped and none repeats.
  it('holds back the trailing row and cursors on the one before it', () => {
    const page = pageOnTimestamp([row(1, 'c'), row(2, 'b'), row(3, 'a')], 3);
    expect(page.rows.map((r) => r.id)).toEqual([1, 2]);
    expect(page.nextBefore).toBe('b');
  });

  it('drops the trailing tie group so a strict `<` cursor cannot lose it', () => {
    const page = pageOnTimestamp([row(1, 'c'), row(2, 'b'), row(3, 'b')], 3);
    expect(page.rows.map((r) => r.id)).toEqual([1]);
    expect(page.nextBefore).toBe('c');
  });

  it('accepts the gap rather than returning nothing when the whole page ties', () => {
    const page = pageOnTimestamp([row(1, 'b'), row(2, 'b'), row(3, 'b')], 3);
    expect(page.rows).toHaveLength(3);
    expect(page.nextBefore).toBe('b');
  });
});

describe('dedupeById', () => {
  it('keeps the first occurrence when pages overlap', () => {
    const merged = dedupeById([
      { rows: [row(1, 'c'), row(2, 'b')] },
      { rows: [row(2, 'b'), row(3, 'a')] },
    ]);
    expect(merged.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('is empty for no pages', () => {
    expect(dedupeById([])).toEqual([]);
  });
});
