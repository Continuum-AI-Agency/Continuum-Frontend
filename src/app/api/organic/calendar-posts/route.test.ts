import { describe, expect, it } from 'bun:test';
import { fetchPublishedPostPages } from './route';

describe('fetchPublishedPostPages', () => {
  it('reads every page beyond Supabase’s default 1000 row limit', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({ id: index }));
    const secondPage = [{ id: 1000 }, { id: 1001 }];
    const ranges: Array<[number, number]> = [];
    const fetchPage = async (from: number, to: number) => {
      ranges.push([from, to]);
      return {
        data: (from === 0 ? firstPage : secondPage) as never,
        error: null,
      };
    };

    const result = await fetchPublishedPostPages(fetchPage);

    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(result.rows).toHaveLength(1002);
    expect(result.error).toBeNull();
  });

  it('stops after the first partial page and preserves query errors', async () => {
    let calls = 0;
    const result = await fetchPublishedPostPages(async () => {
      calls += 1;
      return { data: [{ id: 'one' }] as never, error: null };
    });
    expect(calls).toBe(1);
    expect(result.rows).toHaveLength(1);

    const failed = await fetchPublishedPostPages(async () => ({
      data: null,
      error: { message: 'database unavailable' },
    }));
    expect(failed).toEqual({ rows: [], error: { message: 'database unavailable' } });
  });
});
