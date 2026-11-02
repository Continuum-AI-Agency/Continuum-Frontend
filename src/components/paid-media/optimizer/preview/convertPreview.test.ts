import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AdSetSnapshot } from '@continuum/contracts';
import { metaCurrencyOffset } from '@continuum/contracts';
import type { CampaignSection } from '../picker/campaignGroups';
import {
  convertPreviewRows,
  convertPreviewTotals,
  projectAboBudgets,
  projectPostConvertSnapshots,
} from './convertPreview';

const adset = (id: string, over: Partial<CampaignSection['adsets'][number]> = {}) => ({
  id,
  name: `AdSet ${id}`,
  eligible: false,
  reason: 'Campaign holds the budget',
  currentBudget: 0,
  spend14: 140,
  events14: 7,
  cpa: 20,
  adCount: 2,
  freezeReason: 'unsupported_budget',
  ...over,
});

const section: CampaignSection = {
  campaignId: 'cmp1',
  campaignName: 'CBO Campaign',
  adsets: [adset('a1'), adset('a2', { spend14: 70, events14: 0, cpa: null })],
  eligibleCount: 0,
  totalCount: 2,
  totalBudget: 350,
  totalSpend14: 210,
  totalEvents14: 7,
  totalAds: 4,
  cpa: 30,
  mismatchCount: 0,
};

describe('convertPreviewRows', () => {
  it('joins budgets with the section rows by adset id, carrying spend context', () => {
    const rows = convertPreviewRows(section, [
      { adset_id: 'a1', adset_name: 'ignored', daily_major: 20 },
      { adset_id: 'a2', daily_major: 10 },
    ]);
    expect(rows).toEqual([
      { adsetId: 'a1', name: 'AdSet a1', spend14: 140, cpa: 20, newDailyBudget: 20 },
      { adsetId: 'a2', name: 'AdSet a2', spend14: 70, cpa: null, newDailyBudget: 10 },
    ]);
  });

  it('still previews a budget the snapshot read missed, without spend context', () => {
    const rows = convertPreviewRows(section, [
      { adset_id: 'ghost', adset_name: ' Fresh AdSet ', daily_major: 5 },
    ]);
    expect(rows).toEqual([
      { adsetId: 'ghost', name: 'Fresh AdSet', spend14: null, cpa: null, newDailyBudget: 5 },
    ]);
  });

  it('falls back to the raw id when no name exists anywhere', () => {
    const rows = convertPreviewRows(section, [{ adset_id: 'ghost', daily_major: 5 }]);
    expect(rows[0].name).toBe('ghost');
  });
});

describe('convertPreviewTotals', () => {
  it('sums the new daily budgets against the campaign-held budget', () => {
    const rows = convertPreviewRows(section, [
      { adset_id: 'a1', daily_major: 20 },
      { adset_id: 'a2', daily_major: 10.5 },
    ]);
    expect(convertPreviewTotals(section, rows)).toEqual({
      campaignBudgetToday: 350,
      newDailyTotal: 30.5,
      adsetCount: 2,
    });
  });
});

// The projection mirrors the split policy that the convert edge writes
// (supabase/functions/optimizer-convert-cbo/compute.ts). The FE cannot import that module at
// runtime (Deno-side `../_shared/*` specifiers do not survive the bundler) — that is the whole
// reason the policy is mirrored rather than shared. GOLDEN is the edge's own buildConvertBudgets
// output for every case, not hand-written: inside the monorepo, where the edge's module sits
// beside the Frontend, each case also runs through the edge and must equal the same table, so
// drift between the two still cannot merge. The standalone Frontend repo (what Vercel and its
// CI check out) has no supabase/: there the projection is held to GOLDEN, and the edge check is
// reported as skipped instead of failing the whole file on an unresolvable import.
type ConvertBudget = { adset_id: string; adset_name?: string; daily_major: number };
type BuildConvertBudgets = (
  adsets: Array<Pick<AdSetSnapshot, 'id' | 'name' | 'windows'>>,
  offset: number,
  minDailyBudgetMinor: number,
) => ConvertBudget[];

const EDGE_COMPUTE = join(
  import.meta.dir,
  '../../../../../../supabase/functions/optimizer-convert-cbo/compute.ts',
);
const edge: { buildConvertBudgets: BuildConvertBudgets } | null = existsSync(EDGE_COMPUTE)
  ? await import(EDGE_COMPUTE)
  : null;

const GOLDEN: Record<string, ConvertBudget[]> = {
  'USD, typical spread': [
    { adset_id: 'a0', adset_name: 'AdSet 0', daily_major: 100 },
    { adset_id: 'a1', adset_name: 'AdSet 1', daily_major: 50 },
    { adset_id: 'a2', adset_name: 'AdSet 2', daily_major: 13.1 },
  ],
  'zero-spend falls to the account minimum': [
    { adset_id: 'a0', adset_name: 'AdSet 0', daily_major: 1 },
  ],
  'MXN client account': [
    { adset_id: 'a0', adset_name: 'AdSet 0', daily_major: 916.05 },
    { adset_id: 'a1', adset_name: 'AdSet 1', daily_major: 50 },
    { adset_id: 'a2', adset_name: 'AdSet 2', daily_major: 50 },
  ],
  'JPY zero-decimal currency': [
    { adset_id: 'a0', adset_name: 'AdSet 0', daily_major: 10000 },
    { adset_id: 'a1', adset_name: 'AdSet 1', daily_major: 100 },
  ],
  'rounding boundary': [
    { adset_id: 'a0', adset_name: 'AdSet 0', daily_major: 1 },
    { adset_id: 'a1', adset_name: 'AdSet 1', daily_major: 1 },
    { adset_id: 'a2', adset_name: 'AdSet 2', daily_major: 0.1 },
  ],
};

const budgetsOf = (rows: ConvertBudget[]): ConvertBudget[] =>
  rows.map(({ adset_id, adset_name, daily_major }) => ({ adset_id, adset_name, daily_major }));

describe('projectAboBudgets — parity with the real convert edge', () => {
  const snap = (id: string, spend7: number, name?: string): AdSetSnapshot =>
    ({
      id,
      ...(name ? { name } : {}),
      status: 'active',
      currentBudget: 0,
      ageDays: 30,
      windows: {
        d3: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
        d7: { spend: spend7, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
        d14: { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 },
      },
      daily: [],
    }) as AdSetSnapshot;

  const cases: Array<{ label: string; currency: string; minMinor: number; spends: number[] }> = [
    { label: 'USD, typical spread', currency: 'USD', minMinor: 100, spends: [700, 350, 91.7] },
    {
      label: 'zero-spend falls to the account minimum',
      currency: 'USD',
      minMinor: 100,
      spends: [0],
    },
    { label: 'MXN client account', currency: 'MXN', minMinor: 5000, spends: [6412.33, 0, 91] },
    // JPY has offset 1, so a naive /100 would silently produce a 100x budget.
    { label: 'JPY zero-decimal currency', currency: 'JPY', minMinor: 100, spends: [70000, 0] },
    { label: 'rounding boundary', currency: 'USD', minMinor: 1, spends: [7.005, 7.004, 0.7] },
  ];

  const snapshotsOf = (spends: number[]) =>
    spends.map((spend, i) => snap(`a${i}`, spend, `AdSet ${i}`));

  for (const { label, currency, minMinor, spends } of cases) {
    it(`matches the convert edge's budgets — ${label}`, () => {
      const projected = projectAboBudgets(snapshotsOf(spends), {
        currency,
        minDailyBudgetMinor: minMinor,
      });
      expect(budgetsOf(projected)).toEqual(GOLDEN[label]);
    });
  }

  it.skipIf(edge === null)(
    "GOLDEN is the convert edge's own output (runs inside the monorepo, where supabase/ exists)",
    () => {
      for (const { label, currency, minMinor, spends } of cases) {
        const authoritative = edge?.buildConvertBudgets(
          snapshotsOf(spends).map((s) => ({ id: s.id, name: s.name, windows: s.windows })),
          metaCurrencyOffset(currency),
          minMinor,
        );
        expect(budgetsOf(authoritative ?? [])).toEqual(GOLDEN[label]);
      }
    },
  );

  it('projects a post-convert fleet the engine can score: budgeted, active, unfrozen', () => {
    const held = [snap('a0', 700), snap('a1', 0)].map((s) => ({
      ...s,
      freeze: true,
      freezeReason: 'unsupported_budget' as const,
    }));
    const fleet = projectPostConvertSnapshots(held, {
      currency: 'USD',
      minDailyBudgetMinor: 100,
    });
    expect(fleet).toHaveLength(2);
    expect(fleet.every((s) => s.freeze === undefined)).toBe(true);
    expect(fleet.every((s) => s.freezeReason === undefined)).toBe(true);
    expect(fleet.every((s) => s.status === 'active')).toBe(true);
    expect(fleet.every((s) => s.currentBudget > 0)).toBe(true);
    // 700 over 7d = 100/day; the zero-spend ad set lands on the 100-minor floor = 1.00.
    expect(fleet.map((s) => s.currentBudget)).toEqual([100, 1]);
  });
});
