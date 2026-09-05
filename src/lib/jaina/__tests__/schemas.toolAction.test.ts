/**
 * The sibling of `schemas.scaffoldAction.test.ts`, for every gated tool that is NOT a
 * paid scaffold.
 *
 * `jainaChatRequestSchema` is a STRIPPING `z.object`, and `useJainaChatStream` parses
 * through it before `JSON.stringify`. A field that is not declared is removed with no
 * type error, no runtime error and no log line, and the Next route is a pure
 * passthrough that would not notice either — the approval would simply never arrive,
 * and the paused turn would hang until the gate expired.
 */

import { describe, expect, it } from 'bun:test';
import { jainaChatRequestSchema, jainaToolActionSchema } from '../schemas';

const baseRequest = {
  query: 'Approved.',
  context: { adAccountId: 'act_1', brandId: 'brand-1' },
};

describe('tool_action survives the request schema', () => {
  it('is retained rather than stripped', () => {
    const parsed = jainaChatRequestSchema.parse({
      ...baseRequest,
      tool_action: {
        decision: 'approve',
        approval_id: 'appr_1',
        tool_call_id: 'call_1',
      },
    });

    expect(parsed.tool_action).toEqual({
      decision: 'approve',
      approval_id: 'appr_1',
      tool_call_id: 'call_1',
    });
  });

  it('carries a deny decision and its reason', () => {
    const parsed = jainaChatRequestSchema.parse({
      ...baseRequest,
      tool_action: {
        decision: 'deny',
        approval_id: 'appr_1',
        reason: 'Wrong lookalike ratio.',
      },
    });
    expect(parsed.tool_action?.decision).toBe('deny');
    expect(parsed.tool_action?.reason).toBe('Wrong lookalike ratio.');
  });

  it('stays absent when not supplied', () => {
    expect(jainaChatRequestSchema.parse(baseRequest).tool_action).toBeUndefined();
  });

  it('does not collide with scaffold_action', () => {
    const parsed = jainaChatRequestSchema.parse({
      ...baseRequest,
      tool_action: { decision: 'approve', approval_id: 'appr_1' },
    });
    expect(parsed.scaffold_action).toBeUndefined();
  });
});

describe('the action contract refuses to carry credentials', () => {
  it('drops an approval token or signature a caller tries to smuggle in', () => {
    // The gate row is the authority and the server re-reads the token by approval_id.
    // A client that could supply one could mint its own approval.
    const parsed = jainaToolActionSchema.parse({
      decision: 'approve',
      approval_id: 'appr_1',
      approval_token: 'gate_deadbeef',
      signature: 'sig_abc',
    } as Record<string, unknown>);

    expect(parsed).not.toHaveProperty('approval_token');
    expect(parsed).not.toHaveProperty('signature');
  });

  it('rejects an unknown decision', () => {
    expect(
      jainaToolActionSchema.safeParse({ decision: 'maybe', approval_id: 'appr_1' }).success,
    ).toBe(false);
  });

  it('rejects an empty approval id — the gate row could not be found', () => {
    expect(jainaToolActionSchema.safeParse({ decision: 'approve', approval_id: '' }).success).toBe(
      false,
    );
  });
});
