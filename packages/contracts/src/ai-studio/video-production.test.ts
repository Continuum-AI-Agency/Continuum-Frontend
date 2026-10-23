import { describe, expect, test } from 'bun:test';
import {
  canvasNodeBindingId,
  createEditorGenerationBatchRequestSchema,
  editorProductionSummarySchema,
  parseCanvasNodeBindingId,
  restoreEditorTimelineRevisionRequestSchema,
} from './index';

describe('video production API', () => {
  test('keeps style extraction project-scoped and all media generation shot-scoped', () => {
    expect(
      createEditorGenerationBatchRequestSchema.safeParse({ kind: 'style_extract' }).success,
    ).toBe(true);
    expect(
      createEditorGenerationBatchRequestSchema.safeParse({ kind: 'frame', shotId: 'shot-1' })
        .success,
    ).toBe(true);
    expect(
      createEditorGenerationBatchRequestSchema.safeParse({ kind: 'motion_draft' }).success,
    ).toBe(false);
    expect(createEditorGenerationBatchRequestSchema.safeParse({ kind: 'narration' }).success).toBe(
      true,
    );
    expect(createEditorGenerationBatchRequestSchema.safeParse({ kind: 'music' }).success).toBe(
      true,
    );
  });

  test('exposes a compact agent and Canvas summary', () => {
    const summary = editorProductionSummarySchema.parse({
      projectId: '00000000-0000-0000-0000-000000000001',
      revision: 3,
      fingerprint: 'editor-v2-deadbeef',
      stage: 'motion_approval',
      shotCount: 2,
      approvedFrames: 2,
      approvedMotionDrafts: 1,
      approvedMasters: 0,
      activeJobs: 0,
      blockers: ['Shot 2 needs a motion keeper.'],
      nextActions: ['Review three motion candidates for Shot 2.'],
    });
    expect(summary.approvedFrames).toBe(2);
  });

  test('requires optimistic concurrency and a durable source revision for timeline undo', () => {
    expect(
      restoreEditorTimelineRevisionRequestSchema.safeParse({
        expectedRevision: 8,
        expectedFingerprint: 'editor-v2-current',
        restoreRevision: 5,
        idempotencyKey: 'undo:project:5:8',
      }).success,
    ).toBe(true);
    expect(
      restoreEditorTimelineRevisionRequestSchema.safeParse({
        expectedRevision: 8,
        restoreRevision: 5,
        idempotencyKey: 'undo:project:5:8',
      }).success,
    ).toBe(false);
  });
});

test('canvas node bindings name their room and still read the bare ids made before', () => {
  const room = 'd25d8fae-bdcc-4e6e-a1fe-e355f38daf76';
  expect(parseCanvasNodeBindingId(canvasNodeBindingId(room, 'editor'))).toEqual({
    roomId: room,
    nodeId: 'editor',
  });
  expect(parseCanvasNodeBindingId(canvasNodeBindingId(room, 'a/b'))).toEqual({
    roomId: room,
    nodeId: 'a/b',
  });
  for (const legacy of [
    'editor',
    'planner-composition:33d18308-d120-4e72-85db-6273be8c6c55:timeline',
  ]) {
    expect(parseCanvasNodeBindingId(legacy)).toEqual({ nodeId: legacy });
  }
});
