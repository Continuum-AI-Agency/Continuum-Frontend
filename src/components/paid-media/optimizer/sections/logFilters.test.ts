import { describe, expect, it } from 'bun:test';
import {
  ALL_PORTFOLIOS,
  distinctPortfolioNames,
  filterByPortfolio,
  readLifecycleRow,
} from './logFilters';

const row = (event: string, fields: Record<string, unknown> = {}) => ({ event, fields });

describe('distinctPortfolioNames', () => {
  it('returns sorted, de-duped, non-null names', () => {
    expect(
      distinctPortfolioNames([
        { portfolio_name: 'Retargeting' },
        { portfolio_name: 'Prospecting' },
        { portfolio_name: 'Retargeting' },
        { portfolio_name: null },
      ]),
    ).toEqual(['Prospecting', 'Retargeting']);
  });
});

describe('filterByPortfolio', () => {
  const rows = [
    { id: 1, portfolio_name: 'Prospecting' },
    { id: 2, portfolio_name: 'Retargeting' },
    { id: 3, portfolio_name: null },
  ];

  it('passes everything through for the all-portfolios sentinel', () => {
    expect(filterByPortfolio(rows, ALL_PORTFOLIOS)).toHaveLength(3);
  });

  it('narrows to one portfolio', () => {
    expect(filterByPortfolio(rows, 'Retargeting').map((r) => r.id)).toEqual([2]);
  });
});

describe('readLifecycleRow gives each lifecycle event a shape', () => {
  it('reads a completed cycle as its counts, in a fixed order, absent ones dropped', () => {
    const read = readLifecycleRow(
      row('cycle_complete', {
        portfolioId: 'p1',
        snapshotCount: 12,
        recommendations: 2,
        applied: 3,
        held: 1,
        deduped: 0,
        failed: 0,
      }),
    );
    expect(read.title).toBe('Cycle complete');
    expect(read.facts.map((f) => f.label)).toEqual([
      'Ad sets scored',
      'Recommendations',
      'Applied',
      'Held for approval',
      'Already applied',
      'Failed',
    ]);
    expect(read.facts[0]?.value).toBe('12');
  });

  it('drops a count the row does not carry rather than printing a zero it never reported', () => {
    const read = readLifecycleRow(row('cycle_complete', { applied: 2 }));
    expect(read.facts.map((f) => f.label)).toEqual(['Applied']);
  });

  // A cycle that ran but skipped reports it on the SAME event; calling that "complete · 0
  // applied" would be a lie of omission.
  it('reads a cycle_complete carrying a skip reason as a skip', () => {
    const read = readLifecycleRow(row('cycle_complete', { skipped: 'no_adsets', applied: 0 }));
    expect(read.title).toBe('Cycle skipped');
    expect(read.summary).toContain('Nothing is enrolled');
    expect(read.facts).toEqual([]);
  });

  it('explains each skip reason in words', () => {
    expect(readLifecycleRow(row('cycle_skipped', { reason: 'no_snapshots' })).summary).toContain(
      'No performance snapshots',
    );
    expect(readLifecycleRow(row('cycle_skipped', { reason: 'brand_new' })).summary).toBe(
      'Skipped: brand_new.',
    );
    expect(readLifecycleRow(row('cycle_skipped')).summary).toBeNull();
  });

  it('surfaces the error on a failed cycle instead of hiding it in a fields bag', () => {
    const read = readLifecycleRow(row('cycle_failed', { error: 'Error: Meta token expired' }));
    expect(read.title).toBe('Cycle failed');
    expect(read.summary).toBe('Error: Meta token expired');
  });

  it('names the drifted ad sets, since an operator cannot act on an id alone', () => {
    const read = readLifecycleRow(
      row('roster_drift_detected', {
        seen: 8,
        missing: 2,
        adsets: [
          { id: '120251', name: 'Lookalike 1%' },
          { id: '120252', name: null },
        ],
      }),
    );
    expect(read.title).toBe('Roster drift');
    expect(read.summary).toContain('2 enrolled ad sets');
    expect(read.facts.map((f) => f.label)).toEqual(['Still present', 'Missing']);
    expect(read.detail).toEqual(['Lookalike 1% (120251)', '120252']);
  });

  it('lists the per-item failures on a partial apply failure', () => {
    const read = readLifecycleRow(
      row('apply_partial_failure', {
        applied: 3,
        failed: 1,
        failures: [{ adsetId: 'as-9', error: 'rate limited' }],
      }),
    );
    expect(read.title).toBe('Some writes failed');
    expect(read.facts.map((f) => f.value)).toEqual(['3', '1']);
    expect(read.detail).toEqual(['as-9: rate limited']);
  });

  it('reports a persist failure with the error the service recorded', () => {
    expect(readLifecycleRow(row('apply_results_persist_failed', { error: 'timeout' })).summary).toBe(
      'timeout',
    );
  });

  it('quantifies dropped snapshot rows', () => {
    const read = readLifecycleRow(
      row('ingest_malformed_snapshots_skipped', { malformed: 3, total: 40 }),
    );
    expect(read.summary).toContain('3 of 40');
  });

  // The DB feed is a DENYLIST of the action family, so a lifecycle event added tomorrow
  // reaches this page with no migration and no FE change. It must still read as something.
  it('humanizes an event it has never seen rather than printing key: value soup', () => {
    const read = readLifecycleRow(row('scheduler_lease_reclaimed', { error: 'lease expired' }));
    expect(read.title).toBe('Scheduler lease reclaimed');
    expect(read.summary).toBe('lease expired');
    expect(read.facts).toEqual([]);
  });

  it('tolerates a row with no fields at all', () => {
    expect(readLifecycleRow({ event: 'cycle_complete' }).facts).toEqual([]);
  });
});
