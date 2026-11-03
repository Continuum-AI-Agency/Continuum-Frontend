import { describe, expect, it } from 'bun:test';
import { homeReadMissing, homeReadReady } from './envelope';
import {
  type HomeOvernightLogData,
  homeOvernightEntrySchema,
  homeOvernightLogDataSchema,
  homeOvernightLogReadSchema,
} from './overnightLog';

const BRAND = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';
const PORTFOLIO = 'a7000000-0000-4000-8000-000000000001';

const failedEntry = {
  id: 'a7000000-0000-4000-8000-000000000102',
  at: '2026-11-03T06:10:00.000Z',
  source: 'apply_audit',
  kind: 'budget',
  title: 'MENSAJES // TODOS',
  entityId: '20249528111',
  entityName: 'MENSAJES // TODOS',
  outcome: 'failed',
  outcomeReason: 'RESOURCE_EXHAUSTED: quota exceeded for the customer',
  portfolioId: PORTFOLIO,
  portfolioName: 'Easy Fit',
  platform: 'google_ads',
  actor: 'human',
  change: { fromMinor: 80000, toMinor: 90000, currency: 'MXN', fromStatus: null, toStatus: null },
  justification: null,
} as const;

const data: HomeOvernightLogData = {
  window: { since: '2026-11-02T12:00:00.000Z', until: '2026-11-03T12:00:00.000Z', hours: 24 },
  entries: [failedEntry],
  counts: {
    applied: 0,
    failed: 1,
    paused: 0,
    createdPaused: 0,
    pendingApproval: 0,
    queued: 0,
    undone: 0,
    skipped: 0,
    skippedByCap: 1,
  },
  bySource: {
    applyAudit: 1,
    cycleItem: 0,
    actionLedger: 0,
    recommendation: 0,
    audienceProposal: 0,
  },
  total: 1,
  truncated: false,
  capSkipped: {
    count: 1,
    items: [
      {
        id: 'run-1:as-held',
        at: '2026-11-03T06:00:00.000Z',
        portfolioId: PORTFOLIO,
        platform: 'meta',
        entityId: 'as-held',
        entityName: 'LEADS // RETARGET',
        changePct: 0.6,
        capBreached: true,
        reason: 'held: |Δ| 0.6000 > cap 0.25 — needs approval',
      },
    ],
  },
  source: {
    kind: 'public.optimizer_list_action_outcomes',
    ref: null,
    since: '2026-11-02T12:00:00.000Z',
    until: '2026-11-03T12:00:00.000Z',
  },
};

describe('home overnight log contract', () => {
  it('accepts a ready log with a failed action and a cap-held move', () => {
    const parsed = homeOvernightLogReadSchema.parse(homeReadReady(BRAND, data));
    expect(parsed.state).toBe('ready');
  });

  it('accepts a missing answer that says the migration is not deployed', () => {
    const parsed = homeOvernightLogReadSchema.parse(
      homeReadMissing(BRAND, 'not_deployed', 'optimizer_list_action_outcomes is not deployed yet.'),
    );
    expect(parsed.state).toBe('missing');
  });

  it('refuses an outcome outside the vocabulary', () => {
    expect(homeOvernightEntrySchema.safeParse({ ...failedEntry, outcome: 'done' }).success).toBe(
      false,
    );
  });

  it('refuses a timestamp that is not an ISO instant', () => {
    expect(homeOvernightEntrySchema.safeParse({ ...failedEntry, at: 'last night' }).success).toBe(
      false,
    );
  });

  it('refuses a currency that is not an ISO code', () => {
    const change = { ...failedEntry.change, currency: 'pesos' };
    expect(homeOvernightEntrySchema.safeParse({ ...failedEntry, change }).success).toBe(false);
  });

  it('refuses a window longer than a week', () => {
    const window = { ...data.window, hours: 169 };
    expect(homeOvernightLogDataSchema.safeParse({ ...data, window }).success).toBe(false);
  });

  it('refuses a negative count', () => {
    const counts = { ...data.counts, failed: -1 };
    expect(homeOvernightLogDataSchema.safeParse({ ...data, counts }).success).toBe(false);
  });
});
