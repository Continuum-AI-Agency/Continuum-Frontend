/**
 * The save tolerates a `spec` column that is not there yet. Migration 20260923205040 adds
 * it and is applied separately from this code; until then PostgREST answers an insert that
 * names the column with PGRST204, and the dashboard must still save — without the spec,
 * not not at all.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';

type InsertResult = { data: unknown; error: unknown };

const inserted: Record<string, unknown>[] = [];
let responses: InsertResult[] = [];

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: '4bc1599a-e987-4d7a-aa90-acba967c6a09' } } }),
    },
    schema: () => ({
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          const result = responses.shift() ?? { data: null, error: { code: 'unexpected' } };
          return { select: () => ({ single: async () => result }) };
        },
      }),
    }),
  }),
}));

const { describeSupabaseError, isMissingSpecColumn, saveDashboard } = await import(
  './dashboards.client'
);

const MISSING_SPEC = {
  code: 'PGRST204',
  message: "Could not find the 'spec' column of 'jaina_dashboards' in the schema cache",
};

const input = {
  brand_id: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
  ad_account_id: 'act_1',
  name: 'Weekly',
  source_title: null,
  source_prompt: null,
  scope: 'account',
  window_label: '2026-09-13 → 2026-09-19',
  blocks: [{ category: 'metric_grid' as const, block_id: 'g' }],
  spec: {
    version: 1 as const,
    blocks: [
      { block_id: 'g', category: 'metric_grid' as const, spec: null, reason: 'no tool recorded' },
    ],
  },
};

const savedRow = (extra: Record<string, unknown>) => ({
  id: '2a9bf411-b6f4-46d2-914c-b5221218acbd',
  brand_id: input.brand_id,
  ad_account_id: 'act_1',
  name: 'Weekly',
  source_title: null,
  source_prompt: null,
  scope: 'account',
  window_label: input.window_label,
  blocks: input.blocks,
  created_by: null,
  created_at: '2026-09-23T00:00:00Z',
  updated_at: '2026-09-23T00:00:00Z',
  ...extra,
});

beforeEach(() => {
  inserted.length = 0;
  responses = [];
});

describe('describeSupabaseError', () => {
  test('names a missing table as the pending migration', () => {
    expect(
      describeSupabaseError({ code: 'PGRST205', message: 'Could not find the table' }),
    ).toContain('migration 20260918150000');
  });
  test('joins message, details, hint and code; never prints undefined', () => {
    expect(describeSupabaseError({ message: 'x', details: 'y', hint: null, code: '23514' })).toBe(
      'x · y · code 23514',
    );
    expect(describeSupabaseError({})).toBe('{}');
    expect(describeSupabaseError(new Error('boom'))).toBe('boom');
  });
});

describe('isMissingSpecColumn', () => {
  test('is exactly PostgREST not knowing the spec column, not any other PGRST204', () => {
    expect(isMissingSpecColumn(MISSING_SPEC)).toBe(true);
    expect(
      isMissingSpecColumn({ code: 'PGRST204', message: "Could not find the 'blocks' column" }),
    ).toBe(false);
    expect(isMissingSpecColumn({ code: '42501', message: "'spec'" })).toBe(false);
    expect(isMissingSpecColumn(null)).toBe(false);
  });
});

describe('saveDashboard', () => {
  test('sends the spec once when the column is there', async () => {
    responses = [{ data: savedRow({ spec: input.spec }), error: null }];
    const saved = await saveDashboard(input);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.spec).toEqual(input.spec);
    expect(saved.spec).toEqual(input.spec);
  });

  test('retries without the spec when the column is not applied yet, and the row still saves', async () => {
    responses = [
      { data: null, error: MISSING_SPEC },
      { data: savedRow({}), error: null },
    ];
    const saved = await saveDashboard(input);
    expect(inserted).toHaveLength(2);
    expect(inserted[0]?.spec).toEqual(input.spec);
    expect('spec' in (inserted[1] ?? {})).toBe(false);
    expect(inserted[1]?.blocks).toEqual(input.blocks);
    expect(saved.spec).toBeNull();
  });

  test('any other error fails the save with what PostgREST said', async () => {
    responses = [{ data: null, error: { code: '42501', message: 'denied' } }];
    await expect(saveDashboard(input)).rejects.toThrow('You do not have access');
    expect(inserted).toHaveLength(1);
  });
});
