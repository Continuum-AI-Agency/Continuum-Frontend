import { describe, expect, it } from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import {
  autonomyCaps,
  autonomyErrorText,
  levelCounts,
  levelOf,
  patchForLevel,
  readAutonomy,
  showsScope,
} from './autonomyModel';

type Row = Parameters<typeof readAutonomy>[0];

const row = (over: Partial<PortfolioListItem> = {}): Row => ({
  apply_mode: 'recommend',
  autopilot_paused: false,
  platforms: ['meta'],
  platform_writes: {},
  max_change_pct_per_cycle: null,
  max_daily_apply_minor: null,
  velocity_cap_pct: null,
  currency: 'MXN',
  last_cycle_current: true,
  withdrawn_reason: null,
  stale_for_days: null,
  last_actual_cycle_at: null,
  ...over,
});

// Easy Fit's Conversaciones Whatsapp, as optimizer_list_portfolios returned it on Oct 31.
const ARMED = { max_change_pct_per_cycle: 0.2, max_daily_apply_minor: 130_000 };

describe('levelOf', () => {
  it('reads Observe and Autopilot from the apply mode, and Recommend or Approve from the writes', () => {
    expect(levelOf('observe', true)).toBe('observe');
    expect(levelOf('autopilot', false)).toBe('autopilot');
    expect(levelOf('recommend', true)).toBe('approve');
    expect(levelOf('recommend', false)).toBe('recommend');
    expect(levelOf('something-new', true)).toBe('approve');
  });

  it('stores Recommend and Approve as the one apply mode they share', () => {
    expect(patchForLevel('recommend')).toEqual({ apply_mode: 'recommend' });
    expect(patchForLevel('approve')).toEqual({ apply_mode: 'recommend' });
    expect(patchForLevel('observe')).toEqual({ apply_mode: 'observe' });
    expect(patchForLevel('autopilot')).toEqual({ apply_mode: 'autopilot' });
  });
});

describe('readAutonomy — locks', () => {
  it('lets a Meta portfolio with both caps reach every level but Recommend', () => {
    const read = readAutonomy(row(ARMED));
    expect(read.level).toBe('approve');
    expect(Object.keys(read.locks)).toEqual(['recommend']);
    expect(read.locks.recommend).toBe(
      'Continuum may write Meta here, so a change you approve is written: that is Approve. Observe writes nothing.',
    );
    // Approve, above it, is open, so Recommend stands in no one's way.
    expect(read.blockers).toEqual([]);
  });

  it('holds a portfolio whose writes are switched off on Recommend', () => {
    const read = readAutonomy(row({ ...ARMED, platforms: ['google_ads'] }));
    expect(read.level).toBe('recommend');
    expect(read.canWrite).toBe(false);
    expect(read.locks.approve).toBe(
      'Writes to Google are switched off for this portfolio, so Continuum only recommends.',
    );
    expect(read.locks.autopilot).toBe(read.locks.approve);
    expect(read.locks.recommend).toBeUndefined();
  });

  it('writes Google once its writes are switched on for the portfolio', () => {
    const read = readAutonomy(
      row({ ...ARMED, platforms: ['google_ads'], platform_writes: { google_ads: true } }),
    );
    expect(read.level).toBe('approve');
    expect(read.locks.autopilot).toBeUndefined();
  });

  it('locks Autopilot until both caps the database requires are set', () => {
    const read = readAutonomy(row({ max_change_pct_per_cycle: 0.2 }));
    expect(read.capsReady).toBe(false);
    expect(read.locks.autopilot).toContain('Needs both caps first');
  });

  it('locks Autopilot on a withdrawn roster, but not on a missed cycle alone', () => {
    expect(
      readAutonomy(row({ ...ARMED, last_cycle_current: false, withdrawn_reason: 'no_members' }))
        .locks.autopilot,
    ).toBe('Withdrawn: nothing is enrolled any more.');
    expect(
      readAutonomy(row({ ...ARMED, last_cycle_current: false, withdrawn_reason: 'missed_cycles' }))
        .locks.autopilot,
    ).toBeUndefined();
  });

  it('never locks the level the portfolio is on', () => {
    const read = readAutonomy(row({ apply_mode: 'autopilot', platforms: ['google_ads'] }));
    expect(read.level).toBe('autopilot');
    expect(read.locks.autopilot).toBeUndefined();
    expect(read.notes).toContain(
      'Autopilot writes nothing here: writes to Google are switched off.',
    );
  });
});

describe('readAutonomy — notes', () => {
  it('says autopilot is stopped, and what a withdrawn autopilot has left to move', () => {
    const read = readAutonomy(
      row({
        ...ARMED,
        apply_mode: 'autopilot',
        autopilot_paused: true,
        last_cycle_current: false,
        withdrawn_reason: 'roster_absent',
        stale_for_days: 17,
        last_actual_cycle_at: '2026-10-15T06:00:00Z',
      }),
    );
    expect(read.stopped).toBe(true);
    expect(read.notes).toEqual([
      'Stopped by a person: no autonomous write until it is resumed.',
      'Autopilot has nothing to move: its whole roster has left the ad account.',
      'Stale: last cycle 17 days ago.',
    ]);
  });

  it('says which platform of a mixed portfolio only proposes', () => {
    const read = readAutonomy(row({ ...ARMED, platforms: ['meta', 'google_ads'] }));
    expect(read.level).toBe('approve');
    expect(read.notes).toEqual([
      'Writes to Google are switched off here: its changes stay proposals.',
    ]);
  });
});

describe('autonomyCaps', () => {
  it('prints the caps through the form’s own units', () => {
    expect(autonomyCaps(row({ ...ARMED, velocity_cap_pct: 0.3 })).map((cap) => cap.label)).toEqual([
      'Max 20% per cycle',
      'Max $1,300 MXN/day',
      'Max 30% per ad set',
      'New objects created PAUSED',
    ]);
  });

  it('marks a cap autopilot needs and the portfolio lacks', () => {
    const caps = autonomyCaps(row({ max_daily_apply_minor: 0 }));
    expect(caps.filter((cap) => cap.missing).map((cap) => cap.key)).toEqual(['per-cycle', 'daily']);
  });

  it('prints a daily cap bare when the portfolio records no currency', () => {
    const daily = autonomyCaps(row({ ...ARMED, currency: null })).find(
      (cap) => cap.key === 'daily',
    );
    expect(daily?.label).toBe('Max 1,300/day');
  });
});

describe('levelCounts and scopes', () => {
  it('counts how many portfolios sit on each level', () => {
    expect(
      levelCounts([
        row({ apply_mode: 'observe' }),
        row(),
        row({ platforms: ['google_ads'] }),
        row({ apply_mode: 'autopilot' }),
        row({ apply_mode: 'autopilot' }),
      ]),
    ).toEqual({ observe: 1, recommend: 1, approve: 1, autopilot: 2 });
  });

  it('offers the move between platforms only across two of them', () => {
    expect(showsScope('budget_move', ['meta'])).toBe(false);
    expect(showsScope('budget_move', ['meta', 'google_ads'])).toBe(true);
    expect(showsScope('budget', ['meta'])).toBe(true);
  });
});

describe('autonomyErrorText', () => {
  it('names the caps when the database refuses autopilot, and keeps any other refusal’s words', () => {
    const refused = Object.assign(new Error('Could not update the portfolio.'), { code: '23514' });
    expect(autonomyErrorText(refused, 'autopilot')).toBe(
      'The database refused autopilot: it needs both caps above 0. Nothing was changed.',
    );
    expect(autonomyErrorText(refused, 'observe')).toBe(
      'Could not update the portfolio. Nothing was changed.',
    );
    expect(autonomyErrorText('offline', null)).toBe('The write failed. Nothing was changed.');
  });
});
