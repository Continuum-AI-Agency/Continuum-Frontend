import { describe, expect, test } from 'bun:test';
import { jainaSheetsExportRequestSchema } from './jaina-export';

describe('jainaSheetsExportRequestSchema', () => {
  test('accepts bounded report tabs and rejects an empty export', () => {
    expect(
      jainaSheetsExportRequestSchema.safeParse({
        title: 'September report',
        sheets: [{ title: 'Campaigns', rows: [['Campaign', 'Spend'], ['A', 42]] }],
      }).success,
    ).toBe(true);
    expect(jainaSheetsExportRequestSchema.safeParse({ title: 'Empty', sheets: [] }).success).toBe(
      false,
    );
    expect(
      jainaSheetsExportRequestSchema.safeParse({
        title: 'Invalid',
        sheets: [
          { title: 'Results', rows: [] },
          { title: 'results', rows: [] },
        ],
      }).success,
    ).toBe(false);
    expect(
      jainaSheetsExportRequestSchema.safeParse({
        title: 'Invalid',
        sheets: [{ title: 'Results/Archive', rows: [] }],
      }).success,
    ).toBe(false);
  });
});
