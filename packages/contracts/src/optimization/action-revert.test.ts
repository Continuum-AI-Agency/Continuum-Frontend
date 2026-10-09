import { describe, expect, test } from 'bun:test';
import {
  ActionRevertRequestSchema,
  ActionRevertResponseSchema,
  ActionRevertServiceRequestSchema,
} from './action-revert';

const PORTFOLIO = '5aaf5931-7407-4940-aab6-52e914bced45';
const AUDIT = '0f0f0f0f-0000-4000-8000-000000000001';
const PERSON = '0b0b0b0b-0000-4000-8000-0000000000b1';
const RUN = '0c0c0c0c-0000-4000-8000-000000000001';

const campaign = {
  platform: 'google_ads',
  level: 'campaign',
  nativeLevel: 'campaign',
  id: '20249528111',
  accountId: '5251780631',
} as const;

describe('ActionRevertRequestSchema — the browser names one applied write to undo', () => {
  test('portfolio and audit ids; dryRun optional', () => {
    expect(ActionRevertRequestSchema.parse({ portfolio_id: PORTFOLIO, audit_id: AUDIT })).toEqual({
      portfolio_id: PORTFOLIO,
      audit_id: AUDIT,
    });
  });

  test('the browser cannot name who authorized it: authorized_by is the edge’s to fill', () => {
    const parsed = ActionRevertRequestSchema.safeParse({
      portfolio_id: PORTFOLIO,
      audit_id: AUDIT,
      authorized_by: PERSON,
    });
    expect(parsed.success).toBe(false);
  });

  test('ids must be uuids', () => {
    expect(
      ActionRevertRequestSchema.safeParse({ portfolio_id: 'x', audit_id: AUDIT }).success,
    ).toBe(false);
  });
});

describe('ActionRevertServiceRequestSchema — what the edge forwards to the service', () => {
  test('previews by default: a real undo is sent as dryRun false', () => {
    const parsed = ActionRevertServiceRequestSchema.parse({
      portfolio_id: PORTFOLIO,
      audit_id: AUDIT,
      authorized_by: PERSON,
    });
    expect(parsed.dryRun).toBe(true);
  });

  test('a person answers for every undo', () => {
    expect(
      ActionRevertServiceRequestSchema.safeParse({ portfolio_id: PORTFOLIO, audit_id: AUDIT })
        .success,
    ).toBe(false);
  });
});

describe('ActionRevertResponseSchema', () => {
  test('a landed undo names the revert row and what it put back', () => {
    const parsed = ActionRevertResponseSchema.parse({
      ok: true,
      dryRun: false,
      runId: RUN,
      result: {
        status: 'reverted',
        audit_id: AUDIT,
        revert_audit_id: '0f0f0f0f-0000-4000-8000-000000000002',
        kind: 'set_budget',
        ref: campaign,
        restores: { minor: 10_000, currency: 'MXN' },
        receipt: { platform: 'google_ads', requestId: 'r', resourceNames: [] },
      },
    });
    expect(parsed.result.status).toBe('reverted');
  });

  test('a conflict carries no revert row and says what it read', () => {
    const parsed = ActionRevertResponseSchema.parse({
      ok: false,
      dryRun: true,
      runId: RUN,
      result: {
        status: 'conflict',
        audit_id: AUDIT,
        revert_audit_id: null,
        kind: 'set_bid_target',
        ref: campaign,
        restores: { field: 'target_cpa_micros', value: 50_000_000 },
        reason: 'conflict',
        detail: 'target_cpa_micros reads 52000000; the write left 51000000',
      },
    });
    expect(parsed.result.restores).toEqual({ field: 'target_cpa_micros', value: 50_000_000 });
  });

  test('removing created criteria restores by naming them', () => {
    const parsed = ActionRevertResponseSchema.parse({
      ok: true,
      dryRun: true,
      runId: RUN,
      result: {
        status: 'would_revert',
        audit_id: AUDIT,
        revert_audit_id: null,
        kind: 'add_keyword',
        ref: { ...campaign, level: 'group', nativeLevel: 'ad_group', id: '1' },
        restores: { removes: ['customers/5251780631/adGroupCriteria/1~2'] },
      },
    });
    expect(parsed.result.kind).toBe('add_keyword');
  });

  test('a refusal before anything is known has no kind, ref or restores', () => {
    expect(
      ActionRevertResponseSchema.safeParse({
        ok: false,
        dryRun: true,
        runId: RUN,
        result: {
          status: 'refused',
          audit_id: AUDIT,
          revert_audit_id: null,
          kind: null,
          ref: null,
          restores: null,
          reason: 'audit_not_found',
          detail: 'no apply_audits row on this portfolio',
        },
      }).success,
    ).toBe(true);
  });

  test('an unknown status is refused', () => {
    expect(
      ActionRevertResponseSchema.safeParse({
        ok: true,
        dryRun: false,
        runId: RUN,
        result: {
          status: 'undone',
          audit_id: AUDIT,
          revert_audit_id: null,
          kind: null,
          ref: null,
          restores: null,
        },
      }).success,
    ).toBe(false);
  });
});
