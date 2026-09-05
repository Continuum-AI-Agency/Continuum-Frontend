import { describe, expect, it } from 'bun:test';
import { jainaScaffoldActionSchema, jainaToolActionSchema } from './jaina-scaffold';

describe('jainaToolActionSchema', () => {
  it('accepts a bare decision on an approval id', () => {
    const parsed = jainaToolActionSchema.parse({ decision: 'approve', approval_id: 'appr_1' });
    expect(parsed).toEqual({ decision: 'approve', approval_id: 'appr_1' });
  });

  it('carries the optional correlation id and a bounded reason', () => {
    expect(
      jainaToolActionSchema.safeParse({
        decision: 'deny',
        approval_id: 'appr_1',
        tool_call_id: 'call_1',
        reason: 'not now',
      }).success,
    ).toBe(true);
    expect(
      jainaToolActionSchema.safeParse({
        decision: 'deny',
        approval_id: 'appr_1',
        reason: 'x'.repeat(501),
      }).success,
    ).toBe(false);
  });

  it('rejects an empty approval id and any decision outside approve/deny', () => {
    expect(jainaToolActionSchema.safeParse({ decision: 'approve', approval_id: '' }).success).toBe(
      false,
    );
    expect(jainaToolActionSchema.safeParse({ decision: 'maybe', approval_id: 'a' }).success).toBe(
      false,
    );
  });

  it('names no subject: the gate row is found by approval id alone', () => {
    // The scaffold action keys its row by (version, gate); the generic one must not
    // grow a subject field, or a client could steer a decision onto another row.
    expect(Object.keys(jainaToolActionSchema.shape).sort()).toEqual([
      'approval_id',
      'decision',
      'reason',
      'tool_call_id',
    ]);
    expect(Object.keys(jainaScaffoldActionSchema.shape)).toContain('scaffold_version_id');
  });

  it('carries no token, hash or signature on the wire', () => {
    for (const key of ['approval_token', 'content_hash', 'signature']) {
      expect(key in jainaToolActionSchema.shape).toBe(false);
    }
  });
});
