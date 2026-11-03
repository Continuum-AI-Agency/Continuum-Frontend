import { describe, expect, it } from 'bun:test';
import { landedWriteOf, type MutationRecord, revertedAuditOf, writeStands } from './landedWrite';

/** Vivo 47's G03 recommendation: EKATAR 1,179 → 1,473.75 MXN/day. */
const REC = '099715be-19c7-4c04-9cac-1e416391498a';
const AUDIT = '0f0f0f0f-0000-4000-8000-000000000001';

const apply = (
  dryRun: boolean,
  status: string,
  submittedAt: number,
  recommendationId = REC,
): MutationRecord => ({
  variables: { portfolio_id: 'p', actions: [], dryRun, recommendation_id: recommendationId },
  data: {
    ok: status !== 'refused',
    dryRun,
    results: [{ status, kind: 'set_budget', legs: [{ status, auditId: AUDIT }] }],
  },
  submittedAt,
});

const undo = (dryRun: boolean, status: string, submittedAt: number): MutationRecord => ({
  variables: { portfolio_id: 'p', audit_id: AUDIT, dryRun },
  data: { ok: true, dryRun, result: { status, audit_id: AUDIT } },
  submittedAt,
});

describe('landedWriteOf', () => {
  it('reads a real write the platform took, with the audit an undo names', () => {
    expect(landedWriteOf(apply(false, 'applied', 2), REC)).toEqual({
      auditId: AUDIT,
      submittedAt: 2,
    });
    expect(landedWriteOf(apply(false, 'scheduled', 2), REC)?.auditId).toBe(AUDIT);
  });

  it('never reads a dry run, a refusal, another recommendation or an unknown shape as landed', () => {
    expect(landedWriteOf(apply(true, 'would_apply', 1), REC)).toBeNull();
    expect(landedWriteOf(apply(false, 'refused', 1), REC)).toBeNull();
    expect(landedWriteOf(apply(false, 'applied', 1, 'another'), REC)).toBeNull();
    expect(landedWriteOf({ variables: null, data: null, submittedAt: 1 }, REC)).toBeNull();
    expect(
      landedWriteOf(
        { variables: { dryRun: false, recommendation_id: REC }, data: {}, submittedAt: 1 },
        REC,
      ),
    ).toBeNull();
  });
});

describe('revertedAuditOf', () => {
  it('reads the audit a real undo put back, and nothing for a check or a conflict', () => {
    expect(revertedAuditOf(undo(false, 'reverted', 3))).toBe(AUDIT);
    expect(revertedAuditOf(undo(true, 'would_revert', 3))).toBeNull();
    expect(revertedAuditOf(undo(false, 'conflict', 3))).toBeNull();
  });
});

describe('writeStands', () => {
  it('holds once the write landed', () => {
    expect(writeStands([apply(true, 'would_apply', 1), apply(false, 'applied', 2)], REC)).toBe(
      true,
    );
  });

  it('falls once the undo landed', () => {
    expect(
      writeStands(
        [apply(false, 'applied', 2), undo(true, 'would_revert', 3), undo(false, 'reverted', 4)],
        REC,
      ),
    ).toBe(false);
  });

  it('does not hold when nothing landed for this recommendation', () => {
    expect(writeStands([apply(false, 'applied', 2, 'another')], REC)).toBe(false);
    expect(writeStands([], REC)).toBe(false);
  });
});
