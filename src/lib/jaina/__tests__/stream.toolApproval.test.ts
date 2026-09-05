/**
 * A NON-scaffold gate, folded through the real parser and reducer.
 *
 * `stream.scaffold.test.ts` already proves the three frame types parse off the wire;
 * this file proves the reducer is genuinely generic — that an `audience_group_publish`
 * pause reaches `pendingToolApprovals` exactly once, is not confused with a scaffold,
 * and clears on either terminal frame. The card renders off that list, so a dropped
 * entry is an approval nobody can answer.
 */

import { describe, expect, it } from 'bun:test';
import {
  createInitialJainaStreamState,
  type JainaStreamState,
  parseJainaStreamEvent,
  reduceJainaStreamEvent,
} from '../stream';

const GROUP_VERSION_ID = '33333333-3333-4333-8333-333333333333';

const fold = (frames: Record<string, unknown>[]): JainaStreamState =>
  frames.reduce<JainaStreamState>((state, frame) => {
    const parsed = parseJainaStreamEvent(JSON.stringify(frame));
    expect(parsed).not.toBeNull();
    return reduceJainaStreamEvent(state, parsed as NonNullable<typeof parsed>);
  }, createInitialJainaStreamState());

const approvalRequired = (overrides: Record<string, unknown> = {}) => ({
  type: 'tool.approval_required',
  data: {
    approvalId: 'appr_aud_1',
    toolCallId: 'call_1',
    toolName: 'audience_group_publish',
    input: { group_version_id: GROUP_VERSION_ID, content_hash: 'b'.repeat(64) },
    expiresAt: '2099-01-01T00:00:00.000Z',
    ...overrides,
  },
});

describe('a non-scaffold gate pauses the turn', () => {
  it('yields exactly one pending approval, carrying the exact proposed input', () => {
    const state = fold([approvalRequired()]);

    expect(state.pendingToolApprovals).toHaveLength(1);
    const [approval] = state.pendingToolApprovals;
    expect(approval?.toolName).toBe('audience_group_publish');
    expect(approval?.approvalId).toBe('appr_aud_1');
    expect(approval?.input).toEqual({
      group_version_id: GROUP_VERSION_ID,
      content_hash: 'b'.repeat(64),
    });
    // The card branches on this prefix; a scaffold match here would render the wrong card.
    expect(approval?.toolName.startsWith('paid_scaffold_')).toBe(false);
  });

  it('stays at one across a replay of the same frame', () => {
    expect(fold([approvalRequired(), approvalRequired()]).pendingToolApprovals).toHaveLength(1);
  });

  it('clears once the resume resolves it', () => {
    const state = fold([
      approvalRequired(),
      {
        type: 'tool.approval_resolved',
        data: { approvalId: 'appr_aud_1', toolCallId: 'call_1', decision: 'approved' },
      },
    ]);

    expect(state.pendingToolApprovals).toHaveLength(0);
    expect(state.resolvedApprovals.appr_aud_1?.decision).toBe('approved');
  });

  it('clears on a denial and records that nothing ran', () => {
    const state = fold([
      approvalRequired(),
      {
        type: 'tool.output_denied',
        data: {
          toolCallId: 'call_1',
          toolName: 'audience_group_publish',
          approvalId: 'appr_aud_1',
          reason: 'Denied by the user.',
        },
      },
    ]);

    expect(state.pendingToolApprovals).toHaveLength(0);
    expect(state.deniedToolOutputs).toHaveLength(1);
    expect(state.deniedToolOutputs[0]?.toolName).toBe('audience_group_publish');
  });

  it('keeps a scaffold gate and a tool gate apart in the same turn', () => {
    const state = fold([
      approvalRequired(),
      approvalRequired({
        approvalId: 'appr_scaffold_1',
        toolName: 'paid_scaffold_build',
        input: { scaffold_version_id: '11111111-1111-4111-8111-111111111111' },
      }),
    ]);

    expect(state.pendingToolApprovals).toHaveLength(2);
    expect(
      state.pendingToolApprovals.filter((entry) => !entry.toolName.startsWith('paid_scaffold_')),
    ).toHaveLength(1);
  });
});
