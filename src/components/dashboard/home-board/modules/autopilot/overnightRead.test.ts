import { describe, expect, it } from 'bun:test';
import type { HomeOvernightEntry, HomeOvernightLogData } from '@continuum/contracts';
import { capItemLine, overnightCountsLine, overnightRowsOfRead } from './overnightRead';

const entry = (over: Partial<HomeOvernightEntry> = {}): HomeOvernightEntry => ({
  id: 'e1',
  at: '2026-11-04T07:00:05.002Z',
  source: 'apply_audit',
  kind: 'budget',
  title: 'Search | Octubre',
  entityId: '123',
  entityName: 'Search | Octubre',
  outcome: 'applied',
  outcomeReason: null,
  portfolioId: null,
  portfolioName: 'Leads',
  platform: 'meta',
  actor: 'autopilot',
  change: null,
  justification: null,
  ...over,
});

const ZERO: HomeOvernightLogData['counts'] = {
  applied: 0,
  failed: 0,
  paused: 0,
  createdPaused: 0,
  pendingApproval: 0,
  queued: 0,
  undone: 0,
  skipped: 0,
  skippedByCap: 0,
};

describe('overnightRowsOfRead', () => {
  it('a write that failed reads failed, with the platform’s reason', () => {
    const [row] = overnightRowsOfRead([
      entry({ outcome: 'failed', outcomeReason: 'Meta refused the budget.' }),
    ]);
    expect(row?.outcome).toEqual({ kind: 'failed', label: 'Failed' });
    expect(row?.why).toBe('Meta refused the budget.');
  });

  it('every outcome the read names has its own words', () => {
    const labels = (
      [
        'applied',
        'paused',
        'created_paused',
        'pending_approval',
        'queued',
        'undone',
        'skipped',
      ] as const
    ).map((outcome) => overnightRowsOfRead([entry({ outcome })])[0]?.outcome.label);
    expect(labels).toEqual([
      'Applied',
      'Paused',
      'Created paused',
      'Waiting for approval',
      'Approved, waiting to write',
      'Undone',
      'Skipped',
    ]);
  });

  it('prints a budget change in its own currency, from minor units', () => {
    const [row] = overnightRowsOfRead([
      entry({
        change: {
          fromMinor: 22_000,
          toMinor: 27_500,
          currency: 'MXN',
          fromStatus: null,
          toStatus: null,
        },
      }),
    ]);
    expect(row?.change).toBe('Search | Octubre: $220 MXN → $275 MXN');
  });

  it('omits an amount with no recorded currency rather than assume one', () => {
    const [row] = overnightRowsOfRead([
      entry({
        change: {
          fromMinor: 22_000,
          toMinor: 27_500,
          currency: null,
          fromStatus: null,
          toStatus: null,
        },
      }),
    ]);
    expect(row?.change).toBe('Search | Octubre');
  });

  it('prints a status change', () => {
    const [row] = overnightRowsOfRead([
      entry({
        change: {
          fromMinor: null,
          toMinor: null,
          currency: null,
          fromStatus: 'ACTIVE',
          toStatus: 'PAUSED',
        },
      }),
    ]);
    expect(row?.change).toBe('Search | Octubre: ACTIVE → PAUSED');
  });

  it('a proposal with no named entity is named by its portfolio, not by a placeholder id', () => {
    const [row] = overnightRowsOfRead([
      entry({ title: 'account', entityId: 'account', entityName: null, portfolioName: 'Leads' }),
    ]);
    expect(row?.change).toBe('Leads');
  });

  it('an actor the ledger did not record stays unrecorded', () => {
    expect(overnightRowsOfRead([entry({ actor: null })])[0]?.actor).toBe('Not recorded');
    expect(overnightRowsOfRead([entry({ actor: 'human' })])[0]?.actor).toBe('A person');
  });
});

describe('overnightCountsLine', () => {
  it('says what happened, skipping what did not, with the cap apart', () => {
    expect(
      overnightCountsLine({ ...ZERO, applied: 5, failed: 1, pendingApproval: 2, skippedByCap: 3 }),
    ).toBe('5 applied · 1 failed · 2 waiting for approval · 3 skipped by cap');
  });

  it('nothing happened is the empty line', () => {
    expect(overnightCountsLine(ZERO)).toBe('');
  });
});

describe('capItemLine', () => {
  it('names the move the cap held and how big it was', () => {
    expect(
      capItemLine({
        id: 'c',
        at: '2026-11-04T07:00:05.002Z',
        portfolioId: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
        platform: 'meta',
        entityId: 'as1',
        entityName: 'Retargeting',
        changePct: 0.6,
        capBreached: true,
        reason: null,
      }),
    ).toBe('Retargeting: +60%');
  });

  it('a change the cycle did not size stays unsized', () => {
    expect(
      capItemLine({
        id: 'c',
        at: '2026-11-04T07:00:05.002Z',
        portfolioId: '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64',
        platform: 'meta',
        entityId: 'as1',
        entityName: null,
        changePct: null,
        capBreached: true,
        reason: null,
      }),
    ).toBe('as1');
  });
});
