import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { NextResponse } from 'next/server';

type QueryResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

class ReadQuery implements PromiseLike<QueryResult> {
  readonly selects: string[] = [];
  readonly filters: Array<[string, string]> = [];
  constructor(readonly result: QueryResult) {}
  select(columns: string) {
    this.selects.push(columns);
    return this;
  }
  eq(column: string, value: string) {
    this.filters.push([column, value]);
    return this;
  }
  order(_column: string) {
    return this;
  }
  then<TResult1 = QueryResult, TResult2 = never>(
    fulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(fulfilled, rejected);
  }
}

const brandId = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
let labels: ReadQuery;
let states: ReadQuery;
let refusal: NextResponse | null;
const requireBrandCaller = mock(
  async (_brandId: string) =>
    refusal ?? {
      supabase: {
        schema: (schema: string) => {
          expect(schema).toBe('media');
          return {
            from: (table: string) => (table === 'review_state_labels' ? labels : states),
          };
        },
      },
    },
);
mock.module('@/lib/library/libraryOperation.server', () => ({
  requireBrandCaller,
}));

const { GET } = await import('./route');

beforeEach(() => {
  requireBrandCaller.mockClear();
  labels = new ReadQuery({ data: [], error: null });
  states = new ReadQuery({ data: [], error: null });
  refusal = null;
});

describe('review label provenance', () => {
  test('old callers receive the original strict envelope', async () => {
    const response = await GET(
      new Request(`http://localhost/api/library/review/labels?brandId=${brandId}`),
    );
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(Object.keys(result).sort()).toEqual(['customStates', 'labels']);
    expect(result.labels).toHaveLength(5);
    expect(requireBrandCaller).toHaveBeenCalledWith(brandId);
    expect(labels.filters).toEqual([['brand_id', brandId]]);
    expect(states.filters).toEqual([['brand_id', brandId]]);
  });

  test('opt-in returns stored states rather than guessing from label text', async () => {
    labels = new ReadQuery({
      data: [{ state: 'approved', label: 'Approved', color: '#10B981', position: 4 }],
      error: null,
    });
    const response = await GET(
      new Request(`http://localhost/api/library/review/labels?brandId=${brandId}&includeOrigins=1`),
    );
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.customizedStates).toEqual(['approved']);
    expect(result.labels).toHaveLength(5);
    expect(result.labels.find((label: { state: string }) => label.state === 'approved').label).toBe(
      'Approved',
    );
  });

  test('a brand with no overrides gets explicit empty origins', async () => {
    const response = await GET(
      new Request(`http://localhost/api/library/review/labels?brandId=${brandId}&includeOrigins=1`),
    );
    expect((await response.json()).customizedStates).toEqual([]);
  });

  test('the existing authorization refusal still prevents reads', async () => {
    refusal = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const response = await GET(
      new Request(`http://localhost/api/library/review/labels?brandId=${brandId}&includeOrigins=1`),
    );
    expect(response.status).toBe(403);
    expect(labels.selects).toHaveLength(0);
    expect(states.selects).toHaveLength(0);
  });
});
