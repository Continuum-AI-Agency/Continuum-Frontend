import { describe, expect, it } from 'bun:test';
import type { CycleItemRow, ParsedCycleRunReport } from '@continuum/contracts';
import { itemWritable, platformWritable, proposalsOnlyNote } from './platformWrites';
import { buildActionQueue } from './sections/OptimizerActionsPortfolioGroup';

// b9cebbcf ("Leads // Google Ads only", Easy Fit): once G5 reads Google's start dates its cycle
// proposes moves between Google campaigns, while its Google writes stay switched off.
const googleOff = { platform_writes: { google_ads: false } };
const move = (adset_id: string, platform: string | null, change_abs: number): CycleItemRow =>
  ({
    adset_id,
    current_budget: 350,
    final_budget: 350 + change_abs,
    change_abs,
    apply_status: null,
    ...(platform ? { platform } : {}),
  }) as unknown as CycleItemRow;

describe('platformWritable — the list says whether the Optimizer may write a platform here', () => {
  it('Meta writes unless its row is switched off; any other platform only when switched on', () => {
    expect(platformWritable({ platform_writes: {} }, 'meta')).toBe(true);
    expect(platformWritable({ platform_writes: {} }, null)).toBe(true);
    expect(platformWritable({ platform_writes: { meta: false } }, 'meta')).toBe(false);
    expect(platformWritable({ platform_writes: {} }, 'google_ads')).toBe(false);
    expect(platformWritable(googleOff, 'google_ads')).toBe(false);
    expect(platformWritable({ platform_writes: { google_ads: true } }, 'google_ads')).toBe(true);
  });

  it("reads a cycle item's platform from its row, Meta when it names none", () => {
    expect(itemWritable(googleOff, move('24321097869', 'google_ads', -5.25))).toBe(false);
    expect(itemWritable(googleOff, move('120200000001', null, 5))).toBe(true);
  });
});

describe('the queue never offers a move nobody may write', () => {
  const items = [
    move('24321097869', 'google_ads', -5.25),
    move('24321868026', 'google_ads', 5.25),
    move('120200000001', 'meta', 10),
  ];
  const report = { latest_items: items, recommendations: [] } as unknown as ParsedCycleRunReport;

  it('Google moves with Google writes off are left out; the Meta move stays an Approve row', () => {
    const rows = buildActionQueue(report, null, [], (item) => itemWritable(googleOff, item));
    expect(rows.map((row) => row.key)).toEqual(['budget:120200000001']);
    expect(buildActionQueue(report, null, []).length).toBe(3);
  });

  it('says why, once, in a sentence a person can act on', () => {
    expect(proposalsOnlyNote(googleOff, items)).toBe(
      '2 budget moves on Google Ads are proposals only — writes to Google Ads are switched off for this portfolio.',
    );
    expect(proposalsOnlyNote({ platform_writes: { google_ads: true } }, items)).toBeNull();
  });
});
