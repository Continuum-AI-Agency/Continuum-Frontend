import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import { parseRows } from './parseRows';

const rowSchema = z.object({
  dimension: z.enum(['angle', 'theme']),
  winRate: z.number(),
});

const good = { dimension: 'angle', winRate: 0.5 };
const alsoGood = { dimension: 'theme', winRate: 0.25 };
// The exact production failure: the RPC starts emitting a dimension the deployed
// contract enum does not know yet.
const unknownDimension = { dimension: 'aspect_ratio', winRate: 0.9 };

describe('parseRows', () => {
  it('keeps every row when all rows are valid', () => {
    const result = parseRows(rowSchema, [good, alsoGood]);
    expect(result.rows).toEqual([good, alsoGood]);
    expect(result.dropped).toBe(0);
  });

  it('drops only the offending row and preserves the rest', () => {
    const result = parseRows(rowSchema, [good, unknownDimension, alsoGood]);
    expect(result.rows).toEqual([good, alsoGood]);
    expect(result.dropped).toBe(1);
  });

  it('reports drops so callers can surface partial reads', () => {
    const result = parseRows(rowSchema, [unknownDimension, unknownDimension]);
    expect(result.rows).toEqual([]);
    expect(result.dropped).toBe(2);
  });

  it('treats null and undefined as an empty read, not a failure', () => {
    expect(parseRows(rowSchema, null)).toEqual({ rows: [], dropped: 0 });
    expect(parseRows(rowSchema, undefined)).toEqual({ rows: [], dropped: 0 });
  });

  it('treats a non-array payload as an empty read rather than throwing', () => {
    expect(parseRows(rowSchema, { dimension: 'angle' })).toEqual({ rows: [], dropped: 0 });
    expect(parseRows(rowSchema, 'nope')).toEqual({ rows: [], dropped: 0 });
  });

  it('drops non-object entries inside an otherwise valid array', () => {
    const result = parseRows(rowSchema, [good, null, 'nope', alsoGood]);
    expect(result.rows).toEqual([good, alsoGood]);
    expect(result.dropped).toBe(2);
  });
});
