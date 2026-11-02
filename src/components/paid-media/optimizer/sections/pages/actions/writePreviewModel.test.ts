import { describe, expect, it } from 'bun:test';
import {
  autopilotNextRun,
  budgetWriteState,
  guardrailChecks,
  netDelta,
  runWhenWords,
  writeBars,
} from './writePreviewModel';

// The two budgets of Easy Fit's "Leads // Google Ads only" move (G12's example), and the
// guardrails "Conversaciones Whatsapp" runs autopilot under: 20% per cycle, 1,300 MXN a day.
const PMAX = {
  key: 'budget:pmax',
  entityId: '22357506300',
  name: 'PMax | Octubre | Easy Fit | Leads',
};
const SEARCH = {
  key: 'budget:search',
  entityId: '22357506301',
  name: 'Search | Octubre | Easy Fit',
};

describe('writeBars', () => {
  it('draws both sides on one scale, biggest change first, with the change in money and percent', () => {
    const bars = writeBars([
      { key: 'budget:display', entityId: '1', name: 'Display', before: 100, after: 110 },
      { ...PMAX, before: 320, after: 400 },
      { ...SEARCH, before: 350, after: 270 },
    ]);
    expect(bars.map((bar) => [bar.name, bar.delta, bar.deltaPct, bar.direction])).toEqual([
      ['PMax | Octubre | Easy Fit | Leads', 80, 25, 'up'],
      ['Search | Octubre | Easy Fit', -80, -23, 'down'],
      ['Display', 10, 10, 'up'],
    ]);
    // 400 is the largest figure drawn: it is the full bar, and everything else is read off it.
    expect(bars[0]?.afterPct).toBe(100);
    expect(bars[0]?.beforePct).toBe(80);
    expect(bars[1]?.beforePct).toBe(87.5);
    expect(bars[1]?.afterPct).toBe(67.5);
    expect(netDelta(bars)).toBe(10);
  });

  it('leaves out a move missing a side rather than drawing a guessed one', () => {
    const bars = writeBars([
      { ...PMAX, before: null, after: 400 },
      { ...SEARCH, before: 350, after: 350 },
    ]);
    expect(bars).toHaveLength(1);
    expect(bars[0]?.direction).toBe('flat');
    expect(bars[0]?.deltaPct).toBe(0);
  });

  it('names an unnamed entity by its id and gives a move from zero no percentage', () => {
    const [bar] = writeBars([{ key: 'k', entityId: 'as-1', name: '  ', before: 0, after: 50 }]);
    expect(bar?.name).toBe('as-1');
    expect(bar?.deltaPct).toBeNull();
    expect(bar?.beforePct).toBe(0);
  });
});

const portfolio = (over: Record<string, unknown> = {}) => ({
  apply_mode: 'autopilot',
  max_change_pct_per_cycle: 0.2,
  max_daily_apply_minor: 130_000,
  daily_total: 1_180,
  ...over,
});

describe('guardrailChecks', () => {
  it('passes the four checks of a move inside both caps', () => {
    const checks = guardrailChecks({
      portfolio: portfolio(),
      moves: [{ change_pct: 0.19 }, { change_pct: -0.17 }],
      currency: 'MXN',
    });
    expect(checks.map((check) => [check.id, check.state, check.label])).toEqual([
      ['max_change', 'pass', 'Max 20% per cycle'],
      ['daily_cap', 'pass', 'Max $1,300 MXN/day applied'],
      ['created_paused', 'pass', 'New objects are created PAUSED'],
      ['undo', 'pass', 'Undo the same day'],
    ]);
    expect(checks[1]?.detail).toBe('The daily total, $1,180 MXN, is inside it');
  });

  it('says how many moves are above the cap and that a person decides them', () => {
    const [cap] = guardrailChecks({
      portfolio: portfolio(),
      moves: [{ change_pct: 0.3 }, { change_pct: -0.25 }, { change_pct: 0.1 }],
      currency: 'MXN',
    });
    expect(cap).toMatchObject({
      state: 'wait',
      detail: '2 moves are above it and wait for a person',
    });
    const [recommend] = guardrailChecks({
      portfolio: portfolio({ apply_mode: 'recommend' }),
      moves: [{ change_pct: 0.3 }],
      currency: 'MXN',
    });
    expect(recommend?.detail).toBe('1 move is above it: autopilot would hold it too');
  });

  it('fails the daily cap when the daily total is above it: the service writes nothing', () => {
    const [, daily] = guardrailChecks({
      portfolio: portfolio({ daily_total: 1_500 }),
      moves: [{ change_pct: 0.1 }],
      currency: 'MXN',
    });
    expect(daily).toMatchObject({
      state: 'fail',
      detail: 'The daily total, $1,500 MXN, is above it: nothing is written',
    });
  });

  it('says a cap that is not set is not set — a failure for autopilot, never a pass', () => {
    const unset = { max_change_pct_per_cycle: null, max_daily_apply_minor: null };
    const auto = guardrailChecks({ portfolio: portfolio(unset), moves: [], currency: 'MXN' });
    expect(auto.slice(0, 2).map((check) => [check.label, check.state])).toEqual([
      ['No cap per cycle', 'fail'],
      ['No daily cap', 'fail'],
    ]);
    const recommend = guardrailChecks({
      portfolio: portfolio({ ...unset, apply_mode: 'recommend' }),
      moves: [],
      currency: 'MXN',
    });
    expect(recommend.slice(0, 2).map((check) => check.state)).toEqual(['off', 'off']);
  });

  it('reads the cap in the currency minor unit, never a hard-coded hundred', () => {
    const [, daily] = guardrailChecks({
      portfolio: portfolio({ max_daily_apply_minor: 5_000, daily_total: 4_000 }),
      moves: [],
      currency: 'JPY',
    });
    expect(daily?.label).toBe('Max ¥5,000 JPY/day applied');
  });
});

describe('budgetWriteState', () => {
  it('asks for approval while any move waits on a person, naming only those', () => {
    expect(
      budgetWriteState([
        { key: 'budget:a', approved: false },
        { key: 'budget:b', approved: true },
      ]),
    ).toEqual({ kind: 'approve', keys: ['budget:a'], approved: 1 });
  });

  it('is queued once every move is approved and only its write is left', () => {
    expect(budgetWriteState([{ key: 'budget:a', approved: true }])).toEqual({
      kind: 'queued',
      count: 1,
    });
    expect(budgetWriteState([])).toEqual({ kind: 'none' });
  });
});

describe('autopilotNextRun', () => {
  const armed = {
    apply_mode: 'autopilot',
    autopilot_paused: false,
    autopilot_scopes: {
      budget: true,
      creative_swap: false,
      audience_change: false,
      new_audience: false,
      new_creatives: false,
    },
    next_realloc_at: '2026-11-03T06:00:00Z',
    stale_for_days: null,
    level: 'adset',
    platforms: ['meta'],
  };
  const PASS = [{ state: 'pass' as const }];

  it('is the next cycle for an armed autopilot on Meta ad sets', () => {
    expect(autopilotNextRun(armed, PASS)).toEqual({
      at: '2026-11-03T06:00:00Z',
      othersWait: false,
    });
  });

  it('says the moves on another platform still wait for a person', () => {
    expect(autopilotNextRun({ ...armed, platforms: ['meta', 'google_ads'] }, PASS)).toEqual({
      at: '2026-11-03T06:00:00Z',
      othersWait: true,
    });
  });

  it('is nothing when autopilot will not write on its own', () => {
    expect(autopilotNextRun({ ...armed, apply_mode: 'recommend' }, PASS)).toBeNull();
    expect(autopilotNextRun({ ...armed, autopilot_paused: true }, PASS)).toBeNull();
    expect(
      autopilotNextRun(
        { ...armed, autopilot_scopes: { ...armed.autopilot_scopes, budget: false } },
        PASS,
      ),
    ).toBeNull();
    // The service reads an unset scope as off.
    expect(autopilotNextRun({ ...armed, autopilot_scopes: undefined }, PASS)).toBeNull();
    expect(autopilotNextRun({ ...armed, stale_for_days: 12 }, PASS)).toBeNull();
    expect(autopilotNextRun({ ...armed, next_realloc_at: null }, PASS)).toBeNull();
  });

  it('is nothing where autopilot only proposes: Google, and a Meta campaign-level portfolio', () => {
    expect(autopilotNextRun({ ...armed, platforms: ['google_ads'] }, PASS)).toBeNull();
    expect(autopilotNextRun({ ...armed, level: 'campaign' }, PASS)).toBeNull();
  });

  it('is nothing while a guardrail fails: the service writes nothing then', () => {
    expect(autopilotNextRun(armed, [{ state: 'pass' }, { state: 'fail' }])).toBeNull();
  });
});

describe('runWhenWords', () => {
  const now = new Date('2026-11-02T15:00:00Z');

  it('says tonight for a run inside a day between 18:00 and 06:00', () => {
    expect(runWhenWords('2026-11-03T02:00:00Z', now, 'UTC')).toBe('tonight');
    expect(runWhenWords('2026-11-02T20:00:00Z', now, 'UTC')).toBe('tonight');
  });

  it('says today, tomorrow or the date otherwise', () => {
    expect(runWhenWords('2026-11-02T17:00:00Z', now, 'UTC')).toBe('today');
    expect(runWhenWords('2026-11-03T12:00:00Z', now, 'UTC')).toBe('tomorrow');
    expect(runWhenWords('2026-11-05T06:00:00Z', now, 'UTC')).toBe('on Nov 5');
    expect(runWhenWords('2026-11-02T14:00:00Z', now, 'UTC')).toBe('shortly');
  });

  it('reads the day in the given time zone', () => {
    // 06:00 UTC is midnight in Mexico City: tonight there.
    expect(runWhenWords('2026-11-03T06:00:00Z', now, 'America/Mexico_City')).toBe('tonight');
  });
});
