/**
 * `jainaChatRequestSchema` is a STRIPPING `z.object`, and `useJainaChatStream` parses
 * through it before `JSON.stringify`. A field that is not declared is removed with no
 * type error, no runtime error and no log line, and the Next route is a pure
 * passthrough that would not notice either — the approval would simply never arrive.
 *
 * This file is small on purpose. It is the cheapest possible guard on the one line
 * that carries a human's decision to the backend.
 */

import { describe, expect, it } from 'bun:test';
import { jainaChatRequestSchema, jainaScaffoldActionSchema } from '../schemas';

const VERSION_ID = '11111111-1111-4111-8111-111111111111';

const baseRequest = {
  query: 'Approved.',
  context: { adAccountId: 'act_1', brandId: 'brand-1' },
};

describe('scaffold_action survives the request schema', () => {
  it('is retained rather than stripped', () => {
    const parsed = jainaChatRequestSchema.parse({
      ...baseRequest,
      scaffold_action: {
        decision: 'approve',
        approval_id: 'appr_1',
        scaffold_version_id: VERSION_ID,
        gate: 'build',
      },
    });

    expect(parsed.scaffold_action).toEqual({
      decision: 'approve',
      approval_id: 'appr_1',
      scaffold_version_id: VERSION_ID,
      gate: 'build',
    });
  });

  it('carries a deny decision and its reason', () => {
    const parsed = jainaChatRequestSchema.parse({
      ...baseRequest,
      scaffold_action: {
        decision: 'deny',
        approval_id: 'appr_1',
        scaffold_version_id: VERSION_ID,
        gate: 'populate',
        tool_call_id: 'call_1',
        reason: 'Wrong audience on ad set 3.',
      },
    });
    expect(parsed.scaffold_action?.decision).toBe('deny');
    expect(parsed.scaffold_action?.reason).toBe('Wrong audience on ad set 3.');
  });

  it('stays absent when not supplied', () => {
    expect(jainaChatRequestSchema.parse(baseRequest).scaffold_action).toBeUndefined();
  });
});

describe('the action contract refuses to carry credentials', () => {
  it('drops an approval token or signature a caller tries to smuggle in', () => {
    // The gate row is the authority and the server re-reads the token. A client that
    // could supply one could mint its own approval, so the schema must not carry it.
    const parsed = jainaScaffoldActionSchema.parse({
      decision: 'approve',
      approval_id: 'appr_1',
      scaffold_version_id: VERSION_ID,
      gate: 'build',
      approval_token: 'pscaf_deadbeef',
      signature: 'sig_abc',
    } as Record<string, unknown>);

    expect(parsed).not.toHaveProperty('approval_token');
    expect(parsed).not.toHaveProperty('signature');
  });

  it('rejects an unknown gate', () => {
    expect(
      jainaScaffoldActionSchema.safeParse({
        decision: 'approve',
        approval_id: 'appr_1',
        scaffold_version_id: VERSION_ID,
        gate: 'launch',
      }).success,
    ).toBe(false);
  });

  it('rejects a non-uuid scaffold version id', () => {
    expect(
      jainaScaffoldActionSchema.safeParse({
        decision: 'approve',
        approval_id: 'appr_1',
        scaffold_version_id: 'not-a-uuid',
        gate: 'build',
      }).success,
    ).toBe(false);
  });
});
