/**
 * Paid scaffold + tool approval frames, folded through the real parser and reducer.
 *
 * The first test is the one that earns its keep: it proves each frame PARSES OFF THE
 * WIRE. A frame type added to the type union but forgotten in the runtime `z.union`
 * is dropped by `parseJainaStreamEventValue` with a `console.warn` and nothing else
 * fails — no type error, no runtime error, no failing build. This is the only thing
 * standing between that mistake and production.
 */

import { describe, expect, it } from 'bun:test';
import {
  createInitialJainaStreamState,
  hasRenderableStreamContent,
  type JainaStreamState,
  parseJainaStreamEvent,
  reduceJainaStreamEvent,
} from '../stream';

const VERSION_ID = '11111111-1111-4111-8111-111111111111';

const fold = (frames: Record<string, unknown>[]): JainaStreamState =>
  frames.reduce<JainaStreamState>((state, frame) => {
    const parsed = parseJainaStreamEvent(JSON.stringify(frame));
    expect(parsed).not.toBeNull();
    return reduceJainaStreamEvent(state, parsed as NonNullable<typeof parsed>);
  }, createInitialJainaStreamState());

const approvalRequired = (approvalId = 'appr_1') => ({
  type: 'tool.approval_required',
  data: {
    approvalId,
    toolCallId: 'call_1',
    toolName: 'paid_scaffold_build',
    input: { scaffold_version_id: VERSION_ID, content_hash: 'a'.repeat(64) },
    expiresAt: '2026-07-30T12:15:00.000Z',
  },
});

const proposed = (scaffoldId = VERSION_ID) => ({
  type: 'paid.scaffold_proposed',
  data: {
    scaffoldId,
    parentScaffoldId: '22222222-2222-4222-8222-222222222222',
    brandId: 'brand-1',
    adAccountId: 'act_1',
    plan: { source: 'paid_scaffold_nodes', truncated: true },
    summary: { campaigns: 1, adSets: 50, ads: 150 },
  },
});

const progress = (pathKey: string, status: string, extra: Record<string, unknown> = {}) => ({
  type: 'paid.scaffold_progress',
  data: {
    scaffoldId: VERSION_ID,
    pathKey,
    step: 'adset',
    status,
    total: 51,
    entityId: null,
    ...extra,
  },
});

describe('scaffold frames reach the reducer at all', () => {
  const frames = [
    approvalRequired(),
    {
      type: 'tool.approval_resolved',
      data: { approvalId: 'appr_1', toolCallId: 'call_1', decision: 'approved' },
    },
    { type: 'tool.output_denied', data: { toolCallId: 'call_1', toolName: 'paid_scaffold_build' } },
    proposed(),
    progress('c0/a1', 'started'),
    {
      type: 'paid.scaffold_receipt',
      data: { scaffoldId: VERSION_ID, status: 'completed' },
    },
  ];

  for (const frame of frames) {
    it(`parses ${frame.type} instead of dropping it`, () => {
      expect(parseJainaStreamEvent(JSON.stringify(frame))).not.toBeNull();
    });
  }
});

describe('tool approvals', () => {
  it('dedupes a repeated approval_required on approvalId', () => {
    const state = fold([approvalRequired(), approvalRequired()]);
    expect(state.pendingToolApprovals).toHaveLength(1);
  });

  it('moves an approval from pending to resolved', () => {
    const state = fold([
      approvalRequired(),
      {
        type: 'tool.approval_resolved',
        data: {
          approvalId: 'appr_1',
          toolCallId: 'call_1',
          decision: 'approved',
          resolvedBy: 'user-1',
        },
      },
    ]);
    expect(state.pendingToolApprovals).toHaveLength(0);
    expect(state.resolvedApprovals.appr_1?.decision).toBe('approved');
  });

  it('does not resurrect an approval when the log replays required AFTER resolved', () => {
    // The projection re-folds the whole durable log, so out-of-order delivery is the
    // normal case. Without the resolved-guard the Approve buttons would come back.
    const state = fold([
      {
        type: 'tool.approval_resolved',
        data: { approvalId: 'appr_1', toolCallId: 'call_1', decision: 'denied' },
      },
      approvalRequired(),
    ]);
    expect(state.pendingToolApprovals).toHaveLength(0);
  });

  it('clears the pending approval a tool.output_denied names', () => {
    const state = fold([
      approvalRequired(),
      {
        type: 'tool.output_denied',
        data: { toolCallId: 'call_1', toolName: 'paid_scaffold_build', approvalId: 'appr_1' },
      },
    ]);
    expect(state.pendingToolApprovals).toHaveLength(0);
    expect(state.deniedToolOutputs).toHaveLength(1);
  });

  it('leaves pending approvals alone when output_denied names none (resume case)', () => {
    const state = fold([
      approvalRequired(),
      { type: 'tool.output_denied', data: { toolCallId: 'call_9', toolName: 'other_tool' } },
    ]);
    expect(state.pendingToolApprovals).toHaveLength(1);
  });
});

describe('scaffold progress folds per node', () => {
  it('keeps ONE entry per node however many frames arrive for it', () => {
    const state = fold([
      proposed(),
      progress('c0/a1', 'started'),
      progress('c0/a1', 'succeeded', { entityId: '120000000001' }),
      progress('c0/a1', 'succeeded', { entityId: '120000000001' }),
    ]);
    expect(Object.keys(state.scaffold?.progressByNode ?? {})).toHaveLength(1);
    expect(state.scaffold?.progressByNode['c0/a1']?.status).toBe('succeeded');
    expect(state.scaffold?.progressByNode['c0/a1']?.entityId).toBe('120000000001');
  });

  it('holds 50 distinct ad sets without collapsing them', () => {
    const frames = [proposed()];
    for (let index = 1; index <= 50; index += 1) {
      frames.push(progress(`c0/a${index}`, 'started', { index }));
      frames.push(progress(`c0/a${index}`, 'succeeded', { index, entityId: `id_${index}` }));
    }
    const state = fold(frames);
    expect(Object.keys(state.scaffold?.progressByNode ?? {})).toHaveLength(50);
  });

  it('ignores progress for a different scaffold', () => {
    const state = fold([
      proposed(),
      {
        type: 'paid.scaffold_progress',
        data: { scaffoldId: 'other', step: 'adset', status: 'started' },
      },
    ]);
    expect(Object.keys(state.scaffold?.progressByNode ?? {})).toHaveLength(0);
  });

  it('keeps progress when the same proposal replays, and resets it for a new one', () => {
    const kept = fold([proposed(), progress('c0/a1', 'succeeded'), proposed()]);
    expect(Object.keys(kept.scaffold?.progressByNode ?? {})).toHaveLength(1);

    const reset = fold([
      proposed(),
      progress('c0/a1', 'succeeded'),
      proposed('33333333-3333-4333-8333-333333333333'),
    ]);
    expect(Object.keys(reset.scaffold?.progressByNode ?? {})).toHaveLength(0);
  });
});

describe('renderability', () => {
  it('treats a scaffold-only turn as renderable, not as an error', () => {
    const state = fold([proposed(), approvalRequired()]);
    expect(hasRenderableStreamContent(state)).toBe(true);
  });

  it('treats an approval-only turn as renderable', () => {
    const state = fold([approvalRequired()]);
    expect(hasRenderableStreamContent(state)).toBe(true);
  });

  it('still reports an empty turn as unrenderable', () => {
    expect(hasRenderableStreamContent(createInitialJainaStreamState())).toBe(false);
  });
});

describe('receipt', () => {
  it('lands on the scaffold it names', () => {
    const state = fold([
      proposed(),
      {
        type: 'paid.scaffold_receipt',
        data: {
          scaffoldId: VERSION_ID,
          status: 'partial',
          unrecordedMetaObjectIds: ['120000000009'],
        },
      },
    ]);
    expect(state.scaffold?.receipt?.status).toBe('partial');
    expect((state.scaffold?.receipt as Record<string, unknown>).unrecordedMetaObjectIds).toEqual([
      '120000000009',
    ]);
  });
});
