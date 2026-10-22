import { describe, expect, it } from 'bun:test';
import type { OptimizerActionFeedRow } from '../useOptimizerData';
import {
  actionPlatform,
  actorLabel,
  minorToMajor,
  readActionChange,
  readReceiptTrace,
  revertScopeOf,
  revertState,
} from './actionRows';

const AUDIT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PORTFOLIO_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const action = (over: Partial<OptimizerActionFeedRow> = {}): OptimizerActionFeedRow =>
  ({
    id: AUDIT_ID,
    ts: '2026-08-26T09:00:00Z',
    family: 'money',
    op: 'budget',
    portfolio_id: PORTFOLIO_ID,
    portfolio_name: 'Prospecting',
    ...over,
  }) as OptimizerActionFeedRow;

describe('readActionChange reads one row shape across four unit systems', () => {
  it('reads a budget move as minor units', () => {
    const change = readActionChange(
      action({ op: 'budget', before: { minor: 500000 }, after: { minor: 450000 } }),
    );
    expect(change).toEqual({
      label: 'Daily budget',
      unit: 'money',
      before: 500000,
      after: 450000,
    });
  });

  it('tolerates the numeric-string form jsonb can produce', () => {
    expect(readActionChange(action({ before: { minor: '500000' } })).before).toBe(500000);
  });

  it('reads a status write as its Meta effective_status', () => {
    const change = readActionChange(
      action({ op: 'status', before: { status: 'ACTIVE' }, after: { status: 'PAUSED' } }),
    );
    expect(change).toEqual({ label: 'Status', unit: 'text', before: 'ACTIVE', after: 'PAUSED' });
  });

  it('names the FIELD that changed on a settings row', () => {
    const change = readActionChange(
      action({
        family: 'settings',
        op: 'setting',
        entity_id: 'daily_total',
        before: { value: '3500' },
        after: { value: '4200' },
      }),
    );
    expect(change.label).toBe('Total daily budget');
    expect(change.after).toBe('4200');
    expect(change.sentence).toBeUndefined();
  });

  it('reads a recommendation decision as its status transition', () => {
    const change = readActionChange(
      action({
        family: 'decision',
        op: 'decision',
        before: { status: 'pending' },
        after: { status: 'approved' },
      }),
    );
    expect(change).toEqual({
      label: 'Recommendation',
      unit: 'text',
      before: 'pending',
      after: 'approved',
    });
  });

  // The RPC emits 'convert' for a CBO→ABO restructure and the contract enum has not caught
  // up. Rendering it as SOMETHING is the whole point of widening `op` on the way in.
  it('still renders an op the contract enum has not caught up with', () => {
    const change = readActionChange(action({ op: 'convert' }));
    expect(change.label).toBe('convert');
    expect(change.before).toBeNull();
  });

  it('names the field even when before/after carry nothing readable', () => {
    expect(readActionChange(action({ op: 'budget', before: null, after: null })).label).toBe(
      'Daily budget',
    );
  });
});

describe('actorLabel', () => {
  it('names who authorized the write', () => {
    expect(actorLabel(action({ actor_kind: 'autopilot' }))).toBe('Autopilot');
    expect(actorLabel(action({ actor_kind: 'human' }))).toBe('Human');
    expect(actorLabel(action({ actor_kind: 'system' }))).toBe('System');
    expect(actorLabel(action({ actor_kind: null }))).toBe('Unknown');
  });
});

describe("readActionChange reads a Google write's own kinds (G4, optimizer_list_actions)", () => {
  it('prints a tCPA from micros and a tROAS as a percent', () => {
    const cpa = readActionChange(
      action({
        op: 'bid',
        before: { field: 'target_cpa_micros', value: 20_000_000 },
        after: { field: 'target_cpa_micros', value: 21_000_000 },
      }),
    );
    expect(cpa).toEqual({
      label: 'Bid target (tCPA)',
      unit: 'text',
      before: '20.00',
      after: '21.00',
    });
    const roas = readActionChange(
      action({
        op: 'bid',
        before: { field: 'target_roas', value: 3.5 },
        after: { field: 'target_roas', value: 4 },
      }),
    );
    expect(roas).toMatchObject({ label: 'Bid target (tROAS)', before: '350%', after: '400%' });
  });

  it('names the negative keywords and the keyword added, with their match type', () => {
    const negatives = readActionChange(
      action({
        op: 'negatives',
        before: { absent: [{ text: 'gym near me', matchType: 'EXACT' }] },
        after: {
          negatives: [
            { text: 'gym near me', matchType: 'EXACT' },
            { text: 'free gym', matchType: 'PHRASE' },
          ],
          scope: 'campaign',
        },
      }),
    );
    expect(negatives).toEqual({
      label: 'Negative keywords',
      unit: 'text',
      before: null,
      after: '"gym near me" (exact), "free gym" (phrase)',
    });
    const keyword = readActionChange(
      action({ op: 'keyword', after: { keyword: { text: 'gimnasio', matchType: 'PHRASE' } } }),
    );
    expect(keyword).toMatchObject({ label: 'Keyword', after: '"gimnasio" (phrase)' });
  });

  it("reads a Google status in Google's own words", () => {
    expect(
      readActionChange(
        action({ op: 'status', before: { status: 'active' }, after: { status: 'paused' } }),
      ),
    ).toMatchObject({ before: 'active', after: 'paused' });
  });
});

describe('actionPlatform', () => {
  it('reads the row platform, and Meta when it is absent or unknown', () => {
    expect(actionPlatform(action({ platform: 'google_ads' }))).toBe('google_ads');
    expect(actionPlatform(action({ platform: 'tiktok_ads' }))).toBe('tiktok_ads');
    expect(actionPlatform(action())).toBe('meta');
    expect(actionPlatform(action({ platform: 'snapchat' }))).toBe('meta');
  });
  // optimizer_list_actions sends no platform column; every Google and TikTok applier stamps
  // its receipt with one, so the receipt is where the row's platform is read from.
  it('reads the platform from the audit receipt when the row carries none', () => {
    expect(
      actionPlatform(
        action({ receipt: { platform: 'google_ads', requestId: 'g-1', resourceNames: [] } }),
      ),
    ).toBe('google_ads');
    expect(
      actionPlatform(
        action({ receipt: { platform: 'tiktok_ads', requestId: 't-1', scheduled: 'next_day' } }),
      ),
    ).toBe('tiktok_ads');
  });

  it('reads Meta for a Meta receipt and for a receipt that names no known platform', () => {
    expect(actionPlatform(action({ receipt: { fbtrace_id: 'AbC1' } }))).toBe('meta');
    expect(actionPlatform(action({ receipt: { platform: 42, requestId: 'x' } }))).toBe('meta');
    expect(actionPlatform(action({ receipt: { platform: 'snapchat' } }))).toBe('meta');
    expect(actionPlatform(action({ receipt: null }))).toBe('meta');
  });
});

describe('readReceiptTrace', () => {
  it('finds the Meta trace id whichever key the applier stored it under', () => {
    expect(readReceiptTrace(action({ receipt: { fbtrace_id: 'AbC1' } }))).toBe('AbC1');
    expect(readReceiptTrace(action({ receipt: { fbtraceId: 'AbC2' } }))).toBe('AbC2');
  });

  it('reads the receipt of each platform under its own key', () => {
    expect(
      readReceiptTrace(action({ platform: 'google_ads', receipt: { requestId: 'g-1', id: 'x' } })),
    ).toBe('g-1');
    expect(
      readReceiptTrace(action({ platform: 'tiktok_ads', receipt: { request_id: 't-1' } })),
    ).toBe('t-1');
    // A Google row never borrows Meta's fbtrace key.
    expect(
      readReceiptTrace(action({ platform: 'google_ads', receipt: { fbtrace_id: 'AbC1' } })),
    ).toBeNull();
  });

  it('reads a Google or TikTok request id when only the receipt names the platform', () => {
    expect(
      readReceiptTrace(action({ receipt: { platform: 'google_ads', requestId: 'g-2', id: 'x' } })),
    ).toBe('g-2');
    expect(
      readReceiptTrace(action({ receipt: { platform: 'tiktok_ads', requestId: 't-2' } })),
    ).toBe('t-2');
  });

  it('is null when there is no receipt', () => {
    expect(readReceiptTrace(action({ receipt: null }))).toBeNull();
    expect(readReceiptTrace(action({ receipt: { ok: true } }))).toBeNull();
  });
});

describe('revertState gates undo on the SERVER, never on the row shape', () => {
  it('offers a revert when the RPC says the write is reversible', () => {
    expect(revertState(action({ reversible: true }))).toEqual({
      kind: 'available',
      auditId: AUDIT_ID,
      portfolioId: PORTFOLIO_ID,
    });
  });

  // A write with no recorded prior value has nothing to restore; a button would lie.
  it('offers nothing when the RPC says it is not reversible', () => {
    expect(revertState(action({ reversible: false })).kind).toBe('none');
    expect(revertState(action({ reversible: null })).kind).toBe('none');
  });

  it('never offers undo on a setting or a decision', () => {
    expect(revertState(action({ family: 'settings', op: 'setting', reversible: false })).kind).toBe(
      'none',
    );
  });

  it('reports an already-undone write instead of offering the button twice', () => {
    expect(revertState(action({ reversible: true, reverted_by: 'cccccccc' })).kind).toBe(
      'reverted',
    );
  });

  it('offers nothing when there is no portfolio for the revert edge to scope against', () => {
    expect(revertState(action({ reversible: true, portfolio_id: null })).kind).toBe('none');
  });
});

describe('revertScopeOf', () => {
  it('switches the dialog to unpause copy on a status write only', () => {
    expect(revertScopeOf(action({ op: 'status' }))).toBe('adset_status');
    expect(revertScopeOf(action({ op: 'budget' }))).toBeNull();
  });
});

describe("minorToMajor divides by the currency's own minor unit (ISO 4217)", () => {
  it('two decimals for MXN and USD', () => {
    expect(minorToMajor(95_768, 'MXN')).toBe(957.68);
    expect(minorToMajor(5_341, 'usd')).toBe(53.41);
  });

  it('zero decimals for JPY, three for KWD', () => {
    expect(minorToMajor(5_000, 'JPY')).toBe(5_000);
    expect(minorToMajor(12_345, 'KWD')).toBe(12.345);
  });

  it('an unrecorded or malformed currency keeps the two-decimal reading', () => {
    expect(minorToMajor(5_341, null)).toBe(53.41);
    expect(minorToMajor(5_341, 'pesos')).toBe(53.41);
  });
});
