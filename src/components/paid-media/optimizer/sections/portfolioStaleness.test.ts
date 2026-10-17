import { describe, expect, it } from 'bun:test';
import type { AccountEnrollment, CycleItemRow, PortfolioListItem } from '@continuum/contracts';
import {
  currentMoves,
  isStale,
  pacingStaleLine,
  rosterLine,
  rosterTone,
  staleCount,
  staleLine,
  underManagement,
  withdrawnLine,
} from './portfolioStaleness';

function portfolio(over: Partial<PortfolioListItem> & { name: string }): PortfolioListItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    ad_account_id: 'act_1',
    objective: 'lead',
    level: 'adset',
    mode: 'balanced',
    apply_mode: 'autopilot',
    daily_total: 500,
    period_budget: null,
    status: 'active',
    next_realloc_at: '2026-09-24T06:00:00Z',
    adset_count: 2,
    pending_recommendations: 0,
    ...over,
  };
}

// The three production portfolios the live bench named on 2026-09-23 (stale:portfolios:live):
// stale_for_days, last cycle, roster state and counts are the real figures; roster_absent_since
// is a fixture value, since the bench prints the state and not the stamp. Noon UTC so the
// "since" day reads the same in any test timezone.
const DANIEL = portfolio({
  name: 'Daniel Gutierrez Buendia - Todas las campañas',
  adset_count: 2,
  last_actual_cycle_at: '2026-07-23T12:00:00Z',
  stale_for_days: 61,
  roster_state: 'absent',
  roster_absent_since: '2026-07-24T12:00:00Z',
  roster_missing_count: 2,
});
const CITAS = portfolio({
  name: 'Citas Agosto - check leads',
  adset_count: 12,
  last_actual_cycle_at: '2026-08-05T12:00:00Z',
  stale_for_days: 49,
  roster_state: 'absent',
  roster_absent_since: '2026-08-06T12:00:00Z',
  roster_missing_count: 12,
});
const REPORTE = portfolio({
  name: 'Reporte Agosto - Citas y Mensajes',
  adset_count: 0,
  last_actual_cycle_at: '2026-08-06T12:00:00Z',
  stale_for_days: 48,
  roster_state: 'empty',
  roster_absent_since: null,
  roster_missing_count: 0,
});
/** A healthy row after the migration: the fields are present and say nothing is wrong. */
const FRESH = portfolio({
  name: 'MENSAJES // TODOS',
  adset_count: 12,
  last_actual_cycle_at: '2026-09-23T06:00:00Z',
  stale_for_days: null,
  roster_state: 'present',
  roster_absent_since: null,
  roster_missing_count: 0,
});
/** A row from the RPC before the migration: none of the five keys exist. */
const LEGACY = portfolio({ name: 'Prospecting', adset_count: 8 });

describe('isStale / staleLine', () => {
  it('reads nothing into a row that has no staleness fields', () => {
    expect(isStale(LEGACY)).toBe(false);
    expect(staleLine(LEGACY)).toBeNull();
  });
  it('reads a fresh row after the migration as fresh', () => {
    expect(isStale(FRESH)).toBe(false);
    expect(staleLine(FRESH)).toBeNull();
  });
  it('names the days since the last cycle on the three live shapes', () => {
    expect(staleLine(DANIEL)).toBe('last cycle 61 days ago');
    expect(staleLine(CITAS)).toBe('last cycle 49 days ago');
    expect(staleLine(REPORTE)).toBe('last cycle 48 days ago');
  });
  it('does not say "last cycle" about a portfolio that never had one', () => {
    expect(staleLine({ stale_for_days: 5, last_actual_cycle_at: null })).toBe('no cycle in 5 days');
    expect(staleLine({ stale_for_days: 1, last_actual_cycle_at: null })).toBe('no cycle in 1 day');
    expect(staleLine({ stale_for_days: 0, last_actual_cycle_at: null })).toBe('no cycle yet');
  });
  it('an hourly portfolio a few intervals late reads as missed today, not "0 days ago"', () => {
    expect(staleLine({ stale_for_days: 0, last_actual_cycle_at: '2026-09-23T01:00:00Z' })).toBe(
      'a cycle was missed today',
    );
    expect(staleLine({ stale_for_days: 1, last_actual_cycle_at: '2026-09-22T01:00:00Z' })).toBe(
      'last cycle 1 day ago',
    );
  });
});

describe('rosterLine / rosterTone', () => {
  it('says when the whole roster left Meta and how much of it', () => {
    expect(rosterLine(CITAS)).toBe('roster gone since Aug 6 · 12 of 12 ad sets');
    expect(rosterLine(DANIEL)).toBe('roster gone since Jul 24 · 2 of 2 ad sets');
    expect(rosterTone(CITAS)).toBe('danger');
  });
  it('still says the roster is gone when the stamp is missing', () => {
    expect(rosterLine({ ...CITAS, roster_absent_since: null })).toBe(
      'roster gone · 12 of 12 ad sets',
    );
    expect(rosterLine({ ...CITAS, roster_absent_since: 'not a date' })).toBe(
      'roster gone · 12 of 12 ad sets',
    );
  });
  it('counts a partial loss without a since — the read only stamps a whole absence', () => {
    expect(
      rosterLine({ ...FRESH, roster_state: 'partial', roster_missing_count: 3, adset_count: 12 }),
    ).toBe('3 of 12 ad sets gone');
    expect(
      rosterLine({ ...FRESH, roster_state: 'partial', roster_missing_count: 1, adset_count: 1 }),
    ).toBe('1 of 1 ad set gone');
    expect(rosterTone({ roster_state: 'partial' })).toBe('warning');
  });
  it('says nothing for a present, empty, unknown or absent-key roster', () => {
    expect(rosterLine(FRESH)).toBeNull();
    expect(rosterLine(REPORTE)).toBeNull();
    expect(rosterLine(LEGACY)).toBeNull();
    expect(rosterLine({ ...FRESH, roster_state: null })).toBeNull();
    expect(rosterTone(FRESH)).toBeNull();
    expect(rosterTone(LEGACY)).toBeNull();
  });
});

describe('underManagement', () => {
  it('subtracts every ad set the rosters have lost from the enrolled total', () => {
    // 2 + 12 + 0 + 12 + 8 enrolled; 2 + 12 gone.
    expect(underManagement([DANIEL, CITAS, REPORTE, FRESH, LEGACY])).toEqual({
      enrolled: 34,
      managed: 20,
      gone: 14,
    });
  });
  it('counts a row without the field exactly as before', () => {
    expect(underManagement([LEGACY, FRESH])).toEqual({ enrolled: 20, managed: 20, gone: 0 });
    expect(underManagement([])).toEqual({ enrolled: 0, managed: 0, gone: 0 });
  });
  it('never manages a negative number of ad sets', () => {
    expect(underManagement([{ adset_count: 2, roster_missing_count: 5 }])).toEqual({
      enrolled: 2,
      managed: 0,
      gone: 2,
    });
  });
});

describe('staleCount', () => {
  it('counts the rows that missed a cycle, ignoring rows without the read', () => {
    expect(staleCount([DANIEL, CITAS, REPORTE, FRESH, LEGACY])).toBe(3);
    expect(staleCount([FRESH, LEGACY])).toBe(0);
  });
});

// The ledger's figures (PP-L3-pacing-period-budget-two-sources-disagree): the run paced the
// original October plan, the row was rebased on the 8th.
describe('pacingStaleLine', () => {
  const rebased = { period_start: '2026-10-08', period_end: '2026-10-31', period_budget: 26101 };
  const original = { period_start: '2026-10-01', period_end: '2026-10-31', period_budget: 45000 };
  const stamp = { source: 'pacing', planVersion: '2026-10-01..2026-10-31@45000' };

  it('reads stale beside the rebased row, naming both plans', () => {
    const line = pacingStaleLine(stamp, rebased);
    expect(line?.text).toBe('pacing stale');
    expect(line?.title).toContain('Oct 1–Oct 31 at 45,000');
    expect(line?.title).toContain('Oct 8–Oct 31 at 26,101');
  });

  it('says nothing beside the plan it paced', () => {
    expect(pacingStaleLine(stamp, original)).toBeNull();
  });

  it('says nothing for a run from before the stamp, or a flat observed/fixed total', () => {
    expect(pacingStaleLine({ source: 'pacing' }, rebased)).toBeNull();
    expect(pacingStaleLine({ source: 'observed', planVersion: 'x' }, rebased)).toBeNull();
    expect(pacingStaleLine(null, rebased)).toBeNull();
    expect(pacingStaleLine(undefined, rebased)).toBeNull();
  });

  it('reads stale when the row lost its flight since the run, and says so', () => {
    const line = pacingStaleLine(stamp, {
      period_start: null,
      period_end: null,
      period_budget: null,
    });
    expect(line?.text).toBe('pacing stale');
    expect(line?.title).toContain('no complete flight');
  });
});

describe('withdrawnLine / currentMoves', () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  const AT = '2026-10-12T12:00:00Z';
  const move = (adset_id: string, platform?: string): CycleItemRow =>
    ({ adset_id, current_budget: 100, final_budget: 120, change_abs: 20, platform }) as CycleItemRow;
  const items = [move('a'), move('b'), move('g', 'google_ads')];

  it('says the proposal is withdrawn, with its day and the reason in words', () => {
    const at = { last_cycle_current: false, last_actual_cycle_at: AT } as const;
    expect(withdrawnLine({ ...at, withdrawn_reason: 'no_members' })).toBe(
      'Last proposal, Oct 12 — withdrawn: nothing is enrolled any more',
    );
    expect(withdrawnLine({ ...at, withdrawn_reason: 'roster_absent' })).toBe(
      'Last proposal, Oct 12 — withdrawn: its whole roster has left the ad account',
    );
    expect(withdrawnLine({ ...at, withdrawn_reason: 'missed_cycles' })).toBe(
      'Last proposal, Oct 12 — withdrawn: no cycle has run since',
    );
  });

  it('says nothing while current, before a first cycle, or on a read without the field', () => {
    expect(withdrawnLine({ last_cycle_current: true, last_actual_cycle_at: AT })).toBeNull();
    expect(withdrawnLine({ last_cycle_current: false, last_actual_cycle_at: null })).toBeNull();
    expect(withdrawnLine({ last_actual_cycle_at: AT })).toBeNull();
  });

  it('a withdrawn cycle leaves no move to act on', () => {
    const split = currentMoves(
      items,
      { id: ID, last_cycle_current: false, withdrawn_reason: 'missed_cycles', last_actual_cycle_at: AT },
      new Set(['a', 'b']),
    );
    expect(split.line).toContain('withdrawn');
    expect(split.current).toEqual([]);
  });

  it('withdraws a Meta move whose ad set left the roster, naming the holder when it can', () => {
    const holders = [
      { adset_id: 'b', portfolio_id: '99999999-9999-4999-8999-999999999999', portfolio_name: 'Conversaciones Whatsapp' },
    ] as AccountEnrollment[];
    const portfolio = { id: ID, last_cycle_current: true, last_actual_cycle_at: AT };
    const named = currentMoves(items, portfolio, new Set(['a']), holders);
    expect(named.line).toBeNull();
    expect(named.notes.get('b')).toBe('now in Conversaciones Whatsapp');
    // A Google move is never judged against the Meta-only roster read.
    expect(named.current.map((item) => item.adset_id)).toEqual(['a', 'g']);
    expect(currentMoves(items, portfolio, new Set(['a'])).notes.get('b')).toBe(
      'no longer in this portfolio',
    );
  });

  it('withdraws every move the database voided, so no raise is offered without its cut', () => {
    const voided = (adset_id: string, apply_error: string): CycleItemRow =>
      ({ ...move(adset_id), apply_status: 'skipped', apply_error }) as CycleItemRow;
    const run = [
      voided('a', 'voided: adset_moved'),
      voided('b', 'voided: roster_changed'),
      move('c'),
      voided('d', 'already at target'),
    ];
    const split = currentMoves(run, { id: ID, last_cycle_current: true }, null);
    expect(split.notes.get('a')).toBe('its ad set moved to another portfolio');
    expect(split.notes.get('b')).toBe("this portfolio's ad sets changed since it was proposed");
    // An apply's own no-op skip is not a withdrawal: it gets no "Withdrawn" label.
    expect(split.notes.has('d')).toBe(false);
    expect(split.current.map((item) => item.adset_id)).toEqual(['c', 'd']);
  });

  it('withdraws nothing while the roster is unknown', () => {
    const split = currentMoves(items, { id: ID, last_cycle_current: true }, null);
    expect(split.notes.size).toBe(0);
    expect(split.current).toBe(items);
  });
});
