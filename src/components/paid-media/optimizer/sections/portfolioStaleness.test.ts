import { describe, expect, it } from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import {
  isStale,
  rosterLine,
  rosterTone,
  staleCount,
  staleLine,
  underManagement,
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
