import { describe, expect, it } from 'bun:test';
import type { OptimizerLogRow } from '@continuum/contracts';
import {
  ALL_PORTFOLIOS,
  classifyEvent,
  distinctPortfolioNames,
  familyCounts,
  filterLogs,
  matchesFamily,
  readMoneyMove,
  readSettingChange,
} from './logFilters';

function row(overrides: Partial<OptimizerLogRow>): OptimizerLogRow {
  return {
    id: 1,
    portfolio_id: '11111111-1111-4111-8111-111111111111',
    portfolio_name: 'Prospecting',
    ts: '2026-07-19T00:00:00.000Z',
    level: 'info',
    event: 'cycle_complete',
    fields: {},
    ...overrides,
  };
}

describe('classifyEvent', () => {
  it('routes every apply_* write into the money family', () => {
    expect(classifyEvent('apply_executed')).toBe('money');
    expect(classifyEvent('apply_deduped')).toBe('money');
    expect(classifyEvent('apply_kill_switch_engaged')).toBe('money');
  });

  it('routes convert_* writes into the money family', () => {
    expect(classifyEvent('convert_executed')).toBe('money');
  });

  it('routes adset_status_* writes (pause/unpause) into the money family', () => {
    expect(classifyEvent('adset_status_executed')).toBe('money');
    expect(classifyEvent('adset_status_deduped')).toBe('money');
  });

  it('routes the audit event into the settings family', () => {
    expect(classifyEvent('setting_changed')).toBe('settings');
  });

  it('routes cycle_* and everything else into the cycles family', () => {
    expect(classifyEvent('cycle_complete')).toBe('cycles');
    expect(classifyEvent('cycle_skipped')).toBe('cycles');
    expect(classifyEvent('ingest_malformed_snapshots_skipped')).toBe('cycles');
  });
});

describe('matchesFamily', () => {
  it('passes every row when the filter is all', () => {
    expect(matchesFamily(row({ event: 'apply_executed' }), 'all')).toBe(true);
    expect(matchesFamily(row({ event: 'setting_changed' }), 'all')).toBe(true);
  });

  it('narrows to a single family otherwise', () => {
    expect(matchesFamily(row({ event: 'apply_executed' }), 'money')).toBe(true);
    expect(matchesFamily(row({ event: 'apply_executed' }), 'cycles')).toBe(false);
    expect(matchesFamily(row({ event: 'setting_changed' }), 'settings')).toBe(true);
  });
});

describe('distinctPortfolioNames', () => {
  it('returns sorted, de-duped, non-null names', () => {
    const rows = [
      row({ portfolio_name: 'Retargeting' }),
      row({ portfolio_name: 'Prospecting' }),
      row({ portfolio_name: 'Prospecting' }),
      row({ portfolio_name: null }),
    ];
    expect(distinctPortfolioNames(rows)).toEqual(['Prospecting', 'Retargeting']);
  });
});

describe('filterLogs', () => {
  const rows = [
    row({ id: 1, event: 'apply_executed', portfolio_name: 'Prospecting' }),
    row({ id: 2, event: 'setting_changed', portfolio_name: 'Prospecting' }),
    row({ id: 3, event: 'cycle_complete', portfolio_name: 'Retargeting' }),
  ];

  it('filters by family and portfolio together', () => {
    expect(
      filterLogs(rows, { family: 'money', portfolio: ALL_PORTFOLIOS }).map((r) => r.id),
    ).toEqual([1]);
    expect(filterLogs(rows, { family: 'all', portfolio: 'Prospecting' }).map((r) => r.id)).toEqual([
      1, 2,
    ]);
    expect(
      filterLogs(rows, { family: 'settings', portfolio: 'Retargeting' }).map((r) => r.id),
    ).toEqual([]);
  });
});

describe('familyCounts', () => {
  it('counts each family and the grand total', () => {
    const rows = [
      row({ event: 'apply_executed' }),
      row({ event: 'apply_deduped' }),
      row({ event: 'setting_changed' }),
      row({ event: 'cycle_complete' }),
    ];
    expect(familyCounts(rows)).toEqual({ all: 4, money: 2, settings: 1, cycles: 1 });
  });
});

describe('readMoneyMove', () => {
  it('reads prior/target/actor/receipt from an apply_executed row', () => {
    const move = readMoneyMove({
      portfolio: 'p',
      adsetId: 'a',
      priorMinor: 500000,
      targetMinor: 450000,
      authorizedKind: 'autopilot',
      fbtraceId: 'AbC123trace',
    });
    expect(move).toEqual({
      prior: 500000,
      target: 450000,
      priorStatus: null,
      targetStatus: null,
      actorKind: 'autopilot',
      receipt: 'AbC123trace',
    });
  });

  it('tolerates a null prior (first write) and numeric-string values', () => {
    const move = readMoneyMove({ priorMinor: null, targetMinor: '45000' });
    expect(move).toEqual({
      prior: null,
      target: 45000,
      priorStatus: null,
      targetStatus: null,
      actorKind: null,
      receipt: null,
    });
  });

  it('reads the status transition from an adset_status_executed row', () => {
    const move = readMoneyMove({
      portfolio: 'p',
      adsetId: 'a',
      priorStatus: 'ACTIVE',
      targetStatus: 'PAUSED',
      authorizedKind: 'human',
      fbtraceId: 'PauseTrace1',
    });
    expect(move).toEqual({
      prior: null,
      target: null,
      priorStatus: 'ACTIVE',
      targetStatus: 'PAUSED',
      actorKind: 'human',
      receipt: 'PauseTrace1',
    });
  });

  it('returns null when no budget/status/receipt fields are present', () => {
    expect(readMoneyMove({ portfolio: 'p', detail: 'nothing to render' })).toBeNull();
  });
});

describe('readSettingChange', () => {
  it('reads setting/from/to/by/note from a setting_changed row', () => {
    const change = readSettingChange({
      setting: 'apply_mode',
      from: 'recommend',
      to: 'autopilot',
      by: 'duane@continuumai.agency',
      note: 'armed after soak',
    });
    expect(change).toEqual({
      setting: 'apply_mode',
      from: 'recommend',
      to: 'autopilot',
      by: 'duane@continuumai.agency',
      note: 'armed after soak',
    });
  });

  it('tolerates a null from (arming from an unset value) and a stripped note', () => {
    const change = readSettingChange({ setting: 'autopilot_paused', from: null, to: 'true' });
    expect(change).toEqual({
      setting: 'autopilot_paused',
      from: null,
      to: 'true',
      by: null,
      note: null,
    });
  });

  it('returns null when the setting key is absent', () => {
    expect(readSettingChange({ from: 'a', to: 'b' })).toBeNull();
  });
});
