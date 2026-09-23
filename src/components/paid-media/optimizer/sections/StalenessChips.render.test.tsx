import { afterEach, describe, expect, it } from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import { StalenessChips } from './StalenessChips';

afterEach(cleanup);

type Read = Parameters<typeof StalenessChips>[0]['portfolio'];

const legacy: Read = { adset_count: 12 };

// "Citas Agosto - check leads" as the live bench read it on 2026-09-23: 49 days since the
// last cycle, 12 of 12 ad sets gone from Meta (the absent-since stamp is a fixture value).
const citas: Read = {
  adset_count: 12,
  last_actual_cycle_at: '2026-08-05T12:00:00Z',
  stale_for_days: 49,
  roster_state: 'absent',
  roster_absent_since: '2026-08-06T12:00:00Z',
  roster_missing_count: 12,
};

const chipsOf = (portfolio: Read) => {
  const { container } = render(
    <div data-testid="host">
      <StalenessChips portfolio={portfolio} />
    </div>,
  );
  return container.querySelector('[data-testid="host"]') as HTMLElement;
};

describe('StalenessChips', () => {
  it('renders nothing for a row from the RPC before the migration', () => {
    expect(chipsOf(legacy).children).toHaveLength(0);
  });

  it('renders nothing for a fresh row after it', () => {
    const fresh: Read = {
      ...legacy,
      stale_for_days: null,
      last_actual_cycle_at: '2026-09-23T06:00:00Z',
      roster_state: 'present',
      roster_absent_since: null,
      roster_missing_count: 0,
    };
    expect(chipsOf(fresh).children).toHaveLength(0);
  });

  it('says how long since the last cycle, and that the roster is gone, in two chips', () => {
    const host = chipsOf(citas);
    const stale = host.querySelector('[data-testid="stale-chip"]');
    const roster = host.querySelector('[data-testid="roster-chip"]');
    expect(stale?.textContent).toBe('last cycle 49 days ago');
    expect(roster?.textContent).toBe('roster gone since Aug 6 · 12 of 12 ad sets');
    // The chip explains itself on hover; the words on it stay short.
    expect(stale?.getAttribute('title')).toContain('no cycle has landed');
    expect(roster?.getAttribute('title')).toContain('no longer on Meta');
  });

  it('wears only the stale chip when the roster is merely empty (0 enrolled)', () => {
    const reporte: Read = {
      adset_count: 0,
      last_actual_cycle_at: '2026-08-06T12:00:00Z',
      stale_for_days: 48,
      roster_state: 'empty',
      roster_absent_since: null,
      roster_missing_count: 0,
    };
    const host = chipsOf(reporte);
    expect(host.querySelector('[data-testid="stale-chip"]')?.textContent).toBe(
      'last cycle 48 days ago',
    );
    expect(host.querySelector('[data-testid="roster-chip"]')).toBeNull();
  });

  it('wears only a warning roster chip on a partial loss with no missed cycle', () => {
    const partial: Read = {
      ...legacy,
      stale_for_days: null,
      roster_state: 'partial',
      roster_missing_count: 3,
    };
    const host = chipsOf(partial);
    expect(host.querySelector('[data-testid="stale-chip"]')).toBeNull();
    expect(host.querySelector('[data-testid="roster-chip"]')?.textContent).toBe(
      '3 of 12 ad sets gone',
    );
  });
});
