import { describe, expect, test } from 'bun:test';
import {
  createEditorGenerationBatchRequestSchema,
  editorProductionSummarySchema,
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
